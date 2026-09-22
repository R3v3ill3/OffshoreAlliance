import type { SupabaseClient } from "@supabase/supabase-js";
import { corroborationBump } from "../dedup";
import { planAlerts } from "../rules";
import type {
  AlertDraft,
  ExistingAlert,
  GeofenceGeometry,
  GeofenceRef,
  RuleRow,
  SignalDraft,
  SignalView,
  Watchlist,
} from "../types";

export type Db = SupabaseClient;

export interface RadarContext {
  watch: Watchlist;
  geofences: GeofenceRef[];
  rules: RuleRow[];
  satellite: boolean;
  escalationWindowDays: number;
  slackWebhook: string | null;
  teamsWebhook: string | null;
  contactEmail: string | null;
  /** employer_id → sector_id when the employer has one clear sub-sector. */
  sectorByEmployer: Map<number, number>;
}

export interface SourceRow {
  source_key: string;
  enabled: boolean;
  poll_interval_minutes: number;
  config: Record<string, unknown>;
  cursor: Record<string, unknown>;
  last_polled_at: string | null;
}

export async function loadContext(db: Db): Promise<RadarContext> {
  const [contractors, vessels, keywords, worksites, geofences, rules, settings, sectors, employerSectors] = await Promise.all([
    db.from("mobilisation_watch_contractors").select("watch_id, canonical_name, aliases, employer_id, asx_ticker, tier, is_active"),
    db.from("vessels").select("vessel_id, name, imo, owner_name, owner_operator_id, relevance, is_active"),
    db.from("mobilisation_watch_keywords").select("keyword_id, keyword, kind, asx_ticker, is_active"),
    db.from("worksites").select("worksite_id, worksite_name, operator_id").eq("is_active", true).limit(2000),
    db.from("geofences").select("geofence_id, name, slug, geometry, is_active"),
    db.from("mobilisation_rules").select("rule_id, code, name, enabled, priority, config"),
    db.from("mobilisation_settings").select("slack_webhook_url, teams_webhook_url, ais_satellite_enabled, escalation_window_days, contact_email, ais_provider").eq("id", 1).maybeSingle(),
    db.from("sectors").select("sector_id, sector_name"),
    db.from("employer_sectors").select("employer_id, sector_id"),
  ]);
  for (const result of [contractors, vessels, keywords, worksites, geofences, rules, settings, sectors, employerSectors]) {
    if (result.error) throw new Error(result.error.message);
  }
  const setting = settings.data as {
    slack_webhook_url: string | null;
    teams_webhook_url: string | null;
    ais_satellite_enabled: boolean;
    escalation_window_days: number;
    contact_email: string | null;
  } | null;
  return {
    watch: {
      contractors: (contractors.data ?? []) as Watchlist["contractors"],
      vessels: (vessels.data ?? []) as Watchlist["vessels"],
      keywords: (keywords.data ?? []) as Watchlist["keywords"],
      worksites: (worksites.data ?? []) as Watchlist["worksites"],
    },
    geofences: ((geofences.data ?? []) as { geofence_id: number; name: string; slug: string; geometry: GeofenceGeometry; is_active: boolean }[]).map((g) => ({
      ...g,
      geometry: g.geometry,
    })),
    rules: ((rules.data ?? []) as RuleRow[]).map((rule) => ({
      ...rule,
      config: rule.config ?? {},
    })),
    satellite:
      setting?.ais_satellite_enabled === true ||
      process.env.AIS_SATELLITE === "1" ||
      process.env.AIS_SATELLITE === "true",
    escalationWindowDays: setting?.escalation_window_days ?? 42,
    slackWebhook: setting?.slack_webhook_url || process.env.MOBILISATION_SLACK_WEBHOOK_URL || null,
    teamsWebhook: setting?.teams_webhook_url || process.env.MOBILISATION_TEAMS_WEBHOOK_URL || null,
    contactEmail: setting?.contact_email || process.env.MOBILISATION_CONTACT_EMAIL || null,
    sectorByEmployer: sectorMap(
      (sectors.data ?? []) as { sector_id: number; sector_name: string }[],
      (employerSectors.data ?? []) as { employer_id: number; sector_id: number }[]
    ),
  };
}

/** One sector when the employer has a single row, or the offshore/oil/gas row when several exist. */
export function sectorMap(
  sectors: { sector_id: number; sector_name: string }[],
  links: { employer_id: number; sector_id: number }[]
): Map<number, number> {
  const names = new Map(sectors.map((row) => [row.sector_id, row.sector_name]));
  const grouped = new Map<number, number[]>();
  for (const link of links) {
    const list = grouped.get(link.employer_id) ?? [];
    list.push(link.sector_id);
    grouped.set(link.employer_id, list);
  }
  const picked = new Map<number, number>();
  for (const [employerId, ids] of grouped) {
    const unique = [...new Set(ids)];
    if (unique.length === 1) {
      picked.set(employerId, unique[0]!);
      continue;
    }
    const offshore = unique.find((id) => /offshore|oil|gas|marine/i.test(names.get(id) ?? ""));
    if (offshore) picked.set(employerId, offshore);
  }
  return picked;
}

export async function loadSource(db: Db, key: string): Promise<SourceRow | null> {
  const { data, error } = await db.from("mobilisation_sources").select("*").eq("source_key", key).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SourceRow | null) ?? null;
}

export function sourceDue(source: SourceRow, force: boolean, now = Date.now()): boolean {
  if (!source.enabled && !force) return false;
  if (force) return true;
  if (!source.last_polled_at) return true;
  const elapsed = now - new Date(source.last_polled_at).getTime();
  return elapsed >= source.poll_interval_minutes * 60_000;
}

export async function markSource(
  db: Db,
  key: string,
  patch: { cursor?: Record<string, unknown>; error?: string | null; ok: boolean }
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db
    .from("mobilisation_sources")
    .update({
      last_polled_at: now,
      last_success_at: patch.ok ? now : undefined,
      last_error: patch.error ?? null,
      ...(patch.cursor ? { cursor: patch.cursor } : {}),
    })
    .eq("source_key", key);
  if (error) throw new Error(error.message);
}

export interface SavedSignal {
  signal: SignalView;
  created: boolean;
  confidenceRaised: boolean;
}

export async function saveSignal(db: Db, draft: SignalDraft, now: string): Promise<SavedSignal> {
  const row = {
    source_layer: draft.source_layer,
    source: draft.source,
    source_key: draft.source_key,
    signal_type: draft.signal_type,
    occurred_at: draft.occurred_at,
    title: draft.title,
    extract: draft.extract,
    url: draft.url,
    confidence: draft.confidence,
    in_region: draft.in_region,
    vessel_id: draft.vessel_id,
    contractor_id: draft.contractor_id,
    watch_contractor_id: draft.watch_contractor_id,
    operator_id: draft.operator_id,
    worksite_id: draft.worksite_id,
    geofence_id: draft.geofence_id,
    sector_id: draft.sector_id,
    region_label: draft.region_label,
    dedup_key: draft.dedup_key,
    fingerprint: draft.fingerprint,
    external_id: draft.external_id,
    matched_terms: draft.matched_terms,
    also_seen: draft.also_seen ?? [],
  };
  const inserted = await db.from("mobilisation_signals").insert(row).select("*").maybeSingle();
  if (!inserted.error && inserted.data) {
    return { signal: toSignal(inserted.data), created: true, confidenceRaised: false };
  }
  if (inserted.error && inserted.error.code !== "23505") {
    throw new Error(inserted.error.message);
  }
  const existing = await findExisting(db, draft.dedup_key, draft.fingerprint);
  if (!existing) throw new Error(inserted.error?.message ?? "signal dedup failed");
  const seen = Array.isArray(existing.also_seen) ? [...existing.also_seen] : [];
  const already = seen.some((item) => item && item.url === draft.url && item.source === draft.source);
  let confidence = Number(existing.confidence);
  let confidenceRaised = false;
  if (!already && draft.url) {
    seen.push({ source: draft.source, url: draft.url, at: now });
    confidence = corroborationBump(draft, confidence);
    confidenceRaised = confidence > Number(existing.confidence);
  }
  const terms = [...new Set([...(existing.matched_terms ?? []), ...draft.matched_terms])];
  const updated = await db
    .from("mobilisation_signals")
    .update({ also_seen: seen, confidence, matched_terms: terms })
    .eq("signal_id", existing.signal_id)
    .select("*")
    .single();
  if (updated.error) throw new Error(updated.error.message);
  return { signal: toSignal(updated.data), created: false, confidenceRaised };
}

async function findExisting(db: Db, dedup: string, fingerprint: string) {
  const byDedup = await db.from("mobilisation_signals").select("*").eq("dedup_key", dedup).maybeSingle();
  if (byDedup.data) return byDedup.data as Record<string, unknown> & { also_seen?: { source: string; url: string | null; at?: string }[]; matched_terms?: string[]; confidence: number; signal_id: number };
  const byPrint = await db.from("mobilisation_signals").select("*").eq("fingerprint", fingerprint).maybeSingle();
  return (byPrint.data as Record<string, unknown> & { also_seen?: { source: string; url: string | null; at?: string }[]; matched_terms?: string[]; confidence: number; signal_id: number }) ?? null;
}

export async function openAlertsForSignal(
  db: Db,
  signal: SignalView,
  ctx: RadarContext
): Promise<AlertDraft[]> {
  const since = new Date(Date.now() - ctx.escalationWindowDays * 86400000).toISOString();
  let recentQuery = db
    .from("mobilisation_signals")
    .select("*")
    .gte("occurred_at", since)
    .neq("signal_id", signal.signal_id)
    .limit(80);
  if (signal.watch_contractor_id) {
    recentQuery = recentQuery.eq("watch_contractor_id", signal.watch_contractor_id);
  } else if (signal.vessel_id) {
    recentQuery = recentQuery.eq("vessel_id", signal.vessel_id);
  } else if (signal.contractor_id) {
    recentQuery = recentQuery.eq("contractor_id", signal.contractor_id);
  }
  const recentResult = await recentQuery;
  if (recentResult.error) throw new Error(recentResult.error.message);
  const recent = (recentResult.data ?? []).map(toSignal);

  const alertQuery = db.from("mobilisation_alerts").select("alert_id, dedup_key, status, dismissed_at, priority").limit(80);
  const filtered = signal.watch_contractor_id
    ? alertQuery.eq("watch_contractor_id", signal.watch_contractor_id)
    : signal.vessel_id
      ? alertQuery.eq("vessel_id", signal.vessel_id)
      : alertQuery.eq("contractor_id", signal.contractor_id ?? -1);
  const existingResult = await filtered;
  if (existingResult.error) throw new Error(existingResult.error.message);
  const existingAlerts = (existingResult.data ?? []) as ExistingAlert[];

  const rules = ctx.rules.map((rule) =>
    rule.code === "imminent_mobilisation"
      ? { ...rule, config: { ...rule.config, windowDays: ctx.escalationWindowDays } }
      : rule
  );
  const plan = planAlerts({
    rules,
    signal,
    recent,
    existingAlerts,
    now: new Date().toISOString(),
  });

  const created: AlertDraft[] = [];
  for (const draft of plan.create) {
    const inserted = await db
      .from("mobilisation_alerts")
      .insert({
        rule_id: draft.rule_id,
        dedup_key: draft.dedup_key,
        status: "new",
        priority: draft.priority,
        title: draft.title,
        summary: draft.summary,
        confidence: draft.confidence,
        contractor_id: draft.contractor_id,
        watch_contractor_id: draft.watch_contractor_id,
        vessel_id: draft.vessel_id,
        operator_id: draft.operator_id,
        worksite_id: draft.worksite_id,
      })
      .select("alert_id")
      .maybeSingle();
    if (inserted.error?.code === "23505") {
      const found = await db.from("mobilisation_alerts").select("alert_id, status").eq("dedup_key", draft.dedup_key).maybeSingle();
      if (found.data && found.data.status !== "dismissed") {
        await linkSignal(db, found.data.alert_id as number, signal.signal_id);
      }
      continue;
    }
    if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? "alert insert failed");
    for (const signalId of draft.signal_ids) {
      await linkSignal(db, inserted.data.alert_id as number, signalId);
    }
    created.push(draft);
    (draft as AlertDraft & { alert_id?: number }).alert_id = inserted.data.alert_id as number;
  }
  for (const link of plan.attach) {
    await linkSignal(db, link.alert_id, link.signal_id);
  }
  return created;
}

async function linkSignal(db: Db, alertId: number, signalId: number): Promise<void> {
  const { error } = await db.from("mobilisation_alert_signals").insert({ alert_id: alertId, signal_id: signalId });
  if (error && error.code !== "23505") throw new Error(error.message);
}

export function toSignal(row: Record<string, unknown>): SignalView {
  return {
    signal_id: Number(row.signal_id),
    source_layer: row.source_layer as SignalView["source_layer"],
    source: String(row.source ?? ""),
    signal_type: row.signal_type as SignalView["signal_type"],
    occurred_at: String(row.occurred_at),
    detected_at: String(row.detected_at ?? row.created_at ?? row.occurred_at),
    title: String(row.title ?? ""),
    confidence: Number(row.confidence),
    in_region: Boolean(row.in_region),
    vessel_id: (row.vessel_id as number | null) ?? null,
    contractor_id: (row.contractor_id as number | null) ?? null,
    watch_contractor_id: (row.watch_contractor_id as number | null) ?? null,
    operator_id: (row.operator_id as number | null) ?? null,
    worksite_id: (row.worksite_id as number | null) ?? null,
    geofence_id: (row.geofence_id as number | null) ?? null,
    dedup_key: String(row.dedup_key),
    fingerprint: String(row.fingerprint),
    url: (row.url as string | null) ?? null,
  };
}

export async function recordAndAlert(db: Db, ctx: RadarContext, drafts: SignalDraft[], now: string): Promise<{
  created: number;
  corroborated: number;
  alerts: (AlertDraft & { alert_id?: number })[];
}> {
  let created = 0;
  let corroborated = 0;
  const alerts: (AlertDraft & { alert_id?: number })[] = [];
  for (const draft of drafts) {
    if (draft.sector_id == null) {
      const employerId = draft.contractor_id ?? draft.operator_id;
      draft.sector_id = employerId ? ctx.sectorByEmployer.get(employerId) ?? null : null;
    }
    const saved = await saveSignal(db, draft, now);
    if (saved.created) created += 1;
    else corroborated += 1;
    if (saved.created || saved.confidenceRaised) {
      const opened = await openAlertsForSignal(db, saved.signal, ctx);
      alerts.push(...opened);
    }
  }
  return { created, corroborated, alerts };
}
