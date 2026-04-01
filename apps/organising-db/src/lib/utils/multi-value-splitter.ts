/**
 * Domain-aware multi-value cell splitting for offshore industry data.
 *
 * Worksites and occupations frequently appear as compound values in
 * spreadsheets (e.g. "Inspector/NDT", "Barrow Island - Gorgon").
 * This module detects likely multi-value entries and proposes splits
 * while preserving known single-value terms that contain separators.
 */

export type EntityType = "worksite" | "occupation";

export interface SplitResult {
  isMultiValue: boolean;
  parts: string[];
  separator: string | null;
  original: string;
}

const WORKSITE_KEEP_WHOLE: RegExp[] = [
  /^DP\d/i,
  /^[A-Z]{2,4}\d/i,               // rig/vessel codes like "DP2 Seamaster"
  /^broome\s*-\s*fixed/i,          // "Broome - fixed base 5:2"
  /\d+\s*st\s*george/i,            // "140 St Georges Terrace, Perth"
  /train\s*\d/i,                    // "Pluto train 2"
  /\boffshore\s*vessel\b/i,
  /\bfixed\s*base\b/i,
];

const OCCUPATION_KEEP_WHOLE: RegExp[] = [
  /^leading\s*hand\s*-/i,
  /^senior\s*-/i,
  /\bE\s*&\s*I\b/i,
  /\bQA\s*\/\s*QC\b/i,
  /\bTA\b/i,
  /\bO\s*&\s*M\b/i,
  /\bR\s*&\s*D\b/i,
  /^plant\s*inspector\s*-/i,
  /\bAICIP\b/i,
  /\bcrane\s*inspector\b/i,
  /^lead\s/i,
  /\bfield\s*maintenance/i,
  /\bTE\s*&/i,
  /\bcsu\b/i,
];

function shouldKeepWhole(value: string, entityType: EntityType): boolean {
  const patterns =
    entityType === "worksite" ? WORKSITE_KEEP_WHOLE : OCCUPATION_KEEP_WHOLE;
  return patterns.some((p) => p.test(value));
}

function cleanPart(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Detect and propose a split for a potentially multi-value cell.
 * Returns the original value as a single-element array when no
 * split is warranted.
 */
export function detectMultiValue(
  value: string,
  entityType: EntityType
): SplitResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { isMultiValue: false, parts: [], separator: null, original: value };
  }

  if (shouldKeepWhole(trimmed, entityType)) {
    return {
      isMultiValue: false,
      parts: [trimmed],
      separator: null,
      original: value,
    };
  }

  // Try comma first (strongest separator signal)
  if (trimmed.includes(",")) {
    const parts = trimmed.split(",").map(cleanPart).filter(Boolean);
    if (parts.length > 1) {
      return { isMultiValue: true, parts, separator: ",", original: value };
    }
  }

  // For worksites, " - " is a strong separator (but not for occupations where it's a qualifier)
  if (entityType === "worksite" && / - /.test(trimmed)) {
    const parts = trimmed.split(/ - /).map(cleanPart).filter(Boolean);
    if (parts.length > 1) {
      return { isMultiValue: true, parts, separator: " - ", original: value };
    }
  }

  // "/" is a separator in both entity types, but skip known compound terms
  if (trimmed.includes("/")) {
    if (entityType === "occupation") {
      if (/\bQA\s*\/\s*QC\b/i.test(trimmed)) {
        return {
          isMultiValue: false,
          parts: [trimmed],
          separator: null,
          original: value,
        };
      }
    }

    const parts = trimmed.split("/").map(cleanPart).filter(Boolean);
    if (parts.length > 1 && parts.every((p) => p.length >= 2)) {
      return { isMultiValue: true, parts, separator: "/", original: value };
    }
  }

  return {
    isMultiValue: false,
    parts: [trimmed],
    separator: null,
    original: value,
  };
}
