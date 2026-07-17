"use client";

/**
 * Coverage Map — rendered on the Campaign Units sub-tab.
 *
 * The tracker's coverage standard: a named leader (with a named
 * second) for every crew, on every swing. Counts and density are
 * derived from unit assignments and membership; the editable layer is
 * leader / second-in-line / 48-hour reachability / priority action.
 * WOC representation is shown alongside — a unit can have a leader
 * but no WOC voice, or vice versa.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { CampaignWorkerNameButton } from "../campaign-worker-detail-provider";
import { COVERAGE_STATUSES } from "@/lib/campaign/activist-constants";
import { ratingBorderTextClass } from "../wall-chart/rating-colour";
import { ratingLevelFor } from "@/types/planner-types";
import {
  useCoverageMap,
  useCoverageSummary,
  useSaveOuCoverage,
  useWocRepresentationByUnit,
} from "./use-coverage-data";
import { useCampaignWorkerOptions } from "./use-activist-data";
import type { CoverageMapRow } from "./types";
import { workerOptionName } from "./types";

const NONE = "__none__";

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-400"
        : tone === "bad"
          ? "text-red-600 dark:text-red-400"
          : "";
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function CoverageRow({
  campaignId,
  row,
  groupName,
  wocState,
  canWrite,
}: {
  campaignId: string;
  row: CoverageMapRow;
  groupName: string | null;
  wocState: { inScope: boolean; represented: boolean } | null;
  canWrite: boolean;
}) {
  const saveMutation = useSaveOuCoverage(campaignId);
  const { data: workerOptions = [] } = useCampaignWorkerOptions(campaignId);
  const [priority, setPriority] = useState(row.priority_action ?? "");
  const [priorityDirty, setPriorityDirty] = useState(false);

  const status = row.coverage_status
    ? COVERAGE_STATUSES[row.coverage_status]
    : null;

  const workerSelect = (
    value: number | null,
    field: "leader_worker_id" | "second_worker_id"
  ) => (
    <Select
      value={value != null ? String(value) : NONE}
      disabled={!canWrite}
      onValueChange={(v) =>
        saveMutation.mutate({
          ouId: row.ou_id!,
          update: { [field]: v === NONE ? null : Number(v) },
        })
      }
    >
      <SelectTrigger className="h-8 w-40">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>—</SelectItem>
        {workerOptions.map((w) => (
          <SelectItem key={w.worker_id} value={String(w.worker_id)}>
            {workerOptionName(w)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const leaderRating = ratingLevelFor(row.leader_rating);

  return (
    <TableRow>
      <TableCell>
        <div className="min-w-0">
          <p className="text-sm font-medium">{row.ou_name}</p>
          {groupName && (
            <p className="text-xs text-muted-foreground">{groupName}</p>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm tabular-nums">
        {row.assigned_workers ?? 0}
      </TableCell>
      <TableCell className="text-sm tabular-nums">{row.member_count ?? 0}</TableCell>
      <TableCell className="text-sm tabular-nums">
        {row.density != null ? `${Math.round(Number(row.density) * 100)}%` : "—"}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          {workerSelect(row.leader_worker_id, "leader_worker_id")}
          {row.leader_worker_id != null && (
            <Badge
              variant="outline"
              className={`${ratingBorderTextClass(row.leader_rating)} text-[10px]`}
              title={`Leader assessment: ${leaderRating.label}`}
            >
              {row.leader_rating ?? "—"}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>{workerSelect(row.second_worker_id, "second_worker_id")}</TableCell>
      <TableCell>
        <Switch
          checked={!!row.reachable_48h}
          disabled={!canWrite}
          onCheckedChange={(v) =>
            saveMutation.mutate({
              ouId: row.ou_id!,
              update: { reachable_48h: v },
            })
          }
        />
      </TableCell>
      <TableCell>
        {status && (
          <Badge variant="outline" className={status.badgeClass}>
            {status.label}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        {wocState?.inScope ? (
          wocState.represented ? (
            <Badge
              variant="outline"
              className="border-emerald-500 text-emerald-700 dark:border-emerald-600 dark:text-emerald-400"
            >
              Voice
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-red-500 text-red-600 dark:border-red-600 dark:text-red-400"
            >
              No voice
            </Badge>
          )
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <Input
            className="h-8 w-44"
            placeholder="Priority action…"
            value={priority}
            disabled={!canWrite}
            onChange={(e) => {
              setPriority(e.target.value);
              setPriorityDirty(true);
            }}
          />
          {canWrite && priorityDirty && (
            <Button
              size="sm"
              className="h-7"
              disabled={saveMutation.isPending}
              onClick={() =>
                saveMutation.mutate(
                  {
                    ouId: row.ou_id!,
                    update: { priority_action: priority || null },
                  },
                  { onSuccess: () => setPriorityDirty(false) }
                )
              }
            >
              Save
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function CoveragePanel({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const { data: rows = [], isLoading } = useCoverageMap(campaignId);
  const { data: summary } = useCoverageSummary(campaignId);
  const { byUnit: wocByUnit } = useWocRepresentationByUnit(campaignId);

  const groupNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rows) {
      if (r.ou_id != null && r.ou_name != null) m.set(r.ou_id, r.ou_name);
    }
    return m;
  }, [rows]);

  const units = useMemo(
    () =>
      rows
        .filter((r) => !r.is_group_container)
        .sort((a, b) => {
          const ga = a.parent_ou_id ? (groupNameById.get(a.parent_ou_id) ?? "") : "";
          const gb = b.parent_ou_id ? (groupNameById.get(b.parent_ou_id) ?? "") : "";
          return ga.localeCompare(gb) || (a.ou_name ?? "").localeCompare(b.ou_name ?? "");
        }),
    [rows, groupNameById]
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <EurekaLoadingSpinner />
      </div>
    );
  }

  if (units.length === 0) return null;

  const leaderNames = units
    .filter((u) => u.leader_worker_id != null && u.leader_name)
    .map((u) => ({ id: u.leader_worker_id!, name: u.leader_name! }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Coverage Map</CardTitle>
        <CardDescription>
          The standard: a named leader, with a named second, for every crew on
          every swing. A crew with no leader is an agenda item — not background
          noise.
          {leaderNames.length > 0 && (
            <>
              {" "}
              Leaders:{" "}
              {leaderNames.map((l, i) => (
                <span key={l.id}>
                  {i > 0 && ", "}
                  <CampaignWorkerNameButton workerId={l.id} className="text-xs">
                    {l.name}
                  </CampaignWorkerNameButton>
                </span>
              ))}
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryStat label="Units mapped" value={summary.units_mapped ?? 0} />
            <SummaryStat
              label="Covered"
              value={summary.units_covered ?? 0}
              tone="good"
            />
            <SummaryStat
              label="Leader, no second"
              value={summary.units_leader_no_second ?? 0}
              tone="warn"
            />
            <SummaryStat label="Gaps" value={summary.units_gap ?? 0} tone="bad" />
            <SummaryStat label="Workers mapped" value={summary.workers_mapped ?? 0} />
            <SummaryStat
              label="Density"
              value={
                summary.overall_density != null
                  ? `${Math.round(Number(summary.overall_density) * 100)}%`
                  : "—"
              }
            />
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Crew / unit</TableHead>
                <TableHead>Workers</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Density</TableHead>
                <TableHead>Named leader</TableHead>
                <TableHead>Second-in-line</TableHead>
                <TableHead>48-hr</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>WOC</TableHead>
                <TableHead>Priority action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((row) => (
                <CoverageRow
                  key={row.ou_id}
                  campaignId={campaignId}
                  row={row}
                  groupName={
                    row.parent_ou_id
                      ? (groupNameById.get(row.parent_ou_id) ?? null)
                      : null
                  }
                  wocState={row.ou_id != null ? (wocByUnit.get(row.ou_id) ?? null) : null}
                  canWrite={canWrite}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
