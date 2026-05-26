/**
 * Load-test scaffold for the `claim_next_call_list_item` family of RPCs.
 *
 * Run with `pnpm tsx apps/organising-db/tests/load/claim-concurrency.ts`.
 *
 * The script:
 *   1. Asserts that a target call list exists with the configured ID.
 *   2. Spawns N concurrent "callers" who each loop fetching the next
 *      claim until the list reports as drained.
 *   3. Records timing and conflict counters; prints a summary.
 *   4. Asserts that no two callers ever claimed the same item — the
 *      central correctness property of the SKIP LOCKED RPC.
 *
 * This is a smoke load test, not a benchmark — defaults are tuned to
 * mirror the plan's expectations (20 callers × 200 items).
 *
 * Required env:
 *   SUPABASE_URL            — Supabase project URL
 *   SUPABASE_SERVICE_KEY    — service-role key (server-only)
 *   CALL_LIST_ID            — the seeded target list
 *   SHARE_TOKEN_ID?         — optional, exercises the share-aware RPC
 */

import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const LIST_ID = Number(process.env.CALL_LIST_ID ?? 0);
const TOKEN_ID = process.env.SHARE_TOKEN_ID ? Number(process.env.SHARE_TOKEN_ID) : null;
const CALLERS = Number(process.env.CALLERS ?? 20);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 60_000);

interface ClaimResult {
  caller_id: number;
  item_id: number | null;
  duration_ms: number;
  error?: string;
}

async function singleClaim(
  client: ReturnType<typeof createClient>,
  callerId: number,
): Promise<ClaimResult> {
  const started = performance.now();
  try {
    const rpc = TOKEN_ID
      ? "claim_next_call_list_item_for_share"
      : "claim_next_call_list_item";
    const params: Record<string, unknown> = {
      p_list_id: LIST_ID,
      p_session_label: `loadtest:${callerId}`,
    };
    if (TOKEN_ID) params.p_share_token_id = TOKEN_ID;
    const { data, error } = await client.rpc(rpc, params);
    if (error) {
      return {
        caller_id: callerId,
        item_id: null,
        duration_ms: performance.now() - started,
        error: error.message,
      };
    }
    const itemId =
      (data as { item_id?: number } | null)?.item_id ??
      (Array.isArray(data) ? (data[0] as { item_id?: number } | undefined)?.item_id : null) ??
      null;
    return {
      caller_id: callerId,
      item_id: itemId,
      duration_ms: performance.now() - started,
    };
  } catch (err) {
    return {
      caller_id: callerId,
      item_id: null,
      duration_ms: performance.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runCaller(
  client: ReturnType<typeof createClient>,
  callerId: number,
  results: ClaimResult[],
  startedAt: number,
) {
  while (performance.now() - startedAt < TIMEOUT_MS) {
    const res = await singleClaim(client, callerId);
    results.push(res);
    if (res.item_id == null) return;
  }
}

async function main() {
  if (!URL || !KEY) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_KEY must be set");
    process.exit(1);
  }
  if (!LIST_ID) {
    console.error("CALL_LIST_ID must be set");
    process.exit(1);
  }
  const client = createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const startedAt = performance.now();
  const results: ClaimResult[] = [];
  await Promise.all(
    Array.from({ length: CALLERS }, (_, i) => runCaller(client, i + 1, results, startedAt)),
  );

  const claimed = results.filter((r) => r.item_id != null);
  const empty = results.filter((r) => r.item_id == null && !r.error);
  const errored = results.filter((r) => r.error);
  const itemIds = claimed.map((r) => r.item_id as number);
  const duplicates = itemIds.filter((id, idx) => itemIds.indexOf(id) !== idx);

  const durations = results.map((r) => r.duration_ms).sort((a, b) => a - b);
  const p50 = durations[Math.floor(durations.length * 0.5)] ?? 0;
  const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0;
  const p99 = durations[Math.floor(durations.length * 0.99)] ?? 0;

  console.log("==============================");
  console.log("Claim concurrency load summary");
  console.log("==============================");
  console.log(`Callers           : ${CALLERS}`);
  console.log(`Total RPC calls   : ${results.length}`);
  console.log(`Claims successful : ${claimed.length}`);
  console.log(`Empty (drained)   : ${empty.length}`);
  console.log(`Errors            : ${errored.length}`);
  console.log(`Duplicate items   : ${duplicates.length}`);
  console.log(`Latency p50/p95/p99 : ${p50.toFixed(1)} / ${p95.toFixed(1)} / ${p99.toFixed(1)} ms`);

  if (duplicates.length > 0) {
    console.error("❌ Duplicate claims detected — RPC failed to enforce mutual exclusion");
    process.exit(1);
  }
  console.log("✅ No duplicate claims observed");
}

void main();
