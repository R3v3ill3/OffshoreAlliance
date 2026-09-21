import type { MembershipUpdateKind } from "./kinds";

export type MembershipUpdateBatchStatus = "receiving" | "ready" | "imported" | "dismissed";

export interface MembershipUpdateBatch {
  batch_id: number;
  week_ending: string;
  status: MembershipUpdateBatchStatus;
  source: "email" | "manual";
  source_email_id: string | null;
  source_from: string | null;
  source_subject: string | null;
  received_at: string;
  ready_at: string | null;
  imported_at: string | null;
  imported_by: string | null;
  import_summary: Record<string, unknown> | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
}

export interface MembershipUpdateFileRow {
  file_id: number;
  batch_id: number;
  kind: MembershipUpdateKind;
  filename: string;
  storage_bucket: string;
  storage_path: string;
  byte_size: number | null;
  row_count: number | null;
  received_at: string;
}

export interface MembershipMovementSnapshot {
  snapshot_id: number;
  as_of: string;
  source: string;
  batch_id: number | null;
  new_members: number;
  recommenced_members: number;
  resigned_members: number;
  unfinancial_members: number;
  net_movement: number;
  tags: string[];
  notes: string | null;
}

export interface MembershipUpdateAdmin {
  user_id: string;
  display_name: string | null;
  role: string;
}

export interface MembershipUpdatesListResponse {
  batches: MembershipUpdateBatch[];
  files: MembershipUpdateFileRow[];
  snapshots: MembershipMovementSnapshot[];
  notifyUserIds: string[];
  admins: MembershipUpdateAdmin[];
  inboundAddress: string;
  effectiveRecipients: string[];
}

export interface MembershipUpdateNotification {
  notification_id: number;
  batch_id: number;
  created_at: string;
  seen_at: string | null;
  dismissed_at: string | null;
  batch: {
    batch_id: number;
    week_ending: string;
    status: MembershipUpdateBatchStatus;
    ready_at: string | null;
  } | null;
}

export interface MembershipUpdateNotificationsResponse {
  notifications: MembershipUpdateNotification[];
  files: Pick<MembershipUpdateFileRow, "batch_id" | "kind" | "row_count" | "filename">[];
  snapshots: MembershipMovementSnapshot[];
}
