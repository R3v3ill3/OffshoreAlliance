import type {
  CampaignDataField,
  FactEnumOption,
  FactFilter,
  FactValueType,
  WorkerCampaignFact,
} from "./types";

const TRUTHY = new Set(["1", "yes", "y", "true", "t", "checked", "x", "on", "selected"]);
const FALSY = new Set(["0", "no", "n", "false", "f", "unchecked", "off"]);

export function slugifyFieldKey(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72);
  return slug || "field";
}

export function fieldKeyForCategory(
  category: "claims" | "compliance" | "other",
  label: string,
  explicit?: string | null
): string {
  const raw = (explicit ?? "").trim().toLowerCase();
  if (raw) return raw.slice(0, 80);
  const prefix = category === "other" ? "" : `${category === "claims" ? "claim" : "compliance"}.`;
  return `${prefix}${slugifyFieldKey(label)}`.slice(0, 80);
}

export function enumOptionValue(opt: FactEnumOption): string {
  return typeof opt === "string" ? opt : opt.value;
}

export function enumOptionLabel(opt: FactEnumOption): string {
  return typeof opt === "string" ? opt : opt.label || opt.value;
}

export function enumValues(options: FactEnumOption[] | null | undefined): string[] {
  if (!Array.isArray(options)) return [];
  return options.map(enumOptionValue).filter((v) => v.trim() !== "");
}

export type ParsedFactValue =
  | { kind: "bool"; value: boolean }
  | { kind: "int"; value: number }
  | { kind: "text"; value: string }
  | { kind: "enum"; value: string }
  | { kind: "multi"; value: string[] }
  | { kind: "empty" }
  | { kind: "invalid"; error: string };

export function parseFactRawValue(
  field: Pick<CampaignDataField, "value_type" | "enum_options" | "scale_min" | "scale_max">,
  raw: string | null | undefined
): ParsedFactValue {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { kind: "empty" };

  const type: FactValueType = field.value_type;
  const allowed = enumValues(field.enum_options);

  if (type === "boolean") {
    const lower = trimmed.toLowerCase();
    if (TRUTHY.has(lower)) return { kind: "bool", value: true };
    if (FALSY.has(lower)) return { kind: "bool", value: false };
    return { kind: "invalid", error: `Not a yes/no value: ${trimmed}` };
  }

  if (type === "integer" || type === "scale") {
    const n = Number(trimmed);
    if (!Number.isInteger(n)) return { kind: "invalid", error: `Not a whole number: ${trimmed}` };
    if (field.scale_min != null && n < field.scale_min) {
      return { kind: "invalid", error: `Below minimum ${field.scale_min}` };
    }
    if (field.scale_max != null && n > field.scale_max) {
      return { kind: "invalid", error: `Above maximum ${field.scale_max}` };
    }
    return { kind: "int", value: n };
  }

  if (type === "text") {
    return { kind: "text", value: trimmed.slice(0, 4000) };
  }

  if (type === "enum") {
    const hit = allowed.find((v) => v.toLowerCase() === trimmed.toLowerCase());
    if (!hit) return { kind: "invalid", error: `Not an allowed option: ${trimmed}` };
    return { kind: "enum", value: hit };
  }

  if (type === "multi_enum") {
    const parts = trimmed
      .split(/[,;/|]|\band\b/i)
      .map((s) => s.trim())
      .filter(Boolean);
    const mapped: string[] = [];
    for (const p of parts) {
      const hit = allowed.find((v) => v.toLowerCase() === p.toLowerCase());
      if (hit && !mapped.includes(hit)) mapped.push(hit);
    }
    if (mapped.length === 0) {
      return { kind: "invalid", error: `No recognised options in: ${trimmed}` };
    }
    return { kind: "multi", value: mapped };
  }

  return { kind: "invalid", error: `Unknown field type ${type}` };
}

export function parsedToRpcArgs(parsed: ParsedFactValue): {
  p_value_bool: boolean | null;
  p_value_int: number | null;
  p_value_text: string | null;
  p_value_enum: string | null;
  p_value_json: unknown;
} {
  const empty = {
    p_value_bool: null as boolean | null,
    p_value_int: null as number | null,
    p_value_text: null as string | null,
    p_value_enum: null as string | null,
    p_value_json: null as unknown,
  };
  if (parsed.kind === "bool") return { ...empty, p_value_bool: parsed.value };
  if (parsed.kind === "int") return { ...empty, p_value_int: parsed.value };
  if (parsed.kind === "text") return { ...empty, p_value_text: parsed.value };
  if (parsed.kind === "enum") return { ...empty, p_value_enum: parsed.value };
  if (parsed.kind === "multi") return { ...empty, p_value_json: parsed.value };
  return empty;
}

export function displayFactValue(
  field: Pick<CampaignDataField, "value_type" | "enum_options">,
  fact: Pick<
    WorkerCampaignFact,
    "value_bool" | "value_int" | "value_text" | "value_enum" | "value_json"
  > | null
): string {
  if (!fact) return "—";
  if (field.value_type === "boolean") {
    if (fact.value_bool == null) return "—";
    return fact.value_bool ? "Yes" : "No";
  }
  if (field.value_type === "integer" || field.value_type === "scale") {
    return fact.value_int == null ? "—" : String(fact.value_int);
  }
  if (field.value_type === "text") return fact.value_text?.trim() ? fact.value_text : "—";
  if (field.value_type === "enum") {
    const opts = field.enum_options ?? [];
    const v = fact.value_enum;
    if (!v) return "—";
    const opt = opts.find((o) => enumOptionValue(o) === v);
    return opt ? enumOptionLabel(opt) : v;
  }
  if (field.value_type === "multi_enum") {
    const arr = Array.isArray(fact.value_json) ? (fact.value_json as unknown[]) : [];
    const opts = field.enum_options ?? [];
    const labels = arr.map((raw) => {
      const v = String(raw);
      const opt = opts.find((o) => enumOptionValue(o) === v);
      return opt ? enumOptionLabel(opt) : v;
    });
    return labels.length ? labels.join(", ") : "—";
  }
  return "—";
}

export function numericFactValue(
  fact: Pick<WorkerCampaignFact, "value_int" | "value_bool"> | null | undefined
): number | null {
  if (!fact) return null;
  if (fact.value_int != null) return fact.value_int;
  if (fact.value_bool === true) return 1;
  if (fact.value_bool === false) return 0;
  return null;
}

function multiValues(fact: Pick<WorkerCampaignFact, "value_json"> | null): string[] {
  if (!fact || !Array.isArray(fact.value_json)) return [];
  return (fact.value_json as unknown[]).map((v) => String(v));
}

export function factMatchesFilter(
  fact: WorkerCampaignFact | null | undefined,
  filter: FactFilter
): boolean {
  if (filter.op === "missing") return fact == null;
  if (filter.op === "exists") return fact != null;
  if (!fact) return false;

  if (filter.op === "eq" && filter.bool !== undefined) {
    return fact.value_bool === filter.bool;
  }
  if (filter.op === "neq" && filter.bool !== undefined) {
    return fact.value_bool !== filter.bool;
  }
  if (filter.op === "eq" && filter.int !== undefined) {
    return fact.value_int === filter.int;
  }
  if (filter.op === "gte" && filter.int !== undefined) {
    return fact.value_int != null && fact.value_int >= filter.int;
  }
  if (filter.op === "lte" && filter.int !== undefined) {
    return fact.value_int != null && fact.value_int <= filter.int;
  }
  if (filter.op === "between" && filter.int !== undefined && filter.int_max !== undefined) {
    return (
      fact.value_int != null &&
      fact.value_int >= filter.int &&
      fact.value_int <= filter.int_max
    );
  }
  if ((filter.op === "eq" || filter.op === "in") && filter.enums && filter.enums.length > 0) {
    const set = new Set(filter.enums);
    if (fact.value_enum && set.has(fact.value_enum)) return true;
    return multiValues(fact).some((v) => set.has(v));
  }
  if (filter.op === "contains" && filter.text) {
    const needle = filter.text.toLowerCase();
    if (fact.value_text?.toLowerCase().includes(needle)) return true;
    if (fact.value_enum?.toLowerCase().includes(needle)) return true;
    return multiValues(fact).some((v) => v.toLowerCase().includes(needle));
  }
  return false;
}

export function workerPassesFactFilters(
  factsByField: Map<number, WorkerCampaignFact>,
  filters: FactFilter[]
): boolean {
  if (!filters.length) return true;
  return filters.every((f) => factMatchesFilter(factsByField.get(f.field_id) ?? null, f));
}

export function parseFactsQueryParam(raw: string | null): FactFilter[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFactFilter);
  } catch {
    return [];
  }
}

function isFactFilter(v: unknown): v is FactFilter {
  if (!v || typeof v !== "object") return false;
  const o = v as FactFilter;
  return Number.isInteger(o.field_id) && typeof o.op === "string";
}

export function encodeFactsQueryParam(filters: FactFilter[]): string {
  return JSON.stringify(filters);
}

/** Invert a 1..N rank (1 = most important) onto the 1–5 issue-heat scale. */
export function rankToSuggestedHeat(
  rank: number,
  maxRank: number
): 1 | 2 | 3 | 4 | 5 {
  if (maxRank <= 1) return 5;
  const t = (maxRank - rank) / (maxRank - 1);
  const heat = Math.round(1 + t * 4);
  return Math.min(5, Math.max(1, heat)) as 1 | 2 | 3 | 4 | 5;
}
