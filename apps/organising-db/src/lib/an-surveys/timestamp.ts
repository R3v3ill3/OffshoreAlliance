/**
 * Parse Action Network export timestamps to UTC ISO strings.
 *
 * AN writes "2026-09-09 22:47:42 ET" under a header like "Timestamp (ET)".
 * The zone abbreviation may sit in the cell, in the header, or nowhere
 * (then ISO / offset strings are accepted as-is).
 */

const ZONE_BY_ABBREV: Record<string, string> = {
  ET: "America/New_York",
  EST: "America/New_York",
  EDT: "America/New_York",
  CT: "America/Chicago",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  MT: "America/Denver",
  MST: "America/Denver",
  MDT: "America/Denver",
  PT: "America/Los_Angeles",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  UTC: "UTC",
  GMT: "UTC",
  Z: "UTC",
  AEST: "Australia/Brisbane",
  AEDT: "Australia/Sydney",
  AWST: "Australia/Perth",
  ACST: "Australia/Darwin",
};

const LOCAL_RE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\s+([A-Za-z]{1,4}))?$/;

const OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})$/;

/** Offset (ms) of `zone` at the given UTC instant. */
function zoneOffsetMs(utcMs: number, zone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - utcMs;
}

/** Zone abbreviation embedded in a header like "Timestamp (ET)". */
export function zoneFromHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = header.match(/\(([A-Za-z]{1,4})\)\s*$/);
  if (!m) return null;
  return ZONE_BY_ABBREV[m[1].toUpperCase()] ?? null;
}

/**
 * Returns an ISO-8601 UTC string, or null when the cell cannot be parsed.
 * `defaultZone` applies when neither the cell nor an explicit offset names
 * a zone (AN's convention is the header's "(ET)").
 */
export function parseSubmittedAt(
  raw: string | null | undefined,
  defaultZone: string | null = "America/New_York"
): string | null {
  if (!raw) return null;
  const value = String(raw).trim();
  if (!value) return null;

  if (OFFSET_RE.test(value) || /T\d{2}:\d{2}.*Z$/.test(value)) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  const m = value.match(LOCAL_RE);
  if (!m) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  const [, y, mo, d, h, mi, s, abbrev] = m;
  const zone = (abbrev ? ZONE_BY_ABBREV[abbrev.toUpperCase()] : null) ?? defaultZone;
  const naive = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  if (!zone || zone === "UTC") return new Date(naive).toISOString();

  // Two-pass: offset at the naive instant, then re-evaluate at the corrected instant.
  let offset = zoneOffsetMs(naive, zone);
  let utc = naive - offset;
  const offset2 = zoneOffsetMs(utc, zone);
  if (offset2 !== offset) {
    offset = offset2;
    utc = naive - offset;
  }
  return new Date(utc).toISOString();
}
