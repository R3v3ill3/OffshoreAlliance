/**
 * Persist a parsed SMS tapback on the parent outbound message.
 * Service-role only — sms_messages has no authenticated UPDATE policy.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedSmsTapback, SmsMessageReaction } from "@/lib/sms/tapback";
import { quotedMatchesBody } from "@/lib/sms/tapback";

export async function applySmsTapback(
  db: SupabaseClient,
  input: {
    phoneE164: string;
    tapback: ParsedSmsTapback;
    providerMessageId: string | null;
    originalMessageId: string | null;
    receivedAt: string;
  },
): Promise<boolean> {
  let parent: { message_id: number; reactions: unknown } | null = null;

  if (input.originalMessageId) {
    const { data } = await db
      .from("sms_messages")
      .select("message_id, reactions")
      .eq("provider_message_id", input.originalMessageId)
      .maybeSingle();
    if (data) parent = data as { message_id: number; reactions: unknown };
  }

  if (!parent && input.tapback.quoted) {
    const { data: candidates } = await db
      .from("sms_messages")
      .select("message_id, body, reactions")
      .eq("phone_e164", input.phoneE164)
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(25);
    const hit = (candidates ?? []).find((m) =>
      quotedMatchesBody(m.body as string | null, input.tapback.quoted),
    );
    if (hit) parent = hit as { message_id: number; reactions: unknown };
  }

  if (!parent) {
    const { data } = await db
      .from("sms_messages")
      .select("message_id, reactions")
      .eq("phone_e164", input.phoneE164)
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) parent = data as { message_id: number; reactions: unknown };
  }

  if (!parent) return false;

  const existing: SmsMessageReaction[] = Array.isArray(parent.reactions)
    ? (parent.reactions as SmsMessageReaction[])
    : [];
  if (
    input.providerMessageId &&
    existing.some((r) => r.provider_message_id === input.providerMessageId)
  ) {
    return true;
  }

  const next: SmsMessageReaction[] = [
    ...existing,
    {
      kind: input.tapback.kind,
      emoji: input.tapback.emoji,
      from_e164: input.phoneE164,
      at: input.receivedAt,
      provider_message_id: input.providerMessageId,
    },
  ];

  const { error } = await db
    .from("sms_messages")
    .update({ reactions: next })
    .eq("message_id", parent.message_id);
  if (error) {
    console.error("applySmsTapback failed:", error);
    return false;
  }
  return true;
}
