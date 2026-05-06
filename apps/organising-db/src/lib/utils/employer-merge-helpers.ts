import type { Employer } from "@/types/database";

export {
  levenshtein,
  similarityRatio,
  normaliseForMerge,
} from "@oa/employer-matching";

/**
 * Build a newline-separated list of alias names from a set of employers
 * being merged. Excludes the canonical name itself and deduplicates
 * case-insensitively. Includes both employer_name and trading_name
 * from each selected employer.
 */
export function buildAliasLines(
  selected: Employer[],
  _survivorId: number,
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
