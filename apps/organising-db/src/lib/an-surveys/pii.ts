/**
 * PII scrubbing for free-text survey answers before they leave the app
 * (Claude calls, HTML export). Identity columns are never sent at all; this
 * covers the things people type into a notes box.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
/** 8+ digits allowing spaces/dashes/parens/plus between — phone-shaped. */
const PHONE_RE = /(?:\+?\d[\d\s().-]{6,}\d)/g;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface ScrubOptions {
  /** Name tokens (first/last names of the respondent) to redact, ≥ 3 chars. */
  names?: string[];
  maxLength?: number;
}

export function scrubText(text: string, opts: ScrubOptions = {}): string {
  let out = text
    .replace(EMAIL_RE, "[email]")
    .replace(URL_RE, "[link]")
    .replace(PHONE_RE, (m) => (m.replace(/\D/g, "").length >= 8 ? "[phone]" : m));

  const names = (opts.names ?? [])
    .map((n) => n.trim())
    .filter((n) => n.length >= 3);
  if (names.length) {
    const re = new RegExp(`\\b(${names.map(escapeRe).join("|")})\\b`, "gi");
    out = out.replace(re, "[name]");
  }

  out = out.replace(/\s+/g, " ").trim();
  const max = opts.maxLength ?? 300;
  if (out.length > max) out = `${out.slice(0, max - 1).trimEnd()}…`;
  return out;
}

/** Name tokens for a row given the detected identity columns. */
export function nameTokensForRow(
  row: Record<string, string>,
  identityColumns: { first?: string | null; last?: string | null; full?: string | null }
): string[] {
  const tokens: string[] = [];
  for (const col of [identityColumns.first, identityColumns.last, identityColumns.full]) {
    if (!col) continue;
    const v = row[col];
    if (!v) continue;
    for (const part of v.split(/\s+/)) if (part.length >= 3) tokens.push(part);
  }
  return tokens;
}
