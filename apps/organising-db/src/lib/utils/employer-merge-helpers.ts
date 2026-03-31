import type { Employer } from "@/types/database";

/**
 * Build a newline-separated list of alias names from a set of employers
 * being merged. Excludes the canonical name itself and deduplicates
 * case-insensitively. Includes both employer_name and trading_name
 * from each selected employer.
 */
export function buildAliasLines(
  selected: Employer[],
  survivorId: number,
  canonical: string
): string {
  const canon = canonical.trim().toLowerCase();
  const lines = new Set<string>();
  for (const e of selected) {
    const name = e.employer_name?.trim();
    if (name && name.toLowerCase() !== canon) lines.add(name);
    const tr = e.trading_name?.trim();
    if (tr && tr.toLowerCase() !== canon) lines.add(tr);
  }
  return [...lines].sort().join("\n");
}

/**
 * Simple Levenshtein distance between two strings.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/**
 * Normalise an employer name for comparison: lowercase, strip
 * common suffixes (Pty Ltd, etc.), collapse whitespace.
 */
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

/**
 * Similarity ratio between two strings (0 = completely different, 1 = identical).
 * Based on normalised Levenshtein distance.
 */
export function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}
