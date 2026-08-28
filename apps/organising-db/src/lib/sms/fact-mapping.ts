import type { CampaignDataField } from "@/lib/campaign-facts/types";
import { parseFactRawValue, type ParsedFactValue } from "@/lib/campaign-facts/values";

export function mapSurveyAnswerToFact(
  field: Pick<CampaignDataField, "value_type" | "enum_options" | "scale_min" | "scale_max">,
  parsedValue: string | null,
  rawBody?: string | null
): ParsedFactValue {
  const primary = parseFactRawValue(field, parsedValue);
  if (primary.kind !== "empty" && primary.kind !== "invalid") return primary;
  if (field.value_type === "text") {
    return parseFactRawValue(field, parsedValue || rawBody);
  }
  return primary.kind === "invalid" ? primary : parseFactRawValue(field, rawBody);
}
