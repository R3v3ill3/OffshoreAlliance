/**
 * Server-side survey session runtime (brief §4.1) — the I/O layer
 * around the pure engine in `survey-engine.ts`. Shared by the webhook
 * inbound leg (answer processing) and the timers cron (invitations,
 * nudges, reminders, TTL expiry).
 *
 * Everything here runs on the SERVICE-ROLE client: sms_survey_sessions
 * / sms_survey_answers have no authenticated write policies. Campaign
 * scoping is enforced upstream (surveys are built via RLS-checked
 * routes; the campaign/activity pairing is validated at build time),
 * which is what makes these admin writes safe.
 *
 * Conversation policy (decided in-phase):
 *   - every survey message (in and out) is appended to the session's
 *     inbox thread, so a handoff always arrives with the transcript;
 *   - ordinary Q↔A traffic does TIMESTAMP-ONLY touches (no unread
 *     bump / needs_response flip) so live surveys don't flood the
 *     inbox queues — only freetext-on-choice captures and handoffs
 *     surface the thread via touch_sms_conversation_inbound;
 *   - in-session replies (next question, re-prompts, completion) send
 *     immediately — they are conversational, never blackout-blocked
 *     (the Phase 2 1:1 rule). Invitations/nudges/reminders are
 *     bulk-adjacent and respect the blackout window (cron-side).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SmsProvider, SendResult } from "@/lib/sms/provider";
import { countSegments } from "@/lib/sms/segments";
import {
  nextStep,
  outcomeMapping,
  parseAnswer,
  renderQuestion,
  retryLadder,
} from "@/lib/sms/survey-engine";
import type {
  SmsSurveyQuestionRow,
  SmsSurveyRow,
  SmsSurveySessionRow,
} from "@/types/sms";

const UNIQUE_VIOLATION = "23505";
/** sms_interactions.phone_number is VARCHAR(30). */
const PHONE_NUMBER_MAX = 30;
/** sms_survey_answers.parsed_value is VARCHAR(50). */
const PARSED_MAX = 50;
/** sms_interactions.cta_response rides into binary_value (VARCHAR(30)). */
const CTA_MAX = 30;

// Untyped admin/service client (survey tables are not in generated
// types until the migration is applied).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export const LIVE_SESSION_STATES = ["invited", "active"] as const;

export interface SurveyBundle {
  survey: SmsSurveyRow;
  questions: SmsSurveyQuestionRow[];
}

export async function loadSurveyBundle(
  db: Db,
  surveyId: number,
): Promise<SurveyBundle | null> {
  const { data: survey, error } = await db
    .from("sms_surveys")
    .select("*")
    .eq("survey_id", surveyId)
    .maybeSingle();
  if (error) throw error;
  if (!survey) return null;
  const { data: questions, error: qErr } = await db
    .from("sms_survey_questions")
    .select("*")
    .eq("survey_id", surveyId)
    .order("sort_order", { ascending: true })
    .order("question_id", { ascending: true });
  if (qErr) throw qErr;
  return {
    survey: survey as SmsSurveyRow,
    questions: (questions ?? []) as SmsSurveyQuestionRow[],
  };
}

/**
 * The one live ('invited'/'active') session on a phone — the partial
 * unique index guarantees at most one exists.
 */
export async function findLiveSessionByPhone(
  db: Db,
  phoneE164: string,
): Promise<SmsSurveySessionRow | null> {
  const { data, error } = await db
    .from("sms_survey_sessions")
    .select("*")
    .eq("phone_e164", phoneE164)
    .in("state", [...LIVE_SESSION_STATES])
    .limit(1);
  if (error) throw error;
  return (data?.[0] as SmsSurveySessionRow | undefined) ?? null;
}

/**
 * Terminate a phone's survey sessions on opt-out (brief §2.3
 * constraint 3: unsubscribe events double as session terminators).
 * Queued sessions are ended too — an opted-out member must not be
 * invited later.
 */
export async function terminateSessionsForPhone(
  db: Db,
  phoneE164: string,
  occurredAt: string,
): Promise<Array<{ session_id: number; conversation_id: number | null }>> {
  const { data, error } = await db
    .from("sms_survey_sessions")
    .update({ state: "opted_out", last_activity_at: occurredAt })
    .eq("phone_e164", phoneE164)
    .in("state", ["queued", ...LIVE_SESSION_STATES])
    .select("session_id, conversation_id");
  if (error) {
    console.error("terminateSessionsForPhone failed:", error);
    return [];
  }
  return (data ?? []) as Array<{
    session_id: number;
    conversation_id: number | null;
  }>;
}

/**
 * Find-or-create the campaign-scoped inbox thread for a survey
 * session on the survey's sender number (the blast-mirror idiom:
 * prefer an open thread on the pair — campaign scope first, then
 * most recent — else upsert on the NULLS-NOT-DISTINCT thread key,
 * which also reopens a closed same-key thread as 'messaged').
 */
export async function ensureSurveyConversation(
  db: Db,
  args: {
    ourNumberId: number;
    phoneE164: string;
    workerId: number;
    campaignId: number;
    occurredAt: string;
  },
): Promise<number | null> {
  const { ourNumberId, phoneE164, workerId, campaignId, occurredAt } = args;
  const { data: open, error } = await db
    .from("sms_conversations")
    .select("conversation_id, campaign_id, last_message_at")
    .eq("our_number_id", ourNumberId)
    .eq("phone_e164", phoneE164)
    .neq("state", "closed");
  if (error) throw error;
  const candidates = (open ?? []) as Array<{
    conversation_id: number;
    campaign_id: number | null;
    last_message_at: string | null;
  }>;
  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      const aScope = a.campaign_id === campaignId ? 0 : 1;
      const bScope = b.campaign_id === campaignId ? 0 : 1;
      if (aScope !== bScope) return aScope - bScope;
      const aT = a.last_message_at ? Date.parse(a.last_message_at) : 0;
      const bT = b.last_message_at ? Date.parse(b.last_message_at) : 0;
      return bT - aT;
    });
    return candidates[0].conversation_id;
  }

  const { data: created, error: upErr } = await db
    .from("sms_conversations")
    .upsert(
      {
        our_number_id: ourNumberId,
        phone_e164: phoneE164,
        worker_id: workerId,
        campaign_id: campaignId,
        state: "messaged",
        last_message_at: occurredAt,
        last_outbound_at: occurredAt,
      },
      { onConflict: "our_number_id,phone_e164,campaign_id" },
    )
    .select("conversation_id")
    .single();
  if (upErr) {
    console.error("ensureSurveyConversation upsert failed:", upErr);
    return null;
  }
  return (created?.conversation_id as number | undefined) ?? null;
}

/**
 * Guarded, monotonic timestamp touch — recency only, no unread bump
 * or state flip (survey traffic must not flood the inbox queues).
 */
export async function touchConversationTimestamps(
  db: Db,
  conversationId: number,
  occurredAt: string,
  direction: "inbound" | "outbound",
): Promise<void> {
  const stamp =
    direction === "inbound"
      ? { last_message_at: occurredAt, last_inbound_at: occurredAt }
      : { last_message_at: occurredAt, last_outbound_at: occurredAt };
  const { error } = await db
    .from("sms_conversations")
    .update(stamp)
    .eq("conversation_id", conversationId)
    .or(`last_message_at.is.null,last_message_at.lt.${occurredAt}`);
  if (error) console.error("touchConversationTimestamps failed:", error);
}

/**
 * Append a message row to the thread — idempotent on
 * provider_message_id. Returns whether the row is NEW (the gate for
 * every session side effect).
 */
export async function appendSurveyMessage(
  db: Db,
  row: {
    conversation_id: number;
    direction: "inbound" | "outbound";
    body: string | null;
    phone_e164: string | null;
    provider_message_id: string | null;
    interaction_id?: number | null;
    status: string;
    error?: string | null;
    created_at: string;
  },
): Promise<boolean> {
  const messageRow = {
    ...row,
    segments: row.body ? countSegments(row.body).segments : null,
  };
  if (row.provider_message_id) {
    const { data, error } = await db
      .from("sms_messages")
      .upsert(messageRow, {
        onConflict: "provider_message_id",
        ignoreDuplicates: true,
      })
      .select("message_id");
    if (error) {
      if (error.code === UNIQUE_VIOLATION) return false;
      throw error;
    }
    return (data?.length ?? 0) > 0;
  }
  const { error } = await db.from("sms_messages").insert(messageRow);
  if (error) throw error;
  return true;
}

export type SurveyPromptKind =
  | "invitation"
  | "question"
  | "reprompt"
  | "completion"
  | "nudge"
  | "reminder";

/**
 * Send one survey prompt from the survey's sender number and mirror
 * it into the session's thread. Returns the provider result (or null
 * when the provider call itself threw — the caller decides whether
 * that reverts a claim or is simply logged; an already-recorded
 * answer must never be lost to a failed send).
 */
export async function sendSurveyPrompt(
  db: Db,
  provider: SmsProvider,
  args: {
    session: Pick<
      SmsSurveySessionRow,
      "session_id" | "phone_e164" | "conversation_id"
    >;
    senderDigits: string;
    body: string;
    kind: SurveyPromptKind;
  },
): Promise<SendResult | null> {
  const { session, senderDigits, body, kind } = args;
  const sentAt = new Date().toISOString();
  let result: SendResult | null = null;
  try {
    const results = await provider.sendBatch(
      [
        {
          to: session.phone_e164,
          body,
          sender: senderDigits,
          customRef: `survey-${session.session_id}`,
        },
      ],
      { idempotencyKey: `sms-survey-${session.session_id}-${kind}-${Date.now()}` },
    );
    result = results[0] ?? null;
  } catch (err) {
    console.error(
      `sendSurveyPrompt: provider send failed (session ${session.session_id}, ${kind}):`,
      err,
    );
    return null;
  }

  if (session.conversation_id != null) {
    try {
      await appendSurveyMessage(db, {
        conversation_id: session.conversation_id,
        direction: "outbound",
        body,
        phone_e164: session.phone_e164,
        provider_message_id: result?.providerMessageId ?? null,
        status: result?.status === "success" ? "sent" : "failed",
        error:
          result?.status === "success"
            ? null
            : (result?.error ?? `Provider send ${result?.status ?? "failed"}`),
        created_at: sentAt,
      });
      await touchConversationTimestamps(
        db,
        session.conversation_id,
        sentAt,
        "outbound",
      );
    } catch (err) {
      console.error(
        `sendSurveyPrompt: thread mirror failed (session ${session.session_id}):`,
        err,
      );
    }
  }
  return result;
}

/** Opt-out mirror on the worker row (compliance-critical, guarded). */
export async function mirrorWorkerOptOut(
  db: Db,
  workerId: number,
  occurredAt: string,
): Promise<void> {
  const { error } = await db
    .from("workers")
    .update({
      sms_opt_out: true,
      sms_opt_out_at: occurredAt,
      sms_opt_out_source: "inbound_stop",
    })
    .eq("worker_id", workerId)
    .eq("sms_opt_out", false);
  if (error) console.error("mirrorWorkerOptOut failed:", error);
}

async function loadSenderDigits(
  db: Db,
  numberId: number | null,
): Promise<string | null> {
  if (numberId == null) return null;
  const { data } = await db
    .from("sms_numbers")
    .select("phone_e164, status")
    .eq("number_id", numberId)
    .maybeSingle();
  if (!data || data.status !== "active") return null;
  return (data.phone_e164 as string).replace(/^\+/, "");
}

export interface SurveyInboundArgs {
  session: SmsSurveySessionRow;
  phoneE164: string;
  body: string;
  providerMessageId: string | null;
  receivedAt: string;
}

export interface SurveyInboundResult {
  /** false = the survey no longer applies; fall through to conversational routing. */
  handled: boolean;
  response: Record<string, unknown>;
}

/**
 * The webhook survey leg: parse the inbound against the session's
 * current question, record the answer / walk the retry ladder /
 * branch / complete / hand off, and send the next prompt.
 *
 * Idempotency: the thread-append upsert on provider_message_id is the
 * single gate — a redelivered webhook records nothing twice and sends
 * nothing twice.
 */
export async function processSurveyInbound(
  db: Db,
  provider: SmsProvider,
  args: SurveyInboundArgs,
): Promise<SurveyInboundResult> {
  const { session, phoneE164, body, providerMessageId, receivedAt } = args;

  const bundle = await loadSurveyBundle(db, session.survey_id);
  if (!bundle || bundle.survey.status !== "open" || bundle.questions.length === 0) {
    // Belt: a live session on a closed/broken survey — expire it and
    // let the message route conversationally.
    await db
      .from("sms_survey_sessions")
      .update({ state: "expired", last_activity_at: receivedAt })
      .eq("session_id", session.session_id)
      .in("state", [...LIVE_SESSION_STATES]);
    return { handled: false, response: {} };
  }
  const { survey, questions } = bundle;

  const currentQuestion =
    questions.find((q) => q.question_id === session.current_question_id) ??
    questions[0];

  const parsed = parseAnswer(currentQuestion, body);

  // ── Idempotency gates (up front, BEFORE any write) ──────────
  // Dedupe requires BOTH: the thread message already recorded AND an
  // answer row present for the current question. Gating on the
  // message alone would make a crash between the thread append and
  // the answer upsert drop the answer forever on the provider's
  // retry (at-most-once); gating on the answer means the retry
  // RECOVERS the crash window instead (at-least-once).
  let messageExisted = false;
  if (providerMessageId) {
    const { data: existingMsg } = await db
      .from("sms_messages")
      .select("message_id")
      .eq("provider_message_id", providerMessageId)
      .maybeSingle();
    messageExisted = !!existingMsg;
  }
  const { data: existingAnswerRows } = await db
    .from("sms_survey_answers")
    .select("parsed_value, invalid_attempts, raw_body, received_at")
    .eq("session_id", session.session_id)
    .eq("question_id", currentQuestion.question_id)
    .limit(1);
  const existingAnswer = existingAnswerRows?.[0] as
    | {
        parsed_value: string | null;
        invalid_attempts: number;
        raw_body: string | null;
        received_at: string;
      }
    | undefined;

  const dedupeResponse: SurveyInboundResult = {
    handled: true,
    response: {
      ok: true,
      survey_session_id: session.session_id,
      deduplicated: true,
    },
  };
  if (messageExisted && existingAnswer) return dedupeResponse;

  // No provider message id = no dedupe handle. Cheap replay guard: an
  // identical raw body already captured on this question within the
  // last 10 minutes is treated as a redelivery. Residual window: a
  // member genuinely re-sending the exact same text within 10 minutes
  // (id-less providers only — Mobile Message always supplies ids) is
  // swallowed; accepted and documented in the Phase 4 plan.
  const REPLAY_WINDOW_MS = 10 * 60 * 1000;
  if (
    !providerMessageId &&
    existingAnswer &&
    existingAnswer.raw_body === body &&
    Math.abs(Date.parse(receivedAt) - Date.parse(existingAnswer.received_at)) <=
      REPLAY_WINDOW_MS
  ) {
    return dedupeResponse;
  }

  // Interaction row (the §5.1 audit + rating pipeline). Rating values
  // ride ONLY on parsed write_rating answers — fn_sms_to_rating treats
  // cta_response as a binary whenever activity_id is set, so all three
  // stay NULL otherwise.
  const isRatingAnswer =
    parsed.kind === "parsed" &&
    currentQuestion.write_rating &&
    survey.activity_id != null;
  const mapping = isRatingAnswer
    ? outcomeMapping(currentQuestion, parsed.kind === "parsed" ? parsed.value : "")
    : { rating: null, binary: null };
  const hasMapping = mapping.rating != null || mapping.binary != null;

  let interactionId: number | null = null;
  if (providerMessageId) {
    const { data: existing } = await db
      .from("sms_interactions")
      .select("id")
      .eq("external_message_id", providerMessageId)
      .maybeSingle();
    if (existing) interactionId = existing.id as number;
  }
  if (interactionId == null) {
    const { data: inserted, error: insErr } = await db
      .from("sms_interactions")
      .insert({
        worker_id: session.worker_id,
        campaign_id: survey.campaign_id,
        activity_id: survey.activity_id,
        direction: "inbound",
        phone_number: phoneE164.slice(0, PHONE_NUMBER_MAX),
        phone_e164: phoneE164,
        body,
        cta_response:
          isRatingAnswer && hasMapping && parsed.kind === "parsed"
            ? parsed.value.slice(0, CTA_MAX)
            : null,
        maps_to_rating: mapping.rating,
        maps_to_binary: mapping.binary,
        external_message_id: providerMessageId,
        received_at: receivedAt,
        notes: `Survey #${survey.survey_id} Q${currentQuestion.sort_order + 1}`,
      })
      .select("id")
      .single();
    if (insErr) {
      if (insErr.code === UNIQUE_VIOLATION && providerMessageId) {
        const { data: raced } = await db
          .from("sms_interactions")
          .select("id")
          .eq("external_message_id", providerMessageId)
          .maybeSingle();
        interactionId = (raced?.id as number | undefined) ?? null;
      } else {
        throw insErr;
      }
    } else {
      interactionId = inserted.id as number;
    }
  }

  // Thread append — the idempotency gate for everything below.
  let conversationId = session.conversation_id;
  if (conversationId == null && survey.sender_number_id != null) {
    conversationId = await ensureSurveyConversation(db, {
      ourNumberId: survey.sender_number_id,
      phoneE164,
      workerId: session.worker_id,
      campaignId: survey.campaign_id,
      occurredAt: receivedAt,
    });
    if (conversationId != null) {
      await db
        .from("sms_survey_sessions")
        .update({ conversation_id: conversationId })
        .eq("session_id", session.session_id);
    }
  }

  // Thread append — idempotent (upsert on provider_message_id); the
  // dedupe decision was already taken above, so a pre-existing row
  // here just means we are recovering the crash window.
  if (conversationId != null) {
    await appendSurveyMessage(db, {
      conversation_id: conversationId,
      direction: "inbound",
      body,
      phone_e164: phoneE164,
      provider_message_id: providerMessageId,
      interaction_id: interactionId,
      status: "received",
      created_at: receivedAt,
    });
  }

  const sessionWithConv = { ...session, conversation_id: conversationId };
  const senderDigits = await loadSenderDigits(db, survey.sender_number_id);

  const upsertAnswer = async (
    parsedValue: string | null,
    invalidAttempts: number,
  ) => {
    const { error } = await db.from("sms_survey_answers").upsert(
      {
        session_id: session.session_id,
        question_id: currentQuestion.question_id,
        raw_body: body,
        parsed_value: parsedValue,
        invalid_attempts: invalidAttempts,
        provider_message_id: providerMessageId,
        received_at: receivedAt,
      },
      { onConflict: "session_id,question_id" },
    );
    if (error) throw error;
  };

  /**
   * Guarded live-state transition. Returns whether a row matched —
   * false means the session left the live states mid-flight (cron
   * expiry/opt-out race) and the caller must NOT send a reply.
   */
  const updateSession = async (
    patch: Record<string, unknown>,
  ): Promise<boolean> => {
    const { data, error } = await db
      .from("sms_survey_sessions")
      .update({ last_activity_at: receivedAt, ...patch })
      .eq("session_id", session.session_id)
      .in("state", [...LIVE_SESSION_STATES])
      .select("session_id");
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  };

  /** Surface the thread to humans (unread bump + needs_response). */
  const surfaceConversation = async () => {
    if (conversationId == null) return;
    const { error } = await db.rpc("touch_sms_conversation_inbound", {
      p_conversation_id: conversationId,
      p_occurred_at: receivedAt,
    });
    if (error) console.error("touch_sms_conversation_inbound failed:", error);
  };

  const quietTouch = async () => {
    if (conversationId == null) return;
    await touchConversationTimestamps(db, conversationId, receivedAt, "inbound");
  };

  // Worker opt-out re-check ahead of any reply send (staff opt-outs
  // must stop prompts even mid-session).
  const sendReply = async (
    replyBody: string,
    kind: SurveyPromptKind,
  ): Promise<void> => {
    if (!senderDigits) return;
    const { data: worker } = await db
      .from("workers")
      .select("sms_opt_out")
      .eq("worker_id", session.worker_id)
      .maybeSingle();
    if (worker?.sms_opt_out) {
      await updateSession({ state: "opted_out" });
      return;
    }
    const result = await sendSurveyPrompt(db, provider, {
      session: sessionWithConv,
      senderDigits,
      body: replyBody,
      kind,
    });
    if (result?.status === "blocked") {
      await mirrorWorkerOptOut(db, session.worker_id, receivedAt);
      await updateSession({ state: "opted_out" });
      return;
    }
    await db
      .from("sms_survey_sessions")
      .update({ last_prompt_at: new Date().toISOString() })
      .eq("session_id", session.session_id);
  };

  if (parsed.kind === "parsed") {
    await upsertAnswer(
      parsed.value.slice(0, PARSED_MAX),
      existingAnswer?.invalid_attempts ?? 0,
    );
    await quietTouch();

    const step = nextStep(questions, currentQuestion, parsed.value);
    if (step.kind === "question") {
      const advanced = await updateSession({
        state: "active",
        current_question_id: step.question.question_id,
        retry_count: 0,
        nudged: false,
        first_answer_at: session.first_answer_at ?? receivedAt,
      });
      if (advanced) {
        await sendReply(renderQuestion(step.question), "question");
      }
      return {
        handled: true,
        response: {
          ok: true,
          survey_session_id: session.session_id,
          answered: currentQuestion.question_id,
          next_question_id: step.question.question_id,
        },
      };
    }

    const completedNow = await updateSession({
      state: "completed",
      current_question_id: null,
      retry_count: 0,
      nudged: false,
      first_answer_at: session.first_answer_at ?? receivedAt,
      completed_at: receivedAt,
    });
    const completion = survey.completion_body?.trim();
    if (completedNow && completion) await sendReply(completion, "completion");
    return {
      handled: true,
      response: {
        ok: true,
        survey_session_id: session.session_id,
        completed: true,
      },
    };
  }

  if (parsed.kind === "freetext_on_choice") {
    // Capture verbatim, surface to a human, burn NO retry, send no
    // auto-reply (brief §4.1) — the session stays live so a proper
    // follow-up answer still advances it. The free-text IS the
    // member's first engagement, so it stamps first_answer_at
    // (started_count must not undercount these).
    await upsertAnswer(
      existingAnswer?.parsed_value ?? null,
      existingAnswer?.invalid_attempts ?? 0,
    );
    await updateSession({
      first_answer_at: session.first_answer_at ?? receivedAt,
    });
    await surfaceConversation();
    return {
      handled: true,
      response: {
        ok: true,
        survey_session_id: session.session_id,
        freetext_captured: true,
      },
    };
  }

  // invalid → retry ladder.
  await upsertAnswer(
    existingAnswer?.parsed_value ?? null,
    (existingAnswer?.invalid_attempts ?? 0) + 1,
  );
  const step = retryLadder(currentQuestion, session.retry_count, survey.retry_limit);

  if (step.kind === "reprompt") {
    const stillLive = await updateSession({
      retry_count: session.retry_count + 1,
    });
    await quietTouch();
    if (stillLive) await sendReply(step.body, "reprompt");
    return {
      handled: true,
      response: {
        ok: true,
        survey_session_id: session.session_id,
        reprompted: session.retry_count + 1,
      },
    };
  }

  // Handoff: transcript is already in the thread; escalate + surface.
  await updateSession({ state: "handed_off" });
  if (conversationId != null && survey.handoff_escalate_to) {
    const { error } = await db
      .from("sms_conversations")
      .update({ escalated_to_user_id: survey.handoff_escalate_to })
      .eq("conversation_id", conversationId)
      .is("escalated_to_user_id", null);
    if (error) console.error("survey handoff escalation failed:", error);
  }
  await surfaceConversation();
  return {
    handled: true,
    response: {
      ok: true,
      survey_session_id: session.session_id,
      handed_off: true,
    },
  };
}
