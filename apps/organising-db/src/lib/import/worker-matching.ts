/**
 * Shared worker-matching engine for participation imports.
 *
 * Matches identity rows (from an Action Network report CSV or the AN API)
 * against worker records using a tiered strategy:
 *
 *   1. email  — exact, case-insensitive          → auto-match
 *   2. phone  — exact after AU normalisation      → auto-match
 *   3. name   — first+last, exactly one candidate → needs user confirmation
 *   4. name   — multiple candidates, or nothing   → manual review / new worker
 *
 * Candidates inside the campaign workforce always outrank candidates from
 * the wider worker database at the same tier; the caller is told which pool
 * a match came from so the UI can offer "add to campaign".
 */

export interface MatchIdentityRow {
  /** Caller-defined key (CSV row index or AN person id). */
  key: string;
  emails: string[];
  phones: string[];
  firstName: string;
  lastName: string;
}

export interface MatchableWorker {
  worker_id: number;
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
  email: string | null;
  phone: string | null;
  /** Whether the worker is already in the campaign workforce. */
  in_campaign: boolean;
}

/** "an_id" = pre-resolved via workers.action_network_id (AN sync mode). */
export type MatchMethod = "email" | "phone" | "name" | "an_id";

export type MatchDisposition =
  | "auto" // tier 1-2: safe to apply without user action
  | "confirm" // tier 3: single name candidate, user confirms
  | "review" // tier 4a: multiple candidates, user picks
  | "unmatched"; // tier 4b: no candidate at all

export interface MatchCandidate {
  worker: MatchableWorker;
  method: MatchMethod;
}

export interface MatchResult {
  key: string;
  disposition: MatchDisposition;
  /** Best candidate (set for auto + confirm). */
  match: MatchCandidate | null;
  /** All candidates, best first (drives the review picker). */
  candidates: MatchCandidate[];
}

/** Lower-case, trimmed email — or null when blank/invalid-looking. */
export function normaliseEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v || !v.includes("@")) return null;
  return v;
}

/**
 * Normalise an AU phone number to local `04…` form for comparison.
 * Mirrors the worker-import parser's rules: 9 digits → prepend 0;
 * `61…`/`610…` international prefixes → local. Non-AU-shaped values
 * fall back to their digit string so exact matches still work.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 9) return `0${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  if (digits.length === 11 && digits.startsWith("61")) return `0${digits.slice(2)}`;
  if (digits.length === 12 && digits.startsWith("610")) return `0${digits.slice(3)}`;
  return digits;
}

/** Case/whitespace-insensitive name key. */
export function nameKey(first: string | null | undefined, last: string | null | undefined): string | null {
  const f = (first ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const l = (last ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!f || !l) return null;
  return `${f}||${l}`;
}

/** Case/whitespace-insensitive surname key. */
export function lastNameKey(last: string | null | undefined): string | null {
  const l = (last ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return l || null;
}

interface WorkerIndex {
  byEmail: Map<string, MatchableWorker[]>;
  byPhone: Map<string, MatchableWorker[]>;
  byName: Map<string, MatchableWorker[]>;
  byLastName: Map<string, MatchableWorker[]>;
}

function push<K>(map: Map<K, MatchableWorker[]>, key: K, w: MatchableWorker) {
  const arr = map.get(key);
  if (arr) arr.push(w);
  else map.set(key, [w]);
}

export function buildWorkerIndex(workers: MatchableWorker[]): WorkerIndex {
  const byEmail = new Map<string, MatchableWorker[]>();
  const byPhone = new Map<string, MatchableWorker[]>();
  const byName = new Map<string, MatchableWorker[]>();
  const byLastName = new Map<string, MatchableWorker[]>();
  for (const w of workers) {
    const email = normaliseEmail(w.email);
    if (email) push(byEmail, email, w);
    const phone = normalisePhone(w.phone);
    if (phone) push(byPhone, phone, w);
    const nk = nameKey(w.first_name, w.last_name);
    if (nk) push(byName, nk, w);
    // Preferred name counts as an alternate first name for tier 3.
    const pk = nameKey(w.preferred_name ?? "", w.last_name);
    if (pk && pk !== nk) push(byName, pk, w);
    const lk = lastNameKey(w.last_name);
    if (lk) push(byLastName, lk, w);
  }
  return { byEmail, byPhone, byName, byLastName };
}

/** In-campaign workers first, then stable by worker_id. */
function rankWorkers(workers: MatchableWorker[]): MatchableWorker[] {
  return [...workers].sort((a, b) => {
    if (a.in_campaign !== b.in_campaign) return a.in_campaign ? -1 : 1;
    return a.worker_id - b.worker_id;
  });
}

function dedupeCandidates(candidates: MatchCandidate[]): MatchCandidate[] {
  const seen = new Set<number>();
  const out: MatchCandidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.worker.worker_id)) continue;
    seen.add(c.worker.worker_id);
    out.push(c);
  }
  return out;
}

/**
 * Match one identity row against the index.
 *
 * Email and phone hits are auto-matches (ties broken toward in-campaign
 * workers). A unique name hit needs confirmation. Everything else is
 * review (candidates exist) or unmatched.
 */
export function matchRow(row: MatchIdentityRow, index: WorkerIndex): MatchResult {
  const emailHits: MatchableWorker[] = [];
  for (const raw of row.emails) {
    const e = normaliseEmail(raw);
    if (e) emailHits.push(...(index.byEmail.get(e) ?? []));
  }
  const phoneHits: MatchableWorker[] = [];
  for (const raw of row.phones) {
    const p = normalisePhone(raw);
    if (p) phoneHits.push(...(index.byPhone.get(p) ?? []));
  }
  const nk = nameKey(row.firstName, row.lastName);
  const nameHits = nk ? (index.byName.get(nk) ?? []) : [];

  const candidates = dedupeCandidates([
    ...rankWorkers(emailHits).map((worker) => ({ worker, method: "email" as const })),
    ...rankWorkers(phoneHits).map((worker) => ({ worker, method: "phone" as const })),
    ...rankWorkers(nameHits).map((worker) => ({ worker, method: "name" as const })),
  ]);

  if (emailHits.length > 0 || phoneHits.length > 0) {
    return { key: row.key, disposition: "auto", match: candidates[0], candidates };
  }

  const uniqueNameWorkers = dedupeCandidates(
    nameHits.map((worker) => ({ worker, method: "name" as const }))
  );
  if (uniqueNameWorkers.length === 1) {
    return { key: row.key, disposition: "confirm", match: candidates[0], candidates };
  }
  if (uniqueNameWorkers.length > 1) {
    return { key: row.key, disposition: "review", match: null, candidates };
  }

  // Tier 4: surname-only suggestions ("Steve Smith" vs "Stephen Smith").
  // Never auto-matched — surfaced for the user to pick from. Capped so a
  // common surname doesn't swamp the row's picker.
  const lk = lastNameKey(row.lastName);
  const surnameHits = lk ? (index.byLastName.get(lk) ?? []) : [];
  if (surnameHits.length > 0) {
    const surnameCandidates = dedupeCandidates(
      rankWorkers(surnameHits).map((worker) => ({ worker, method: "name" as const }))
    ).slice(0, 8);
    return { key: row.key, disposition: "review", match: null, candidates: surnameCandidates };
  }

  return { key: row.key, disposition: "unmatched", match: null, candidates: [] };
}

export function matchRows(rows: MatchIdentityRow[], workers: MatchableWorker[]): MatchResult[] {
  const index = buildWorkerIndex(workers);
  return rows.map((row) => matchRow(row, index));
}
