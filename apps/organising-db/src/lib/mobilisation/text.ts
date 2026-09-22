/** Shared string helpers for matching, fingerprints, and vessel mentions. */

export function fold(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-boundary match that treats punctuation as a boundary. */
export function containsPhrase(haystack: string, phrase: string): boolean {
  const needle = phrase.trim();
  if (needle.length < 2) return false;
  const pattern = escapeRegExp(needle).replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${pattern}(?:$|[^a-z0-9])`, "i").test(haystack);
}

const NW_REGION =
  /north[\s-]?west|\bnws\b|carnarvon|browse|bonaparte|timor|exmouth|pilbara|dampier|barrow|karratha|broome|northern territory|\bnt\b/i;
const SE_REGION = /bass strait|gippsland|otway|south[\s-]?east victoria|yolla|kipper/i;

export type RegionClass = "nw" | "se" | "mixed" | "other" | "unknown";

export function classifyRegion(text: string): RegionClass {
  const trimmed = text.trim();
  if (!trimmed) return "unknown";
  const nw = NW_REGION.test(trimmed);
  const se = SE_REGION.test(trimmed);
  if (nw && se) return "mixed";
  if (nw) return "nw";
  if (se) return "se";
  if (/\baustralia\b/i.test(trimmed)) return "other";
  return "unknown";
}

const AWARD =
  /\b(award(?:ed)?|contract(?:ed|s)?|wins?|won|secur(?:es|ed)|mobilis(?:e|ation|ing)|charter(?:ed)?)\b/i;

export function looksLikeAward(text: string): boolean {
  return AWARD.test(text);
}

const STRONG_DEST =
  /dampier|broome|karratha|exmouth|barrow|onslow|port hedland|hedland|darwin|ichthys|prelude|gorgon|wheatstone|scarborough|pluto|browse|bonaparte|carnarvon|timor|north west/i;

const WEAK_DEST = /\baustralia\b|\bau\b|fremantle|perth/i;

export function destinationStrength(destination: string | null): "strong" | "weak" | "none" {
  if (!destination) return "none";
  if (STRONG_DEST.test(destination)) return "strong";
  if (WEAK_DEST.test(destination)) return "weak";
  return "none";
}

const IMO_RE = /\bIMO[\s:#-]*(\d{7})\b/gi;

export interface VesselMention {
  name: string;
  imo: string | null;
  vessel_id: number | null;
}

/**
 * Pull IMO numbers and watchlist vessel names out of EP summary text.
 * Names are matched as phrases so "Seven Oceans" does not hit the word "seven".
 */
export function extractVesselMentions(
  text: string,
  vessels: { vessel_id: number; name: string; imo: string | null }[]
): VesselMention[] {
  const found = new Map<string, VesselMention>();
  for (const match of text.matchAll(IMO_RE)) {
    const imo = match[1]!;
    const known = vessels.find((v) => v.imo === imo);
    found.set(imo, {
      name: known?.name ?? `IMO ${imo}`,
      imo,
      vessel_id: known?.vessel_id ?? null,
    });
  }
  for (const vessel of vessels) {
    if (!containsPhrase(text, vessel.name)) continue;
    const key = vessel.imo ?? `name:${vessel.vessel_id}`;
    const existing = vessel.imo ? found.get(vessel.imo) : undefined;
    found.set(key, {
      ...existing,
      name: vessel.name,
      imo: vessel.imo ?? existing?.imo ?? null,
      vessel_id: vessel.vessel_id,
    });
  }
  return [...found.values()];
}

/** Subsea 7's "Seven …" construction fleet, without matching the number seven. */
export function mentionsSevenFleet(text: string): boolean {
  return /\bSeven\s+[A-Z][A-Za-z]+/.test(text);
}

export function significantTokens(title: string): string[] {
  const stop = new Set([
    "the", "a", "an", "of", "and", "or", "for", "to", "in", "on", "at", "by",
    "with", "from", "as", "its", "be", "is", "are", "offshore", "australia",
    "australian", "ltd", "pty", "limited", "group",
  ]);
  return fold(title)
    .split(" ")
    .filter((t) => t.length > 2 && !stop.has(t));
}

/** Jaccard overlap on significant tokens. Used to collapse the same story. */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(significantTokens(a));
  const tb = new Set(significantTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const token of ta) if (tb.has(token)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, Math.round(n * 1000) / 1000));
}

export function isoDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function weekBucket(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
