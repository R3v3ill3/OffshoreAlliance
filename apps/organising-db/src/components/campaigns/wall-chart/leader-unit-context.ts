"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { ouDisplayName, type WallChartOU, type WallChartOUAssignment } from "./types";

export type LeaderUnitContext = {
  /** OU ids the leader belongs to in this campaign. */
  leaderOuIds: Set<number>;
  /** OU display names keyed by id (matches the wall chart's fallback logic). */
  ouNames: Map<number, string>;
  /** All OUs in the campaign, sorted by name — for populating filter dropdowns. */
  allOuEntries: Array<{ id: number; name: string }>;
  /** Worker ids who share at least one OU with the leader. */
  candidatesInLeaderUnits: Set<number>;
  /** True if the worker shares at least one OU with the leader. */
  isSharedUnit: (workerId: number) => boolean;
  /** Names of the OUs this worker shares with the leader (may be empty). */
  sharedUnitNames: (workerId: number) => string[];
  /** All OU ids this worker belongs to in this campaign (not limited to leader's OUs). */
  allWorkerOuIds: (workerId: number) => number[];
  /** All OU names this worker belongs to in this campaign. */
  allWorkerOuNames: (workerId: number) => string[];
};

const EMPTY_SET = new Set<number>();

/**
 * Piggybacks on the same `campaign-ous` and `campaign-worker-ou` queries the
 * wall chart already caches, so opening the relationships tab is free.
 *
 * When `campaignId` is omitted (i.e. the Relationships tab on /workers/[id]
 * which spans campaigns), the helper returns an empty context. Callers should
 * skip the "in my unit(s)" grouping in that case.
 */
export function useLeaderUnitContext(args: {
  campaignId?: string | number;
  leaderWorkerId: number;
}): LeaderUnitContext {
  const supabase = createClient();
  const campaignId = args.campaignId;

  // Distinct keys — this context orders OUs differently (by name) and keys by a
  // stringified id, so it must not share the canonical ["campaign-ous"] /
  // ["campaign-worker-ou"] caches that drive the wall-chart hierarchy + ordering.
  const { data: ous = [] } = useQuery({
    queryKey: ["leader-ctx-ous", String(campaignId ?? "")],
    queryFn: async () => {
      if (campaignId == null) return [] as WallChartOU[];
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .select("*")
        .eq("campaign_id", Number(campaignId))
        .order("name");
      if (error) throw error;
      return (data ?? []) as WallChartOU[];
    },
    enabled: campaignId != null,
  });

  const ouIdsKey = ous.map((o) => o.ou_id).join(",");

  const { data: assignments = [] } = useQuery({
    queryKey: ["leader-ctx-ous", String(campaignId ?? ""), "assignments", ouIdsKey],
    queryFn: async () => {
      if (campaignId == null || ous.length === 0) return [] as WallChartOUAssignment[];
      const ids = ous.map((o) => o.ou_id);
      const { data, error } = await supabase
        .from("campaign_worker_ou")
        .select("ou_id, worker_id, is_primary")
        .in("ou_id", ids);
      if (error) throw error;
      return (data ?? []) as WallChartOUAssignment[];
    },
    enabled: campaignId != null && ous.length > 0,
  });

  if (campaignId == null) {
    return {
      leaderOuIds: EMPTY_SET,
      ouNames: new Map(),
      allOuEntries: [],
      candidatesInLeaderUnits: EMPTY_SET,
      isSharedUnit: () => false,
      sharedUnitNames: () => [],
      allWorkerOuIds: () => [],
      allWorkerOuNames: () => [],
    };
  }

  const ouNames = new Map<number, string>();
  for (const ou of ous) ouNames.set(ou.ou_id, ouDisplayName(ou));

  const leaderOuIds = new Set<number>();
  for (const a of assignments) {
    if (a.worker_id === args.leaderWorkerId) leaderOuIds.add(a.ou_id);
  }

  const candidatesInLeaderUnits = new Set<number>();
  const workerOus = new Map<number, Set<number>>();
  for (const a of assignments) {
    if (leaderOuIds.has(a.ou_id)) candidatesInLeaderUnits.add(a.worker_id);
    let s = workerOus.get(a.worker_id);
    if (!s) {
      s = new Set<number>();
      workerOus.set(a.worker_id, s);
    }
    s.add(a.ou_id);
  }
  candidatesInLeaderUnits.delete(args.leaderWorkerId);

  const isSharedUnit = (workerId: number) => {
    const units = workerOus.get(workerId);
    if (!units) return false;
    for (const id of leaderOuIds) if (units.has(id)) return true;
    return false;
  };

  const sharedUnitNames = (workerId: number) => {
    const units = workerOus.get(workerId);
    if (!units) return [];
    const out: string[] = [];
    for (const id of leaderOuIds) {
      if (units.has(id)) {
        const name = ouNames.get(id);
        if (name) out.push(name);
      }
    }
    return out;
  };

  const allWorkerOuIds = (workerId: number): number[] => {
    const units = workerOus.get(workerId);
    if (!units) return [];
    return [...units];
  };

  const allWorkerOuNames = (workerId: number): string[] => {
    const units = workerOus.get(workerId);
    if (!units) return [];
    const out: string[] = [];
    for (const id of units) {
      const name = ouNames.get(id);
      if (name) out.push(name);
    }
    return out.sort((a, b) => a.localeCompare(b));
  };

  const allOuEntries = ous
    .map((ou) => ({ id: ou.ou_id, name: ouDisplayName(ou) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    leaderOuIds,
    ouNames,
    allOuEntries,
    candidatesInLeaderUnits,
    isSharedUnit,
    sharedUnitNames,
    allWorkerOuIds,
    allWorkerOuNames,
  };
}
