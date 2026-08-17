export const DEFAULT_SUPPORTIVE_BINARY_OUTCOME = "yes";

const NEUTRAL_BINARY_OUTCOMES = new Set(["unsure", "unknown", "abstain", "abstained", "maybe"]);
const YES_BINARY_OUTCOMES = new Set(["yes", "y", "true", "t", "1"]);
const NO_BINARY_OUTCOMES = new Set(["no", "n", "false", "f", "0"]);

export function canonicalBinaryOutcome(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (YES_BINARY_OUTCOMES.has(normalized)) return "yes";
  if (NO_BINARY_OUTCOMES.has(normalized)) return "no";
  if (NEUTRAL_BINARY_OUTCOMES.has(normalized)) {
    return normalized === "abstained" ? "abstain" : normalized;
  }
  return normalized;
}

export function supportiveBinaryOutcome(value: string | null | undefined): string {
  return canonicalBinaryOutcome(value) ?? DEFAULT_SUPPORTIVE_BINARY_OUTCOME;
}

export function isNeutralBinaryOutcome(value: string | null | undefined): boolean {
  const canonical = canonicalBinaryOutcome(value);
  return canonical != null && NEUTRAL_BINARY_OUTCOMES.has(canonical);
}

export function isSupportiveBinaryOutcome(args: {
  binaryValue: string | null | undefined;
  supporterOutcomeValue: string | null | undefined;
}): boolean {
  const binaryValue = canonicalBinaryOutcome(args.binaryValue);
  if (!binaryValue || isNeutralBinaryOutcome(binaryValue)) return false;
  return binaryValue === supportiveBinaryOutcome(args.supporterOutcomeValue);
}

export function pseudoNumericForBinaryOutcome(args: {
  binaryValue: string | null | undefined;
  supporterOutcomeValue: string | null | undefined;
}): 2 | 3 | 4 | null {
  const binaryValue = canonicalBinaryOutcome(args.binaryValue);
  if (!binaryValue) return null;
  if (isNeutralBinaryOutcome(binaryValue)) return 3;
  return binaryValue === supportiveBinaryOutcome(args.supporterOutcomeValue) ? 2 : 4;
}
