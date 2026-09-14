import { isStructureApiError, type StructureApiError } from "@/lib/campaign/structure-api";

/**
 * WP2.2 Stage 4 — the one place the wall chart turns a `StructureApiError`
 * into the sentence an organiser sees (wp2.2.md §3.2 kinds, §3.4 C-c K1,
 * §8.3 D17).
 *
 * Anything that is not a `StructureApiError` keeps its own message
 * unchanged (`err.message`), so the WP2.3 assertion that a failed move
 * "surfaces the mutation's own message" still holds byte-for-byte; the
 * `fallback` is used only when there is no message at all.
 */

/** The K1 sentence (wp2.2.md §3.4 C-c): a same-group copy is refused, not converted to a move. */
export const ALREADY_IN_GROUP_MESSAGE = "Already in this group — use Move.";

export function structureErrorMessage(err: unknown, fallback: string): string {
  if (isStructureApiError(err)) {
    switch (err.kind) {
      case "duplicate_in_group":
        return ALREADY_IN_GROUP_MESSAGE;
      case "rule_violation":
        // D17 and the other P0001 rules: the database sentence is English, not
        // SQL, but it needs the context of what refused it.
        return `Not allowed by the unit structure rules: ${err.message}`;
      case "forbidden":
        return "You don't have permission to change this campaign's units.";
      case "schema_missing":
        return "The structure API is not installed on this database (structure_* functions are missing).";
      default:
        return err.message || fallback;
    }
  }
  return err instanceof Error ? err.message || fallback : fallback;
}

/**
 * The split dialog's wording for `duplicate_in_group`: the refused row is a
 * cross-group child whose group already holds the worker in another unit, so
 * the K1 "use Move" remedy does not apply. The RPC's DETAIL names the unit
 * ("… worker 105 is already on organising unit 44 in that group."); the
 * sentence after the constraint's "Key … already exists." is kept.
 */
export function splitDuplicateInGroupMessage(err: StructureApiError): string {
  const detail = err.details?.replace(/^Key \(.*?\) already exists\.\s*/u, "").replace(/^p_assignments\[\d+\]:\s*/u, "").trim();
  return `A worker is already placed in that group in another unit${detail ? ` — ${detail}` : "."}`;
}
