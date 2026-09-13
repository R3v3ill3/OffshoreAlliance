/**
 * Cell / option normalisation shared by the classifier and aggregator.
 */

/** Trim + collapse whitespace — for display. Never rewrites characters. */
export function cleanCell(raw: string | null | undefined): string {
  if (raw == null) return "";
  return String(raw).replace(/\s+/g, " ").trim();
}

/**
 * Case-insensitive, dash-agnostic key so "Yes"/"yes" and
 * "Definite — available" / "Definite - available" merge into one option.
 */
export function optionKey(raw: string | null | undefined): string {
  return cleanCell(raw)
    .toLowerCase()
    .replace(/\s*[—–-]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Stable slug for a question key. */
export function slugify(label: string): string {
  const s = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "q";
}

export function uniqueSlug(base: string, taken: Set<string>): string {
  let candidate = base;
  let i = 2;
  while (taken.has(candidate)) candidate = `${base}_${i++}`;
  taken.add(candidate);
  return candidate;
}
