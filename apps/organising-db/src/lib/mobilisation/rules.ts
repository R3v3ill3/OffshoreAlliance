import { alertDedup } from "./dedup";
import { maxPriority } from "./confidence";
import type {
  AlertDraft,
  AlertPriority,
  ExistingAlert,
  RuleRow,
  SignalView,
} from "./types";

const LAYER_LABEL: Record<string, string> = {
  regulatory: "NOPSEMA",
  commercial: "commercial",
  ais: "AIS",
};

export interface PlanInput {
  rules: RuleRow[];
  signal: SignalView;
  /** Other recent signals for the same contractor or vessel, excluding none — include history only. */
  recent: SignalView[];
  existingAlerts: ExistingAlert[];
  now: string;
}

/**
 * Decide which alerts a newly stored signal should open or join.
 * A dismissed dedup key stays dismissed. Snoozed and open alerts gain the
 * signal instead of firing a second time.
 */
export function planAlerts(input: PlanInput): {
  create: AlertDraft[];
  attach: { alert_id: number; signal_id: number }[];
} {
  const create: AlertDraft[] = [];
  const attach: { alert_id: number; signal_id: number }[] = [];
  const enabled = input.rules.filter((r) => r.enabled);

  for (const rule of enabled) {
    const draft = draftFor(rule, input.signal, input.recent);
    if (!draft) continue;
    const existing = input.existingAlerts.find((a) => a.dedup_key === draft.dedup_key);
    if (existing) {
      if (existing.status === "dismissed") continue;
      attach.push({ alert_id: existing.alert_id, signal_id: input.signal.signal_id });
      continue;
    }
    create.push(draft);
  }

  return { create, attach };
}

function draftFor(rule: RuleRow, signal: SignalView, recent: SignalView[]): AlertDraft | null {
  const min = rule.config.minConfidence ?? 0;
  if (signal.confidence < min) return null;

  if (rule.code === "vessel_geofence") {
    if (signal.source_layer !== "ais") return null;
    if (signal.signal_type !== "vessel_area_entry" && signal.signal_type !== "vessel_course_toward") {
      return null;
    }
    if (!signal.in_region) return null;
    const entity = entityKey(signal);
    return baseDraft(rule, signal, entity, [signal.signal_id], signal.confidence);
  }

  if (rule.code === "regulatory_watch") {
    if (signal.source_layer !== "regulatory" || !signal.in_region) return null;
    return baseDraft(rule, signal, entityKey(signal), [signal.signal_id], signal.confidence);
  }

  if (rule.code === "commercial_watch") {
    if (signal.source_layer !== "commercial" || !signal.in_region) return null;
    return baseDraft(rule, signal, entityKey(signal), [signal.signal_id], signal.confidence);
  }

  if (rule.code === "imminent_mobilisation") {
    return imminentDraft(rule, signal, recent);
  }

  return null;
}

function imminentDraft(rule: RuleRow, signal: SignalView, recent: SignalView[]): AlertDraft | null {
  if (!signal.contractor_id && !signal.watch_contractor_id && !signal.vessel_id) return null;
  const windowDays = rule.config.windowDays ?? 42;
  const minLayers = rule.config.minLayers ?? 2;
  const cutoff = Date.now() - windowDays * 86400000;
  const related = [signal, ...recent].filter((s) => {
    const t = new Date(s.occurred_at).getTime();
    if (Number.isNaN(t) || t < cutoff) return false;
    if (signal.watch_contractor_id && s.watch_contractor_id === signal.watch_contractor_id) return true;
    if (signal.contractor_id && s.contractor_id === signal.contractor_id) return true;
    if (signal.vessel_id && s.vessel_id === signal.vessel_id) return true;
    return false;
  });
  const layers = new Set(related.map((s) => s.source_layer));
  if (layers.size < minLayers) return null;

  const confidence = fusionConfidence(related, layers.size);
  const min = rule.config.minConfidence ?? 0.6;
  if (confidence < min) return null;

  const priority: AlertPriority = layers.size >= 3 || (layers.has("ais") && layers.size >= 2)
    ? "critical"
    : maxPriority(rule.priority, "high");
  const names = [...layers].map((l) => LAYER_LABEL[l] ?? l).join(" + ");
  const entity = signal.watch_contractor_id
    ? `watch:${signal.watch_contractor_id}`
    : signal.contractor_id
      ? `contractor:${signal.contractor_id}`
      : `vessel:${signal.vessel_id}`;
  return {
    rule_code: rule.code,
    rule_id: rule.rule_id,
    dedup_key: alertDedup(rule.code, entity, signal.occurred_at),
    priority,
    title: `Imminent mobilisation — ${names}`,
    summary: `${layers.size} layers (${names}) for the same contractor or vessel inside ${windowDays} days. Treat AIS as timing, not the only evidence.`,
    confidence,
    contractor_id: signal.contractor_id,
    watch_contractor_id: signal.watch_contractor_id,
    vessel_id: signal.vessel_id,
    operator_id: signal.operator_id,
    worksite_id: signal.worksite_id,
    signal_ids: related.map((s) => s.signal_id),
  };
}

function fusionConfidence(signals: SignalView[], layerCount: number): number {
  const avg = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;
  return Math.min(0.95, Math.round((0.55 + 0.12 * layerCount + avg * 0.15) * 1000) / 1000);
}

function entityKey(signal: SignalView): string {
  if (signal.vessel_id) return `vessel:${signal.vessel_id}`;
  if (signal.watch_contractor_id) return `watch:${signal.watch_contractor_id}`;
  if (signal.contractor_id) return `contractor:${signal.contractor_id}`;
  if (signal.operator_id) return `operator:${signal.operator_id}`;
  return `signal:${signal.signal_id}`;
}

function baseDraft(
  rule: RuleRow,
  signal: SignalView,
  entity: string,
  signalIds: number[],
  confidence: number
): AlertDraft {
  return {
    rule_code: rule.code,
    rule_id: rule.rule_id,
    dedup_key: alertDedup(rule.code, entity, signal.occurred_at),
    priority: rule.priority,
    title: signal.title,
    summary: `${rule.name}: ${signal.title}`,
    confidence,
    contractor_id: signal.contractor_id,
    watch_contractor_id: signal.watch_contractor_id,
    vessel_id: signal.vessel_id,
    operator_id: signal.operator_id,
    worksite_id: signal.worksite_id,
    signal_ids: signalIds,
  };
}
