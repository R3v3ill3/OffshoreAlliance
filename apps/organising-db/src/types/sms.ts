// Hand-written row types for the 20260810100000_sms_foundations tables.
// TODO: replace with generated types after migration apply (pnpm gen:types).

export type SmsNumberPurpose = "organiser" | "relay" | "survey" | "spare";

export interface SmsNumberRow {
  number_id: number;
  phone_e164: string;
  label: string | null;
  purpose: SmsNumberPurpose;
  organiser_id: number | null;
  provider: string;
  status: "active" | "retired";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SmsNumberAssignmentRow {
  assignment_id: number;
  number_id: number;
  purpose: SmsNumberPurpose;
  organiser_id: number | null;
  assigned_at: string;
  unassigned_at: string | null;
}
