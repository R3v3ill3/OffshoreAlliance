/**
 * Response-type decisions for the create-assessment dialog.
 *
 * Extracted because both of them were previously inline and both were
 * wrong in the same direction — they let the template, rather than the
 * author, decide whether an assessment was binary:
 *
 *   - the binary control only rendered under the Custom template, so
 *     choosing any template removed the ability to make a binary
 *     assessment at all;
 *   - at save time the template's `defaultBinary` overrode whatever the
 *     author had selected;
 *   - `supporter_outcome_value` defaulted to "yes" only for the `vote`
 *     template, so every other binary assessment saved without one even
 *     though the form displayed "yes".
 *
 * Pure module — unit tested in __tests__/assessment-form.test.ts.
 */

import { ACTIVITY_TEMPLATE_OPTIONS } from "@/lib/campaign/constants";

/** Sentinel used by the dialog's template select for "no template". */
export const CUSTOM_TEMPLATE = "__custom__";

/**
 * Response type to seed when a template is chosen.
 *
 * Returns the template's default, or the author's current choice when
 * they pick Custom — switching to Custom should not silently reset a
 * deliberate selection. The result is a starting point: the author can
 * always change it afterwards.
 */
export function seedIsBinaryForTemplate(
  templateChoice: string,
  currentIsBinary: boolean,
): boolean {
  if (templateChoice === CUSTOM_TEMPLATE) return currentIsBinary;
  const template = ACTIVITY_TEMPLATE_OPTIONS.find(
    (t) => t.key === templateChoice,
  );
  return template?.defaultBinary ?? false;
}

/**
 * The supporter outcome to persist.
 *
 * NULL for a rating-scale assessment. For a binary one, the author's
 * choice, or "yes" — which is what the picker shows at rest, so an
 * untouched form must save the value it appeared to be offering.
 */
export function supporterOutcomeForSave(
  isBinary: boolean,
  chosen: string | null | undefined,
): string | null {
  if (!isBinary) return null;
  const trimmed = (chosen ?? "").trim();
  return trimmed === "" ? "yes" : trimmed;
}
