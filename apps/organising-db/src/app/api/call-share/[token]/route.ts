import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  logCallShareEvent,
  requireCallShareSession,
  resolveCallShareTokenRow,
  tokenStatusResponse,
} from "@/lib/campaign/call-share-api";
import { SUPPORT_LEVELS } from "@/lib/phone/disposition-types";

async function campaignScriptContext(
  admin: ReturnType<typeof createAdminClient>,
  campaignId: number,
  issuedBy: string,
): Promise<Record<string, string | undefined>> {
  const { data: campaign } = await admin
    .from("campaigns")
    .select("name, organiser_id")
    .eq("campaign_id", campaignId)
    .maybeSingle();

  let agreementName: string | undefined;
  let employerName: string | undefined;
  const { data: timeline } = await admin
    .from("campaign_timelines")
    .select("agreement_id")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (timeline?.agreement_id) {
    const { data: agreement } = await admin
      .from("agreements")
      .select("agreement_name, employer_id")
      .eq("agreement_id", timeline.agreement_id)
      .maybeSingle();
    agreementName = agreement?.agreement_name ?? undefined;
    if (agreement?.employer_id) {
      const { data: employer } = await admin
        .from("employers")
        .select("employer_name")
        .eq("employer_id", agreement.employer_id)
        .maybeSingle();
      employerName = employer?.employer_name ?? undefined;
    }
  }

  let organiserName: string | undefined;
  let organiserPhone: string | undefined;
  if (campaign?.organiser_id) {
    const { data: organiser } = await admin
      .from("organisers")
      .select("organiser_name, phone")
      .eq("organiser_id", campaign.organiser_id)
      .maybeSingle();
    organiserName = organiser?.organiser_name ?? undefined;
    organiserPhone = organiser?.phone ?? undefined;
  }

  const { data: worksiteLinks } = await admin
    .from("campaign_worksites")
    .select("worksite_id")
    .eq("campaign_id", campaignId)
    .limit(1);
  let worksiteName: string | undefined;
  if (worksiteLinks?.[0]?.worksite_id) {
    const { data: ws } = await admin
      .from("worksites")
      .select("worksite_name")
      .eq("worksite_id", worksiteLinks[0].worksite_id)
      .maybeSingle();
    worksiteName = ws?.worksite_name ?? undefined;
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("display_name, phone, role")
    .eq("user_id", issuedBy)
    .maybeSingle();

  return {
    campaign_name: campaign?.name ?? undefined,
    agreement_name: agreementName,
    employer_name: employerName,
    worksite_name: worksiteName,
    organiser_name: organiserName,
    organiser_phone: organiserPhone,
    staff_name: profile?.display_name ?? undefined,
    staff_phone: profile?.phone ?? undefined,
    staff_role: profile?.role ?? undefined,
    date: new Date().toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  };
}

async function resolveOutcomesScriptId(
  admin: ReturnType<typeof createAdminClient>,
  scriptId: number,
): Promise<number> {
  const { data: scriptRow, error } = await admin
    .from("call_scripts")
    .select("base_script_id")
    .eq("script_id", scriptId)
    .maybeSingle();
  if (error) throw error;
  return scriptRow?.base_script_id != null ? scriptRow.base_script_id : scriptId;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await params;
    if (!rawToken || rawToken.length < 32) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const admin = createAdminClient();
    const outcome = await resolveCallShareTokenRow(admin, rawToken);
    const errResp = tokenStatusResponse(outcome);
    if (errResp || outcome.kind !== "ok") return errResp!;
    const tokenRow = outcome.row;

    const session = requireCallShareSession(request, rawToken, tokenRow);
    if (!session) {
      const { data: list } = await admin
        .from("call_lists")
        .select("name, campaign:campaigns(name)")
        .eq("list_id", tokenRow.list_id)
        .maybeSingle();
      const campaignRel = list?.campaign as { name?: string } | { name?: string }[] | null | undefined;
      const campaign = Array.isArray(campaignRel) ? campaignRel[0] : campaignRel;
      return NextResponse.json(
        {
          requires_password: true,
          campaign_name: campaign?.name ?? null,
          call_list_name: list?.name ?? null,
        },
        { status: 401 },
      );
    }

    const { data: list, error: listErr } = await admin
      .from("call_lists")
      .select(
        `*,
         campaign:campaigns(campaign_id, name),
         call_scripts!script_id(*, call_script_sections(*)),
         call_list_scripts(
           script_id,
           is_current,
           wave_label,
           linked_at,
           notes,
           call_scripts(script_id, title, status, call_objective, call_script_sections(*))
         )`,
      )
      .eq("list_id", tokenRow.list_id)
      .maybeSingle();
    if (listErr) throw listErr;
    if (!list) return NextResponse.json({ error: "Call list not found" }, { status: 404 });

    const listRecord = list as Record<string, unknown>;
    const campaignRel = listRecord.campaign as { campaign_id: number; name: string } | { campaign_id: number; name: string }[] | null;
    const campaign = Array.isArray(campaignRel) ? campaignRel[0] : campaignRel;
    const campaignId = campaign?.campaign_id ?? (listRecord.campaign_id as number);
    const scriptId = (listRecord.script_id as number | null) ?? null;
    const effectiveScriptId = scriptId ? await resolveOutcomesScriptId(admin, scriptId) : null;

    const { data: outcomes, error: outcomesErr } = effectiveScriptId
      ? await admin
          .from("call_outcome_definitions")
          .select("*")
          .eq("script_id", effectiveScriptId)
          .order("sort_order")
      : { data: [], error: null };
    if (outcomesErr) throw outcomesErr;

    const { data: ctaAmbitions, error: ctaErr } = scriptId
      ? await admin
          .from("call_script_cta_ambitions")
          .select(
            `id, outcome_definition_id, activity_id, cta_label,
             target_response, target_min_rating, target_binary, target_support_level,
             min_call_threshold_pct, notes,
             activity:campaign_activities(activity_id, title, is_binary, rating_labels)`,
          )
          .eq("script_id", scriptId)
      : { data: [], error: null };
    if (ctaErr) throw ctaErr;

    let leader = null;
    if (tokenRow.leader_worker_id) {
      const { data: leaderRow } = await admin
        .from("workers")
        .select("worker_id, first_name, last_name, occupation")
        .eq("worker_id", tokenRow.leader_worker_id)
        .maybeSingle();
      leader = leaderRow ?? null;
    }

    await admin
      .from("call_share_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("token_id", tokenRow.token_id);
    await logCallShareEvent(admin, tokenRow.token_id, "opened", null, session.workerId);

    const flattenedCtas = ((ctaAmbitions ?? []) as Array<Record<string, unknown>>).map((row) => {
      const activityRel = row.activity as unknown[] | Record<string, unknown> | null | undefined;
      const activity = Array.isArray(activityRel) ? activityRel[0] ?? null : activityRel ?? null;
      return { ...row, activity };
    });

    return NextResponse.json({
      campaign: campaign ?? { campaign_id: campaignId, name: "" },
      call_list: listRecord,
      script: listRecord.call_scripts ?? null,
      linkedScripts: listRecord.call_list_scripts ?? [],
      outcome_definitions: outcomes ?? [],
      cta_ambitions: flattenedCtas,
      script_variable_context: await campaignScriptContext(admin, campaignId, tokenRow.issued_by),
      support_levels: SUPPORT_LEVELS,
      leader,
      caller: { label: session.label, worker_id: session.workerId },
    });
  } catch (error) {
    console.error("Call share bootstrap error:", error);
    return NextResponse.json({ error: "Failed to load call share" }, { status: 500 });
  }
}
