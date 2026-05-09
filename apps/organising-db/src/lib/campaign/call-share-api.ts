import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashLeaderToken } from "@/lib/campaign/token-crypto";
import {
  cookieNameFromToken,
  verifyCallShareSession,
} from "@/lib/campaign/call-share-session";

export type CallShareTokenRow = {
  token_id: number;
  list_id: number;
  issued_by: string;
  leader_worker_id: number | null;
  expires_at: string | null;
  revoked_at: string | null;
  locked_until: string | null;
};

export type CallShareSession = {
  tokenId: number;
  label: string;
  workerId: number | null;
};

export type ResolveCallShareTokenOutcome =
  | { kind: "ok"; row: CallShareTokenRow }
  | { kind: "not_found" }
  | { kind: "revoked" }
  | { kind: "expired" }
  | { kind: "locked"; locked_until: string };

export function clientIpHash(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const candidate = (xff?.split(",")[0]?.trim() || realIp || "").trim();
  if (!candidate) return null;
  return createHash("sha256").update(candidate, "utf8").digest("hex");
}

export async function resolveCallShareTokenRow(
  admin: ReturnType<typeof createAdminClient>,
  rawToken: string,
): Promise<ResolveCallShareTokenOutcome> {
  const token_hash = hashLeaderToken(rawToken);
  const { data: row, error } = await admin
    .from("call_share_tokens")
    .select("token_id, list_id, issued_by, leader_worker_id, expires_at, revoked_at, locked_until")
    .eq("token_hash", token_hash)
    .maybeSingle();

  if (error || !row) return { kind: "not_found" };
  if (row.revoked_at) return { kind: "revoked" };
  if (row.expires_at && new Date(row.expires_at) < new Date()) return { kind: "expired" };
  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    return { kind: "locked", locked_until: row.locked_until };
  }
  return { kind: "ok", row: row as CallShareTokenRow };
}

export function tokenStatusResponse(outcome: ResolveCallShareTokenOutcome): NextResponse | null {
  if (outcome.kind === "ok") return null;
  if (outcome.kind === "not_found") {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }
  if (outcome.kind === "revoked") {
    return NextResponse.json({ error: "Link revoked" }, { status: 410 });
  }
  if (outcome.kind === "expired") {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }
  return NextResponse.json(
    { error: "Locked", locked_until: outcome.locked_until },
    { status: 423 },
  );
}

export function requireCallShareSession(
  request: NextRequest,
  urlToken: string,
  tokenRow: CallShareTokenRow,
): CallShareSession | null {
  const cookieName = cookieNameFromToken(urlToken);
  const cookie = request.cookies.get(cookieName);
  const verified = verifyCallShareSession(urlToken, cookie?.value);
  if (!verified || verified.tokenId !== tokenRow.token_id) return null;
  return verified;
}

export async function logCallShareEvent(
  admin: ReturnType<typeof createAdminClient>,
  tokenId: number,
  eventType: string,
  payload?: Record<string, unknown> | null,
  workerId?: number | null,
  ipHash?: string | null,
) {
  await admin.from("call_share_form_events").insert({
    token_id: tokenId,
    event_type: eventType,
    payload: payload ?? null,
    worker_id: workerId ?? null,
    ip_hash: ipHash ?? null,
  });
}

/**
 * @deprecated Moved to lib/phone/enrich-call-list-item.ts (Phase C).
 * Use fetchAndEnrichCallListItem from that module instead.
 */
export async function enrichCallListItem(
  admin: ReturnType<typeof createAdminClient>,
  itemId: number,
  campaignId: number,
) {
  const { data: item, error: itemErr } = await admin
    .from("call_list_items")
    .select(
      `*,
       workers!worker_id (
         worker_id, first_name, last_name, email, phone,
         occupation, address, suburb, state, postcode,
         employer_id, worksite_id,
         union_membership_type_id,
         union_membership_type:union_membership_types(type_name),
         employers (employer_id, employer_name),
         worksites (worksite_id, worksite_name)
       )`,
    )
    .eq("item_id", itemId)
    .maybeSingle();
  if (itemErr) throw itemErr;
  if (!item) return null;

  const row = item as Record<string, unknown>;
  const workerRaw = row.workers as Record<string, unknown> | null;
  const workerId = workerRaw?.worker_id as number | undefined;

  let connection = null;
  if (workerId) {
    const { data } = await admin
      .from("worker_campaign_connections")
      .select("connection_id, connection_status, support_level, contact_count, last_contacted_at, notes")
      .eq("worker_id", workerId)
      .eq("campaign_id", campaignId)
      .maybeSingle();
    connection = data;
  }

  const { data: attempts } = await admin
    .from("call_attempts")
    .select("*")
    .eq("list_item_id", itemId)
    .order("started_at", { ascending: false })
    .limit(5);

  const employers = workerRaw?.employers as Record<string, unknown> | null;
  const worksites = workerRaw?.worksites as Record<string, unknown> | null;
  const unionRel = workerRaw?.union_membership_type as
    | { type_name: string | null }
    | { type_name: string | null }[]
    | null
    | undefined;
  const unionType = Array.isArray(unionRel) ? unionRel[0] : unionRel;

  return {
    ...row,
    worker: workerRaw
      ? {
          worker_id: workerRaw.worker_id,
          first_name: workerRaw.first_name,
          last_name: workerRaw.last_name,
          email: workerRaw.email,
          phone: workerRaw.phone,
          occupation: workerRaw.occupation,
          address: workerRaw.address ?? null,
          suburb: workerRaw.suburb ?? null,
          state: workerRaw.state ?? null,
          postcode: workerRaw.postcode ?? null,
          employer_id: workerRaw.employer_id ?? null,
          worksite_id: workerRaw.worksite_id ?? null,
          union_membership_type_id: workerRaw.union_membership_type_id ?? null,
          union_membership_type_name: unionType?.type_name ?? null,
          employer_name: employers?.employer_name ?? null,
          worksite_name: worksites?.worksite_name ?? null,
        }
      : null,
    workers: undefined,
    connection,
    recent_attempts: attempts ?? [],
  };
}
