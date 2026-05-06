export function normaliseForMerge(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(pty\.?\s*ltd\.?|ltd\.?|pty\.?|inc\.?|corp\.?|llc\.?|llp\.?)\b/gi,
      ""
    )
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
