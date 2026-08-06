"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ParticipationMatchCandidate,
  ParticipationMatchResultRow,
} from "@/lib/import/participation-import-shared";
import type { ImportRow, RowDecision } from "./types";
import type { ParticipationImportController } from "./use-participation-import";
import { WorkerSearchPopover } from "./worker-search-popover";

const CREATE = "__create__";
const SKIP = "__skip__";

function methodLabel(method: ParticipationMatchCandidate["method"]): string {
  switch (method) {
    case "email":
      return "email";
    case "phone":
      return "phone";
    default:
      return "name";
  }
}

function candidateSummary(c: ParticipationMatchCandidate): string {
  const bits = [c.email, c.phone].filter(Boolean);
  return bits.length > 0 ? bits.join(" · ") : "no contact details";
}

/**
 * Step 4 — review worker matches. Auto matches are pre-accepted;
 * name-only matches need confirmation; ambiguous/unmatched rows default
 * to "create + add to campaign" (deselectable per row or in bulk).
 */
export function StepMatch({
  campaignId,
  controller,
}: {
  campaignId: string;
  controller: ParticipationImportController;
}) {
  const { matchState, effectiveRows, setDecision, bulkSetDecisions, setManualMatch } = controller;

  const rowByKey = useMemo(
    () => new Map(effectiveRows.map((r) => [r.key, r])),
    [effectiveRows]
  );

  const groups = useMemo(() => {
    const auto: ParticipationMatchResultRow[] = [];
    const confirm: ParticipationMatchResultRow[] = [];
    const manual: ParticipationMatchResultRow[] = [];
    for (const r of matchState?.results ?? []) {
      if (r.disposition === "auto") auto.push(r);
      else if (r.disposition === "confirm") confirm.push(r);
      else manual.push(r);
    }
    return { auto, confirm, manual };
  }, [matchState]);

  if (!matchState) return null;

  const bulkSetManual = (action: "create" | "skip") => {
    const updates: Record<string, RowDecision> = {};
    for (const r of groups.manual) {
      const row = rowByKey.get(r.key);
      const canCreate = Boolean(row?.firstName && row?.lastName);
      updates[r.key] = {
        action: action === "create" && canCreate ? "create" : "skip",
        workerId: null,
        addToCampaign: true,
      };
    }
    bulkSetDecisions(updates);
  };

  return (
    <div className="space-y-5">
      <MatchGroup
        title={`Matched automatically (${groups.auto.length})`}
        description="Matched on email or phone — no action needed unless something looks wrong."
        rows={groups.auto}
        rowByKey={rowByKey}
        decisions={matchState.decisions}
        setDecision={setDecision}
        campaignId={campaignId}
        manualCandidates={matchState.manualCandidates}
        setManualMatch={setManualMatch}
        defaultCollapsedNote
      />
      <MatchGroup
        title={`Needs confirmation (${groups.confirm.length})`}
        description="Matched on name only — confirm each match or choose another action."
        rows={groups.confirm}
        rowByKey={rowByKey}
        decisions={matchState.decisions}
        setDecision={setDecision}
        campaignId={campaignId}
        manualCandidates={matchState.manualCandidates}
        setManualMatch={setManualMatch}
      />
      <MatchGroup
        title={`No confident match (${groups.manual.length})`}
        description="These will be added as new workers and included in the campaign unless you deselect them."
        rows={groups.manual}
        rowByKey={rowByKey}
        decisions={matchState.decisions}
        setDecision={setDecision}
        campaignId={campaignId}
        manualCandidates={matchState.manualCandidates}
        setManualMatch={setManualMatch}
        headerActions={
          groups.manual.length > 0 ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => bulkSetManual("create")}>
                Select all (create)
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => bulkSetManual("skip")}>
                Deselect all (skip)
              </Button>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}

function MatchGroup({
  title,
  description,
  rows,
  rowByKey,
  decisions,
  setDecision,
  campaignId,
  manualCandidates,
  setManualMatch,
  headerActions,
  defaultCollapsedNote,
}: {
  title: string;
  description: string;
  rows: ParticipationMatchResultRow[];
  rowByKey: Map<string, ImportRow>;
  decisions: Record<string, RowDecision>;
  setDecision: (key: string, decision: RowDecision) => void;
  campaignId: string;
  manualCandidates: Record<string, ParticipationMatchCandidate>;
  setManualMatch: (key: string, candidate: ParticipationMatchCandidate) => void;
  headerActions?: React.ReactNode;
  defaultCollapsedNote?: boolean;
}) {
  if (rows.length === 0 && defaultCollapsedNote) {
    return null;
  }
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {headerActions}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          None.
        </p>
      ) : (
        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((r) => {
            const row = rowByKey.get(r.key);
            if (!row) return null;
            return (
              <MatchRow
                key={r.key}
                result={r}
                row={row}
                decision={decisions[r.key]}
                setDecision={(d) => setDecision(r.key, d)}
                campaignId={campaignId}
                manualCandidate={manualCandidates[r.key] ?? null}
                onManualPick={(c) => setManualMatch(r.key, c)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function MatchRow({
  result,
  row,
  decision,
  setDecision,
  campaignId,
  manualCandidate,
  onManualPick,
}: {
  result: ParticipationMatchResultRow;
  row: ImportRow;
  decision: RowDecision | undefined;
  setDecision: (decision: RowDecision) => void;
  campaignId: string;
  manualCandidate: ParticipationMatchCandidate | null;
  onManualPick: (candidate: ParticipationMatchCandidate) => void;
}) {
  const canCreate = Boolean(row.firstName && row.lastName);
  const allCandidates =
    manualCandidate && !result.candidates.some((c) => c.worker_id === manualCandidate.worker_id)
      ? [...result.candidates, manualCandidate]
      : result.candidates;
  const current =
    !decision || decision.action === "skip"
      ? SKIP
      : decision.action === "create"
        ? CREATE
        : String(decision.workerId ?? SKIP);

  const chosenCandidate =
    decision?.action === "match"
      ? (allCandidates.find((c) => c.worker_id === decision.workerId) ?? null)
      : null;
  const showAddToCampaign =
    (decision?.action === "match" && chosenCandidate != null && !chosenCandidate.in_campaign) ||
    decision?.action === "create";

  const identityBits = [
    row.emails[0],
    row.phones[0],
    row.rawResponse ? `→ ${row.rawResponse}` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
      <div className="min-w-40 flex-1">
        <div className="truncate text-xs font-medium">
          {row.firstName || row.lastName
            ? `${row.firstName} ${row.lastName}`.trim()
            : (row.emails[0] ?? row.phones[0] ?? "(no identity)")}
        </div>
        <div className="truncate text-[11px] text-muted-foreground" title={identityBits.join(" · ")}>
          {identityBits.join(" · ") || "—"}
        </div>
      </div>

      <Select
        value={current}
        onValueChange={(v) => {
          if (v === SKIP) setDecision({ action: "skip", workerId: null, addToCampaign: false });
          else if (v === CREATE)
            setDecision({ action: "create", workerId: null, addToCampaign: true });
          else {
            const workerId = Number(v);
            const candidate = allCandidates.find((c) => c.worker_id === workerId);
            setDecision({
              action: "match",
              workerId,
              addToCampaign: candidate ? !candidate.in_campaign : false,
            });
          }
        }}
      >
        <SelectTrigger className="h-8 w-72 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allCandidates.map((c) => (
            <SelectItem key={c.worker_id} value={String(c.worker_id)} className="text-xs">
              <span className="inline-flex items-center gap-1.5">
                {c.first_name} {c.last_name}
                <span className="text-muted-foreground">
                  ({methodLabel(c.method)} · {candidateSummary(c)})
                </span>
              </span>
            </SelectItem>
          ))}
          <SelectItem value={CREATE} className="text-xs" disabled={!canCreate}>
            Create new worker{canCreate ? "" : " (needs a name)"}
          </SelectItem>
          <SelectItem value={SKIP} className="text-xs">
            Skip this row
          </SelectItem>
        </SelectContent>
      </Select>

      <WorkerSearchPopover
        campaignId={campaignId}
        initialQuery={`${row.firstName} ${row.lastName}`.trim()}
        onPick={onManualPick}
      />

      <div className="flex min-w-32 items-center gap-2">
        {chosenCandidate && (
          <>
            {chosenCandidate.in_campaign ? (
              <Badge variant="secondary" className="text-[10px]">
                In campaign
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                Not in campaign
              </Badge>
            )}
            {chosenCandidate.existing_rating != null ||
            chosenCandidate.existing_binary_value != null ? (
              <Badge variant="outline" className="text-[10px] text-amber-600">
                Already rated
              </Badge>
            ) : null}
          </>
        )}
        {showAddToCampaign && (
          <div className="flex items-center gap-1.5">
            <Checkbox
              id={`add-${result.key}`}
              checked={decision?.addToCampaign ?? false}
              onCheckedChange={(checked) =>
                decision && setDecision({ ...decision, addToCampaign: checked === true })
              }
            />
            <Label htmlFor={`add-${result.key}`} className="text-[11px] font-normal">
              Add to campaign
            </Label>
          </div>
        )}
      </div>
    </div>
  );
}
