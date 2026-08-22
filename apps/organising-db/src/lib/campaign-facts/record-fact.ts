import type { SupabaseClient } from "@supabase/supabase-js";
import type { FactSource } from "./types";
import { parsedToRpcArgs, type ParsedFactValue } from "./values";

/** Untyped until generated.ts is regenerated; keep all fact writes on this RPC. */
type RpcClient = {
  rpc: (
    fn: "record_campaign_fact",
    args: Record<string, unknown>
  ) => Promise<{ data: number | null; error: { message: string } | null }>;
};

export async function recordCampaignFactRpc(
  supabase: SupabaseClient,
  args: {
    fieldId: number;
    workerId: number;
    campaignId: number;
    parsed?: ParsedFactValue;
    source?: FactSource;
    sourceRef?: string | null;
    notes?: string | null;
    actorId?: string | null;
    clear?: boolean;
  }
): Promise<number> {
  const valueArgs =
    args.clear || !args.parsed || args.parsed.kind === "empty" || args.parsed.kind === "invalid"
      ? {
          p_value_bool: null,
          p_value_int: null,
          p_value_text: null,
          p_value_enum: null,
          p_value_json: null,
        }
      : parsedToRpcArgs(args.parsed);

  const { data, error } = await (supabase as unknown as RpcClient).rpc(
    "record_campaign_fact",
    {
      p_field_id: args.fieldId,
      p_worker_id: args.workerId,
      p_campaign_id: args.campaignId,
      ...valueArgs,
      p_source: args.source ?? "staff",
      p_source_ref: args.sourceRef ?? null,
      p_notes: args.notes ?? null,
      p_actor_id: args.actorId ?? null,
      p_clear: args.clear === true || args.parsed?.kind === "empty",
    }
  );
  if (error) throw new Error(error.message);
  return data ?? 0;
}
