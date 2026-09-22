import type { SignalDraft } from "./types";
import { isoDay, significantTokens, titleSimilarity, weekBucket } from "./text";

export function regulatoryDedup(externalId: string, status: string, updated: string): string {
  return `regulatory:${externalId}:${foldKey(status)}:${foldKey(updated)}`;
}

export function regulatoryFingerprint(externalId: string): string {
  return `regulatory:${externalId}`;
}

export function commercialDedup(sourceKey: string, externalId: string): string {
  return `commercial:${sourceKey}:${externalId}`;
}

/**
 * Same contractor, same day, similar headline — the cross-source collapse key.
 * The first eight significant tokens keep "Saipem wins Scarborough" aligned
 * across ASX and trade press without merging unrelated stories that week.
 */
export function commercialFingerprint(
  contractorKey: string,
  occurredAt: string,
  title: string
): string {
  const tokens = significantTokens(title).slice(0, 8).join("-") || "untitled";
  return `commercial:${contractorKey}:${isoDay(occurredAt)}:${tokens}`;
}

export function titlesCollide(a: string, b: string): boolean {
  return titleSimilarity(a, b) >= 0.6;
}

export function aisDedup(
  kind: "entry" | "exit" | "inbound",
  imoOrId: string,
  geofenceId: number,
  occurredAt: string
): string {
  return `ais:${kind}:${imoOrId}:${geofenceId}:${isoDay(occurredAt)}`;
}

export function aisFingerprint(
  kind: "entry" | "exit" | "inbound",
  imoOrId: string,
  geofenceId: number,
  occurredAt: string
): string {
  return aisDedup(kind, imoOrId, geofenceId, occurredAt);
}

export function alertDedup(ruleCode: string, entityKey: string, occurredAt: string): string {
  if (ruleCode === "imminent_mobilisation") {
    return `imminent:${entityKey}:${weekBucket(occurredAt)}`;
  }
  return `${ruleCode}:${entityKey}:${isoDay(occurredAt)}`;
}

function foldKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
}

export function corroborationBump(draft: SignalDraft, existingConfidence: number): number {
  return Math.min(0.95, Math.round((Math.max(draft.confidence, existingConfidence) + 0.05) * 1000) / 1000);
}
