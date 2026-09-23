/**
 * Pure mirror of the back-fill predicate in `decide_name_match()` step 5
 * (supabase/migrations/20260922120000_da0_3_name_match_reviews.sql):
 *
 *   UPDATE workers SET <fk> = target
 *    WHERE <fk> IS NULL
 *      AND fold_name(<raw>) = review.normalised_name
 *      AND names_import_id IN (imports that queued this string)
 *
 * Used by the tests and the plan's documentation to state exactly which
 * rows a decision fills: a null FK only, the same folded raw string only,
 * and only workers whose names came from an import that queued the string.
 */

import { foldName } from "./name-fold";

export interface BackfillWorker {
  workerId: number;
  /** employer_id or worksite_id, whichever entity the review is for. */
  fkId: number | null;
  /** employer_name_raw or worksite_name_raw. */
  rawName: string | null;
  namesImportId: number | null;
}

export interface BackfillReview {
  normalisedName: string;
  /** import_id of every name_match_reviews row for this (entity, normalised_name). */
  siblingImportIds: readonly (number | null)[];
}

export function selectBackfillRows(
  workers: readonly BackfillWorker[],
  review: BackfillReview
): number[] {
  const imports = new Set(review.siblingImportIds.filter((id): id is number => id != null));
  return workers
    .filter(
      (w) =>
        w.fkId == null &&
        w.rawName != null &&
        foldName(w.rawName) === review.normalisedName &&
        w.namesImportId != null &&
        imports.has(w.namesImportId)
    )
    .map((w) => w.workerId)
    .sort((a, b) => a - b);
}
