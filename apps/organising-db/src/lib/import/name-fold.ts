/**
 * Name folding for exact-match lookups (DA0.3, plan §2.3.2).
 *
 * `foldName` is byte-for-byte the rule of the SQL function `public.fold_name()`
 * (supabase/migrations/20260922120000_da0_3_name_match_reviews.sql):
 *
 *     lower(btrim(regexp_replace(p, '\s+', ' ', 'g')))
 *
 * i.e. every run of whitespace (spaces, tabs, newlines) becomes one space,
 * leading and trailing space is removed, and the result is lower-cased.
 * "Exact" means exact after folding and nothing more: legal suffixes such as
 * "Pty Ltd" are NOT stripped here — suffix tolerance is the fuzzy step's job
 * (`normaliseForMerge` in @oa/employer-matching). Parity over a fixed list of
 * strings is asserted by `__tests__/name-fold.test.ts` (in process) and by the
 * contract suite (against the database).
 *
 * Non-ASCII whitespace (e.g. U+00A0) is outside the parity guarantee: JS `\s`
 * matches it, Postgres `\s` follows the server locale. Organisation names in
 * the membership exports are ASCII.
 */
export function foldName(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}
