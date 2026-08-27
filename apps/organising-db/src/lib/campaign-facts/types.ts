export const FACT_CATEGORIES = ["claims", "compliance", "other"] as const;
export type FactCategory = (typeof FACT_CATEGORIES)[number];

export const FACT_VALUE_TYPES = [
  "boolean",
  "enum",
  "integer",
  "scale",
  "text",
  "multi_enum",
] as const;
export type FactValueType = (typeof FACT_VALUE_TYPES)[number];

export const FACT_SOURCES = [
  "sms_survey",
  "an_csv",
  "email",
  "phone",
  "staff",
] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

export type FactEnumOption = string | { value: string; label: string };

export type CampaignDataFieldset = {
  fieldset_id: number;
  campaign_id: number;
  title: string;
  category: FactCategory;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignDataField = {
  field_id: number;
  campaign_id: number;
  fieldset_id: number | null;
  key: string;
  label: string;
  category: FactCategory;
  value_type: FactValueType;
  enum_options: FactEnumOption[] | null;
  scale_min: number | null;
  scale_max: number | null;
  filterable: boolean;
  sortable: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkerCampaignFact = {
  fact_id: number;
  campaign_id: number;
  worker_id: number;
  field_id: number;
  value_bool: boolean | null;
  value_int: number | null;
  value_text: string | null;
  value_enum: string | null;
  value_json: unknown;
  collected_at: string;
  source: FactSource;
  source_ref: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FactFilterOp =
  | "eq"
  | "neq"
  | "in"
  | "gte"
  | "lte"
  | "between"
  | "exists"
  | "missing"
  | "contains";

export type FactFilter = {
  field_id: number;
  op: FactFilterOp;
  bool?: boolean;
  int?: number;
  int_max?: number;
  enums?: string[];
  text?: string;
};

export const FACT_SOURCE_LABELS: Record<FactSource, string> = {
  sms_survey: "SMS survey",
  an_csv: "Action Network CSV",
  email: "Email",
  phone: "Phone",
  staff: "Staff",
};

export const FACT_CATEGORY_LABELS: Record<FactCategory, string> = {
  claims: "Claims",
  compliance: "Compliance",
  other: "Other",
};

export const FACT_VALUE_TYPE_LABELS: Record<FactValueType, string> = {
  boolean: "Yes / no",
  enum: "Single choice",
  integer: "Number",
  scale: "Scale",
  text: "Text",
  multi_enum: "Multiple choice",
};
