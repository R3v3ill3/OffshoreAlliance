/**
 * Client-side helpers for the single resolution path (DA0.3 §2.4.4): both
 * import wizards call POST /api/import/resolve-names with the distinct
 * employer and worksite strings of the file and render the outcomes
 * read-only; decisions are made on the Name Reviews page.
 */

import { fetchApi, API_FETCH_TIMEOUT_UPLOAD_MS } from "@/lib/api/fetch-api";
import { foldName } from "@/lib/import/name-fold";
import {
  isQueuedOutcome,
  type ResolutionOutcome,
  type ResolveNameInput,
  type ResolveNamesRequest,
  type ResolveNamesResponse,
} from "@/lib/import/resolve-names-types";

export interface NamePair {
  employer: string | null | undefined;
  worksite: string | null | undefined;
}

/**
 * Distinct strings per entity (folded), with occurrences and the companion
 * string seen most often beside each. Pure.
 */
export function distinctNameInputs(pairs: readonly NamePair[]): {
  employerNames: ResolveNameInput[];
  worksiteNames: ResolveNameInput[];
} {
  type Acc = { raw: string; occurrences: number; others: Map<string, number> };
  const collect = (
    pick: (p: NamePair) => string | null | undefined,
    other: (p: NamePair) => string | null | undefined
  ): ResolveNameInput[] => {
    const acc = new Map<string, Acc>();
    for (const pair of pairs) {
      const raw = pick(pair);
      if (typeof raw !== "string") continue;
      const key = foldName(raw);
      if (!key) continue;
      let entry = acc.get(key);
      if (!entry) {
        entry = { raw: raw.trim(), occurrences: 0, others: new Map() };
        acc.set(key, entry);
      }
      entry.occurrences += 1;
      const o = other(pair);
      if (typeof o === "string" && o.trim()) {
        entry.others.set(o.trim(), (entry.others.get(o.trim()) ?? 0) + 1);
      }
    }
    return [...acc.values()].map((entry) => {
      let best: string | null = null;
      let bestCount = 0;
      for (const [name, count] of entry.others) {
        if (count > bestCount) {
          best = name;
          bestCount = count;
        }
      }
      return { raw: entry.raw, occurrences: entry.occurrences, otherRaw: best };
    });
  };
  return {
    employerNames: collect((p) => p.employer, (p) => p.worksite),
    worksiteNames: collect((p) => p.worksite, (p) => p.employer),
  };
}

export async function requestNameResolution(body: ResolveNamesRequest): Promise<ResolveNamesResponse> {
  const res = await fetchApi("/api/import/resolve-names", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
  });
  const json = (await res.json()) as ResolveNamesResponse;
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? `Name resolution failed (HTTP ${res.status})`);
  }
  return json;
}

/** foldName(raw) → outcome, for per-row lookups. */
export function outcomesByFold(outcomes: readonly ResolutionOutcome[]): Map<string, ResolutionOutcome> {
  return new Map(outcomes.map((o) => [o.normalisedName, o]));
}

export function outcomeForRaw(
  map: Map<string, ResolutionOutcome>,
  raw: string | null | undefined
): ResolutionOutcome | undefined {
  if (typeof raw !== "string") return undefined;
  const key = foldName(raw);
  return key ? map.get(key) : undefined;
}

export function countQueued(outcomes: readonly ResolutionOutcome[]): number {
  return outcomes.filter((o) => isQueuedOutcome(o.status)).length;
}
