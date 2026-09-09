import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { request as playwrightRequest, type APIRequestContext } from "@playwright/test";

import { REST_CONFIG_PATH } from "../../../playwright.config";

/**
 * Fixture cleanup for the WP1.6 role specs, through the same signed-in
 * session the specs run as (WP1.6 fix round 2, item D).
 *
 * Why REST and not the UI: the UI path (CampaignDeleteDialog →
 * delete_campaign RPC) is what the positive spec asserts, but a spec that
 * fails before that step must still remove what it created, and a rerun must
 * start clean. Both go through PostgREST with the session's own access token:
 * `delete_campaign` is the same SECURITY DEFINER RPC the dialog calls, under
 * the same role gate (creator / lead organiser / admin), so nothing here can
 * delete more than the UI could.
 *
 * Where the connection details come from (never a local .env file — the
 * repo's .env.local points at production):
 *   - the project ref and access token are decoded from the @supabase/ssr
 *     auth cookie of the signed-in context (`sb-<ref>-auth-token[.N]`);
 *   - the REST origin and public anon key were captured by global setup from
 *     the app's own sign-in request (playwright.config REST_CONFIG_PATH);
 *   - the origin must be `https://<ref>.supabase.co` for that same ref, and
 *     the ref must not be the production project, or nothing runs.
 */

export const ROLE_CHECK_CAMPAIGN_PREFIX = "WP1.6 role check ";
export const ADMIN_UNIT_PREFIX = "WP1.6 admin unit ";

/** The production project (deployment_setup / wp1.6.md hand-off). Refused unconditionally. */
const PRODUCTION_PROJECT_REF = "gteygwfgjvczanmrwgbr";

export interface E2ESession {
  projectRef: string;
  accessToken: string;
  userId: string;
}

interface CookieLike {
  name: string;
  value: string;
}

interface RestConfig {
  supabaseUrl: string;
  anonKey: string;
}

export interface RestClient {
  session: E2ESession;
  supabaseUrl: string;
  get(pathAndQuery: string): Promise<{ status: number; body: unknown }>;
  post(pathAndQuery: string, data: unknown, prefer?: string): Promise<{ status: number; body: unknown }>;
  delete(pathAndQuery: string): Promise<{ status: number; body: unknown }>;
}

const AUTH_COOKIE = /^sb-([a-z0-9]+)-auth-token(?:\.(\d+))?$/;

/** Decodes the @supabase/ssr auth cookie ("base64-" + base64url JSON, possibly chunked). */
export function sessionFromCookies(cookies: CookieLike[]): E2ESession | null {
  const parts = cookies
    .map((c) => ({ ...c, match: AUTH_COOKIE.exec(c.name) }))
    .filter((c): c is CookieLike & { match: RegExpExecArray } => c.match !== null);
  if (parts.length === 0) return null;
  const projectRef = parts[0].match[1];
  const raw = parts
    .filter((c) => c.match[1] === projectRef)
    .sort((a, b) => Number(a.match[2] ?? 0) - Number(b.match[2] ?? 0))
    .map((c) => c.value)
    .join("");
  if (!raw.startsWith("base64-")) return null;
  try {
    const session = JSON.parse(Buffer.from(raw.slice("base64-".length), "base64url").toString("utf8")) as {
      access_token?: string;
      user?: { id?: string };
    };
    if (!session.access_token || !session.user?.id) return null;
    return { projectRef, accessToken: session.access_token, userId: session.user.id };
  } catch {
    return null;
  }
}

export function sessionFromStorageState(storageStatePath: string): E2ESession | null {
  const path = resolve(__dirname, "../../..", storageStatePath);
  if (!existsSync(path)) return null;
  const state = JSON.parse(readFileSync(path, "utf8")) as { cookies?: CookieLike[] };
  return sessionFromCookies(state.cookies ?? []);
}

function readRestConfig(): RestConfig | null {
  const path = resolve(__dirname, "../../..", REST_CONFIG_PATH);
  if (!existsSync(path)) return null;
  const cfg = JSON.parse(readFileSync(path, "utf8")) as Partial<RestConfig>;
  return cfg.supabaseUrl && cfg.anonKey ? { supabaseUrl: cfg.supabaseUrl, anonKey: cfg.anonKey } : null;
}

/**
 * A REST client for the session, or null (with a `[cleanup]` line on stdout
 * saying why) when the pieces are missing. Throws — never silently skips —
 * if the session belongs to the production project.
 */
export function restClientFor(api: APIRequestContext, session: E2ESession | null): RestClient | null {
  if (!session) {
    console.log("[cleanup] no signed-in session cookie; skipping.");
    return null;
  }
  if (session.projectRef === PRODUCTION_PROJECT_REF) {
    throw new Error("[cleanup] refusing to run: the session belongs to the PRODUCTION project.");
  }
  const cfg = readRestConfig();
  if (!cfg) {
    console.log(`[cleanup] ${REST_CONFIG_PATH} was not written by global setup; skipping.`);
    return null;
  }
  const expectedHost = `${session.projectRef}.supabase.co`;
  if (new URL(cfg.supabaseUrl).host !== expectedHost) {
    console.log(`[cleanup] REST origin host does not match the session's project ref (${expectedHost}); skipping.`);
    return null;
  }
  const headers = {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const parse = async (res: { status(): number; text(): Promise<string> }) => {
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    return { status: res.status(), body };
  };
  return {
    session,
    supabaseUrl: cfg.supabaseUrl,
    get: async (p) => parse(await api.get(`${cfg.supabaseUrl}${p}`, { headers })),
    post: async (p, data, prefer) =>
      parse(await api.post(`${cfg.supabaseUrl}${p}`, { headers: prefer ? { ...headers, Prefer: prefer } : headers, data })),
    delete: async (p) =>
      parse(await api.delete(`${cfg.supabaseUrl}${p}`, { headers: { ...headers, Prefer: "return=representation" } })),
  };
}

export interface CampaignRow {
  campaign_id: number;
  name: string;
}

/** Campaigns this account created whose name starts with ROLE_CHECK_CAMPAIGN_PREFIX. */
export async function listRoleCheckCampaigns(client: RestClient): Promise<CampaignRow[]> {
  const pattern = encodeURIComponent(`${ROLE_CHECK_CAMPAIGN_PREFIX}*`);
  const res = await client.get(
    `/rest/v1/campaigns?select=campaign_id,name&created_by=eq.${client.session.userId}&name=like.${pattern}&order=campaign_id`
  );
  if (res.status !== 200 || !Array.isArray(res.body)) {
    throw new Error(`[cleanup] listing role-check campaigns failed: HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as CampaignRow[];
}

export async function campaignExists(client: RestClient, campaignId: string | number): Promise<boolean> {
  const res = await client.get(`/rest/v1/campaigns?select=campaign_id&campaign_id=eq.${campaignId}`);
  if (res.status !== 200 || !Array.isArray(res.body)) {
    throw new Error(`[cleanup] campaign lookup failed: HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.length > 0;
}

/** delete_campaign(p_campaign_id) — the RPC CampaignDeleteDialog calls (useDeleteCampaign.ts). */
export async function deleteCampaignViaRpc(
  client: RestClient,
  campaignId: string | number
): Promise<{ ok: boolean; detail: string }> {
  const res = await client.post("/rest/v1/rpc/delete_campaign", { p_campaign_id: Number(campaignId) });
  const ok = res.status >= 200 && res.status < 300;
  return { ok, detail: ok ? `HTTP ${res.status}` : `HTTP ${res.status} ${JSON.stringify(res.body)}` };
}

/**
 * Deletes organising units whose name starts with `namePrefix` (optionally on
 * one campaign) and returns how many rows went. Under wp16_cou_delete, so a
 * non-admin only removes units on campaigns it can write to.
 */
export async function deleteUnitsByNamePrefix(
  client: RestClient,
  namePrefix: string,
  campaignId?: string | number
): Promise<number> {
  const scope = campaignId != null ? `&campaign_id=eq.${campaignId}` : "";
  const res = await client.delete(
    `/rest/v1/campaign_organising_units?name=like.${encodeURIComponent(`${namePrefix}*`)}${scope}`
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`[cleanup] deleting units "${namePrefix}*" failed: HTTP ${res.status} ${JSON.stringify(res.body)}`);
  }
  return Array.isArray(res.body) ? res.body.length : 0;
}

/**
 * beforeAll sweep: delete every leftover "WP1.6 role check …" campaign this
 * account created, so a rerun starts clean regardless of how the previous
 * run ended. Uses its own request context (test-scoped fixtures are not
 * available in beforeAll). Logs what it did; a missing REST config skips.
 */
export async function sweepRoleCheckCampaigns(storageStatePath: string): Promise<void> {
  const api = await playwrightRequest.newContext();
  try {
    const client = restClientFor(api, sessionFromStorageState(storageStatePath));
    if (!client) return;
    const leftovers = await listRoleCheckCampaigns(client);
    if (leftovers.length === 0) {
      console.log(`[cleanup] no leftover "${ROLE_CHECK_CAMPAIGN_PREFIX}" campaigns for this account.`);
      return;
    }
    for (const c of leftovers) {
      const r = await deleteCampaignViaRpc(client, c.campaign_id);
      console.log(`[cleanup] delete_campaign(${c.campaign_id}) "${c.name}": ${r.ok ? "deleted" : `FAILED ${r.detail}`}`);
    }
  } finally {
    await api.dispose();
  }
}

/** beforeAll sweep for the admin spec: leftover "WP1.6 admin unit …" units on any campaign. */
export async function sweepAdminUnits(storageStatePath: string): Promise<void> {
  const api = await playwrightRequest.newContext();
  try {
    const client = restClientFor(api, sessionFromStorageState(storageStatePath));
    if (!client) return;
    const n = await deleteUnitsByNamePrefix(client, ADMIN_UNIT_PREFIX);
    console.log(`[cleanup] removed ${n} leftover "${ADMIN_UNIT_PREFIX}" unit(s).`);
  } finally {
    await api.dispose();
  }
}
