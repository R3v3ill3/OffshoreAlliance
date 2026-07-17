"use client";

/**
 * Activist Register — the tracker's "one row per person" sheet.
 *
 * Assessment stays on the shared 0–5 rating scale (shown from the
 * campaign cumulative rating); the register adds the activation
 * dimension: ladder rung, 4A stage, domain, contact cadence.
 * Auto-provisioned rows (rated 1 / tasked / role / WOC) are flagged
 * until an organiser edits them.
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Archive, ArchiveRestore, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { CampaignWorkerNameButton } from "../campaign-worker-detail-provider";
import { ratingLevelFor } from "@/types/planner-types";
import { ratingBorderTextClass } from "../wall-chart/rating-colour";
import {
  ACTIVIST_PROFILE_SOURCES,
  FOUR_A_STAGES,
  ladderRungFor,
} from "@/lib/campaign/activist-constants";
import {
  useActivistRegister,
  useCampaignWorkerOptions,
  useCreateActivistProfile,
  useUpdateActivistProfile,
} from "./use-activist-data";
import { ActivistProfileDialog } from "./activist-profile-dialog";
import type { ActivistRegisterRow } from "./types";
import { workerOptionName } from "./types";

function stageLabel(stage: string | null): string {
  return FOUR_A_STAGES.find((s) => s.value === stage)?.label ?? "—";
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date(new Date().toDateString());
}

export function ActivistRegister({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading } = useActivistRegister(campaignId);
  const createMutation = useCreateActivistProfile(campaignId);
  const updateMutation = useUpdateActivistProfile(campaignId);

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [editRow, setEditRow] = useState<ActivistRegisterRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addWorkerId, setAddWorkerId] = useState<string>("");

  const { data: workerOptions = [] } = useCampaignWorkerOptions(campaignId);

  const registeredIds = useMemo(
    () => new Set(rows.map((r) => r.worker_id)),
    [rows]
  );
  const addableWorkers = useMemo(
    () => workerOptions.filter((w) => !registeredIds.has(w.worker_id)),
    [workerOptions, registeredIds]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showArchived && r.is_archived) return false;
      if (stageFilter !== "all" && r.four_a_stage !== stageFilter) return false;
      if (q && !(r.worker_name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, stageFilter, showArchived]);

  const activeCount = rows.filter((r) => !r.is_archived).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <CardTitle className="text-lg">Activist Register</CardTitle>
          <CardDescription>
            {activeCount} on the register. Workers are added automatically when
            they are rated 1 on any activity, given a task, join a WOC, or hold a
            contact / activist / delegate role — or add someone manually.
          </CardDescription>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add to register
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All 4A stages</SelectItem>
              {FOUR_A_STAGES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
            <Label htmlFor="show-archived" className="text-sm font-normal">
              Show archived
            </Label>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <EurekaLoadingSpinner />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            No one on the register yet
            {search || stageFilter !== "all" ? " matching these filters" : ""}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Assessment</TableHead>
                  <TableHead>Rung</TableHead>
                  <TableHead>4A stage</TableHead>
                  <TableHead>Current task</TableHead>
                  <TableHead>WOC</TableHead>
                  <TableHead>Next contact</TableHead>
                  <TableHead>Source</TableHead>
                  {canWrite && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const rating = ratingLevelFor(r.current_rating);
                  const rung = ladderRungFor(r.current_rung);
                  const source = ACTIVIST_PROFILE_SOURCES[r.source ?? "manual"];
                  return (
                    <TableRow
                      key={r.profile_id}
                      className={r.is_archived ? "opacity-50" : undefined}
                    >
                      <TableCell>
                        <CampaignWorkerNameButton workerId={r.worker_id!}>
                          {r.worker_name}
                        </CampaignWorkerNameButton>
                        {r.is_archived && (
                          <Badge variant="outline" className="ml-2">
                            Archived
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.role_display_name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={ratingBorderTextClass(r.current_rating)}
                        >
                          {rating.shortLabel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {rung ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm">{rung.shortLabel}</span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-64">
                                <p className="font-medium">{rung.label}</p>
                                <p>{rung.description}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {stageLabel(r.four_a_stage)}
                      </TableCell>
                      <TableCell className="max-w-56">
                        {r.current_task_responsibility ? (
                          <span className="text-sm line-clamp-2">
                            {r.current_task_responsibility}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.woc_names && r.woc_names.length > 0 ? (
                          <span className="line-clamp-1">{r.woc_names.join(", ")}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.next_contact_date ? (
                          <span
                            className={
                              isOverdue(r.next_contact_date)
                                ? "text-sm font-medium text-red-600 dark:text-red-400"
                                : "text-sm"
                            }
                          >
                            {r.next_contact_date}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {source?.auto ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="secondary">{source.label}</Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                Auto-added — not yet assessed by an organiser. Editing
                                the profile marks it as curated.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            {source?.label ?? "Curated"}
                          </span>
                        )}
                      </TableCell>
                      {canWrite && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Edit profile"
                              onClick={() => setEditRow(r)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title={r.is_archived ? "Restore" : "Archive"}
                              onClick={() =>
                                updateMutation.mutate({
                                  profileId: r.profile_id!,
                                  update: {
                                    is_archived: !r.is_archived,
                                    // Archiving is bookkeeping, not curation.
                                    source: r.source ?? "manual",
                                  },
                                })
                              }
                            >
                              {r.is_archived ? (
                                <ArchiveRestore className="h-3.5 w-3.5" />
                              ) : (
                                <Archive className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <ActivistProfileDialog
        campaignId={campaignId}
        row={editRow}
        open={editRow != null}
        onOpenChange={(open) => {
          if (!open) setEditRow(null);
        }}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to activist register</DialogTitle>
            <DialogDescription>
              Pick a campaign worker to add as a curated register entry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Worker</Label>
            <Select value={addWorkerId} onValueChange={setAddWorkerId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a worker…" />
              </SelectTrigger>
              <SelectContent>
                {addableWorkers.map((w) => (
                  <SelectItem key={w.worker_id} value={String(w.worker_id)}>
                    {workerOptionName(w)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {addableWorkers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Every campaign worker is already on the register.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!addWorkerId || createMutation.isPending}
              onClick={() =>
                createMutation.mutate(Number(addWorkerId), {
                  onSuccess: () => {
                    setAddOpen(false);
                    setAddWorkerId("");
                    queryClient.invalidateQueries({
                      queryKey: ["activist-register", campaignId],
                    });
                  },
                })
              }
            >
              {createMutation.isPending ? "Adding…" : "Add"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
