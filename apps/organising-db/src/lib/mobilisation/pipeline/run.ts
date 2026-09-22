import { createAdminClient } from "@/lib/supabase/admin";
import { pollAis } from "./ais";
import { pollCommercial } from "./commercial";
import { loadContext } from "./context";
import { dispatchDigests, dispatchImmediate } from "./dispatch";
import { pollRegulatory } from "./regulatory";

export type RadarLayer = "regulatory" | "commercial" | "ais" | "digest";

export async function runRadar(layer: RadarLayer, force = false): Promise<string[]> {
  const db = createAdminClient();
  const ctx = await loadContext(db);
  if (layer === "digest") {
    return [await dispatchDigests(db, ctx)];
  }
  const notes =
    layer === "regulatory"
      ? await pollRegulatory(db, ctx, force)
      : layer === "commercial"
        ? await pollCommercial(db, ctx, force)
        : await pollAis(db, ctx, force);
  return notes;
}

/** Re-export so cron routes can dispatch alerts created during a poll. */
export async function runRadarAndNotify(layer: Exclude<RadarLayer, "digest">, force = false): Promise<string[]> {
  const db = createAdminClient();
  const ctx = await loadContext(db);
  const before = Date.now();
  const notes =
    layer === "regulatory"
      ? await pollRegulatory(db, ctx, force)
      : layer === "commercial"
        ? await pollCommercial(db, ctx, force)
        : await pollAis(db, ctx, force);
  const { data } = await db
    .from("mobilisation_alerts")
    .select("alert_id, rule_id, dedup_key, priority, title, summary, confidence, contractor_id, watch_contractor_id, vessel_id, operator_id, worksite_id")
    .gte("created_at", new Date(before - 5_000).toISOString())
    .eq("status", "new");
  const alerts = (data ?? []).map((row) => ({
    rule_code: "",
    rule_id: Number(row.rule_id),
    dedup_key: String(row.dedup_key),
    priority: row.priority as "low" | "normal" | "high" | "critical",
    title: String(row.title),
    summary: String(row.summary),
    confidence: Number(row.confidence),
    contractor_id: (row.contractor_id as number | null) ?? null,
    watch_contractor_id: (row.watch_contractor_id as number | null) ?? null,
    vessel_id: (row.vessel_id as number | null) ?? null,
    operator_id: (row.operator_id as number | null) ?? null,
    worksite_id: (row.worksite_id as number | null) ?? null,
    signal_ids: [],
    alert_id: Number(row.alert_id),
  }));
  await dispatchImmediate(db, ctx, alerts);
  return notes;
}
