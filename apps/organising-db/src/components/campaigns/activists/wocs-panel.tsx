"use client";

/**
 * WOCs — committees as first-class entities: declared scope (a group
 * OU subtree plus optional extra units), a roster where every role is
 * a development assignment, unit representation (derived, never
 * hand-maintained) and the meeting log.
 */
import { useMemo, useState } from "react";
import { ChevronLeft, Plus, UserMinus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { CampaignWorkerNameButton } from "../campaign-worker-detail-provider";
import {
  WOC_FORMATS,
  WOC_ROLES,
  WOC_STATUSES,
} from "@/lib/campaign/activist-constants";
import {
  useOuOptions,
  useSaveWoc,
  useSaveWocMember,
  useWocMeetings,
  useWocMembers,
  useWocRepresentation,
  useWocs,
  type WocWithRollup,
} from "./use-woc-data";
import { useActivistTasks, useCampaignWorkerOptions } from "./use-activist-data";
import { WocMeetingDialog } from "./woc-meeting-dialog";
import { ActivistTaskDialog } from "./activist-task-dialog";
import type { WocMeetingRow } from "./types";
import { workerOptionName } from "./types";

const NONE = "__none__";

function statusBadgeVariant(status: string | null) {
  return status === "active" ? "default" : "outline";
}

// ---------------------------------------------------------------------------
// Committee create/edit dialog
// ---------------------------------------------------------------------------

function WocEditDialog({
  campaignId,
  woc,
  open,
  onOpenChange,
}: {
  campaignId: string;
  woc: WocWithRollup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!open) return null;
  return (
    <WocEditDialogInner
      key={woc?.woc_id ?? "new"}
      campaignId={campaignId}
      woc={woc}
      onOpenChange={onOpenChange}
    />
  );
}

function WocEditDialogInner({
  campaignId,
  woc,
  onOpenChange,
}: {
  campaignId: string;
  woc: WocWithRollup | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: ouOptions = [] } = useOuOptions(campaignId);
  const saveMutation = useSaveWoc(campaignId);

  const [name, setName] = useState(woc?.name ?? "");
  const [status, setStatus] = useState(woc?.status ?? "forming");
  const [cadence, setCadence] = useState(woc?.cadence ?? "");
  const [format, setFormat] = useState(woc?.format ?? NONE);
  const [scopeOuId, setScopeOuId] = useState(
    woc?.scope_ou_id != null ? String(woc.scope_ou_id) : NONE
  );
  const [extraUnitIds, setExtraUnitIds] = useState<number[]>(
    woc?.scope_extra_ou_ids ?? []
  );
  const [notes, setNotes] = useState(woc?.notes ?? "");

  const groups = ouOptions.filter((o) => o.is_group_container);
  const units = ouOptions.filter((o) => !o.is_group_container);

  const toggleExtraUnit = (ouId: number) =>
    setExtraUnitIds((ids) =>
      ids.includes(ouId) ? ids.filter((i) => i !== ouId) : [...ids, ouId]
    );

  const save = () => {
    if (!name.trim()) return;
    saveMutation.mutate(
      {
        wocId: woc?.woc_id,
        values: {
          name: name.trim(),
          status,
          cadence: cadence || null,
          format: format === NONE ? null : format,
          scope_ou_id: scopeOuId === NONE ? null : Number(scopeOuId),
          notes: notes || null,
        },
        extraUnitIds,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{woc ? "Edit WOC" : "New WOC"}</DialogTitle>
          <DialogDescription>
            Start as soon as you have two or more leaders across different crews
            — the WOC is how you get full coverage, not what you wait for.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="woc-name">Name *</Label>
            <Input
              id="woc-name"
              placeholder="e.g. KGP — Monos WOC"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WOC_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Usual format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger>
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {WOC_FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="woc-cadence">Cadence</Label>
            <Input
              id="woc-cadence"
              placeholder="e.g. Fortnightly by video, both swings"
              value={cadence}
              onChange={(e) => setCadence(e.target.value)}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Scope — group this WOC covers</Label>
            <Select value={scopeOuId} onValueChange={setScopeOuId}>
              <SelectTrigger>
                <SelectValue placeholder="No group scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No group scope</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.ou_id} value={String(g.ou_id)}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Representation is derived per unit under the scope: a unit counts as
              represented when at least one current WOC member is assigned to it.
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Extra units in scope (outside the group)</Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
              {units.map((u) => (
                <label key={u.ou_id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={extraUnitIds.includes(u.ou_id)}
                    onCheckedChange={() => toggleExtraUnit(u.ou_id)}
                  />
                  {u.name}
                </label>
              ))}
              {units.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No units defined on Campaign Units yet.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="woc-notes">Notes</Label>
            <Textarea
              id="woc-notes"
              rows={2}
              placeholder="Ground rules, channel security, venue…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!name.trim() || saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save WOC"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Committee detail — roster, representation, meetings
// ---------------------------------------------------------------------------

function WocDetail({
  campaignId,
  woc,
  canWrite,
  onBack,
}: {
  campaignId: string;
  woc: WocWithRollup;
  canWrite: boolean;
  onBack: () => void;
}) {
  const { data: members = [] } = useWocMembers(woc.woc_id);
  const { data: meetings = [] } = useWocMeetings(woc.woc_id);
  const { data: representation = [] } = useWocRepresentation(
    campaignId,
    woc.woc_id
  );
  const { data: workerOptions = [] } = useCampaignWorkerOptions(campaignId);
  const { data: allTasks = [] } = useActivistTasks(campaignId);
  const memberMutation = useSaveWocMember(campaignId);

  const [editOpen, setEditOpen] = useState(false);
  const [meetingDialog, setMeetingDialog] = useState<{
    open: boolean;
    meeting: WocMeetingRow | null;
  }>({ open: false, meeting: null });
  const [taskDialog, setTaskDialog] = useState<{
    open: boolean;
    meetingId: number | null;
  }>({ open: false, meetingId: null });

  const [addWorkerId, setAddWorkerId] = useState("");
  const [addRole, setAddRole] = useState("member");

  const activeMembers = useMemo(
    () => members.filter((m) => m.left_on == null),
    [members]
  );
  const activeMemberIds = useMemo(
    () => new Set(activeMembers.map((m) => m.worker_id)),
    [activeMembers]
  );
  const addableWorkers = useMemo(
    () => workerOptions.filter((w) => !activeMemberIds.has(w.worker_id)),
    [workerOptions, activeMemberIds]
  );

  const taskRollup = useMemo(() => {
    const byMeeting = new Map<number, { total: number; done: number }>();
    for (const t of allTasks) {
      if (t.set_in_woc_meeting_id == null) continue;
      const entry = byMeeting.get(t.set_in_woc_meeting_id) ?? {
        total: 0,
        done: 0,
      };
      entry.total += 1;
      if (t.status === "complete") entry.done += 1;
      byMeeting.set(t.set_in_woc_meeting_id, entry);
    }
    return byMeeting;
  }, [allTasks]);

  const roleLabel = (value: string) =>
    WOC_ROLES.find((r) => r.value === value)?.label ?? value;

  const representedCount = representation.filter((r) => r.represented).length;

  const wocActivistOptions = useMemo(
    () =>
      workerOptions.filter((w) => activeMemberIds.has(w.worker_id)),
    [workerOptions, activeMemberIds]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
            All WOCs
          </Button>
          <h3 className="text-lg font-semibold">{woc.name}</h3>
          <Badge variant={statusBadgeVariant(woc.status)}>
            {WOC_STATUSES.find((s) => s.value === woc.status)?.label ?? woc.status}
          </Badge>
          {representation.length > 0 && (
            <Badge variant="outline">
              covers {representedCount} of {representation.length} units
            </Badge>
          )}
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              Edit WOC
            </Button>
            <Button
              size="sm"
              onClick={() => setMeetingDialog({ open: true, meeting: null })}
            >
              <Plus className="h-4 w-4" />
              Log meeting
            </Button>
          </div>
        )}
      </div>

      {woc.cadence && (
        <p className="text-sm text-muted-foreground">Cadence: {woc.cadence}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Roster */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Roster ({activeMembers.length})
            </CardTitle>
            <CardDescription>
              Members join by taking a responsibility — every role is a
              development assignment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            ) : (
              <ul className="space-y-2">
                {activeMembers.map((m) => (
                  <li
                    key={m.woc_member_id}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <CampaignWorkerNameButton workerId={m.worker_id}>
                        {m.workers
                          ? `${m.workers.first_name} ${m.workers.last_name}`
                          : `#${m.worker_id}`}
                      </CampaignWorkerNameButton>
                      <Badge variant="secondary" className="shrink-0">
                        {roleLabel(m.woc_role)}
                      </Badge>
                    </div>
                    {canWrite && (
                      <div className="flex items-center gap-1.5">
                        <Select
                          value={m.woc_role}
                          onValueChange={(role) =>
                            memberMutation.mutate({
                              wocId: woc.woc_id,
                              workerId: m.worker_id,
                              role,
                            })
                          }
                        >
                          <SelectTrigger className="h-7 w-36 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WOC_ROLES.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Mark as left"
                          onClick={() =>
                            memberMutation.mutate({
                              wocId: woc.woc_id,
                              workerId: m.worker_id,
                              role: m.woc_role,
                              leave: true,
                            })
                          }
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canWrite && (
              <div className="flex items-end gap-2 border-t pt-3">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Add member</Label>
                  <Select value={addWorkerId} onValueChange={setAddWorkerId}>
                    <SelectTrigger className="h-8">
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
                </div>
                <div className="w-36 space-y-1">
                  <Label className="text-xs">Role</Label>
                  <Select value={addRole} onValueChange={setAddRole}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WOC_ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  disabled={!addWorkerId || memberMutation.isPending}
                  onClick={() =>
                    memberMutation.mutate(
                      {
                        wocId: woc.woc_id,
                        workerId: Number(addWorkerId),
                        role: addRole,
                      },
                      { onSuccess: () => setAddWorkerId("") }
                    )
                  }
                >
                  Add
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Representation / gap check */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Unit representation</CardTitle>
            <CardDescription>
              A unit with no voice in the WOC is an agenda item, not background
              noise.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {representation.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No scope set — edit the WOC and pick the group (or units) it
                should cover.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {representation.map((r) => (
                  <li
                    key={r.ou_id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{r.ou_name}</span>
                    {r.represented ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-500 text-emerald-700 dark:border-emerald-600 dark:text-emerald-400"
                      >
                        {r.member_count} member{(r.member_count ?? 0) === 1 ? "" : "s"}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-red-500 text-red-600 dark:border-red-600 dark:text-red-400"
                      >
                        Gap
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Meetings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Meeting log ({meetings.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {meetings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No meetings logged yet. Anchor the first one to a live campaign
              moment — never a meeting about meetings.
            </p>
          ) : (
            <ul className="space-y-2">
              {meetings.map((m, idx) => {
                const rollup = taskRollup.get(m.meeting_id);
                const missing =
                  (m.crews_missing_snapshot as Array<{ name: string }> | null) ??
                  [];
                return (
                  <li
                    key={m.meeting_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">
                          {m.meeting_date}
                        </span>
                        {m.activity_id != null && (
                          <Badge variant="secondary" className="text-[10px]">
                            attendance tracked
                          </Badge>
                        )}
                        {rollup && (
                          <Badge variant="outline" className="text-[10px]">
                            tasks {rollup.done}/{rollup.total} done
                          </Badge>
                        )}
                        {missing.length > 0 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-red-500 text-red-600 dark:text-red-400"
                          >
                            {missing.length} crew{missing.length === 1 ? "" : "s"} missing
                          </Badge>
                        )}
                      </div>
                      {m.whats_new && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {m.whats_new}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      {canWrite && idx === 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7"
                          onClick={() =>
                            setTaskDialog({ open: true, meetingId: m.meeting_id })
                          }
                        >
                          <Plus className="h-3 w-3" />
                          Task from meeting
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        onClick={() => setMeetingDialog({ open: true, meeting: m })}
                      >
                        {canWrite ? "Open" : "View"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <WocEditDialog
        campaignId={campaignId}
        woc={woc}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <WocMeetingDialog
        campaignId={campaignId}
        wocId={woc.woc_id}
        wocName={woc.name}
        meeting={meetingDialog.meeting}
        previousMeeting={
          meetingDialog.meeting
            ? (meetings[meetings.findIndex((m) => m.meeting_id === meetingDialog.meeting!.meeting_id) + 1] ?? null)
            : (meetings[0] ?? null)
        }
        members={members}
        representation={representation}
        open={meetingDialog.open}
        onOpenChange={(open) =>
          setMeetingDialog((d) => ({ open, meeting: open ? d.meeting : null }))
        }
      />

      <ActivistTaskDialog
        campaignId={campaignId}
        canWrite={canWrite}
        task={null}
        workerOptions={wocActivistOptions}
        open={taskDialog.open}
        onOpenChange={(open) =>
          setTaskDialog((d) => ({ ...d, open, meetingId: open ? d.meetingId : null }))
        }
        wocMeetingId={taskDialog.meetingId}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel — committee list
// ---------------------------------------------------------------------------

export function WocsPanel({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const { data: wocs = [], isLoading } = useWocs(campaignId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const selected = wocs.find((w) => w.woc_id === selectedId) ?? null;

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <EurekaLoadingSpinner />
      </div>
    );
  }

  if (selected) {
    return (
      <WocDetail
        campaignId={campaignId}
        woc={selected}
        canWrite={canWrite}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Workplace Organising Committees — the structure that turns individual
          leaders into a machine that covers the worksite.
        </p>
        {canWrite && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New WOC
          </Button>
        )}
      </div>

      {wocs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No WOCs yet. Start one as soon as you have two or more leaders across
            different crews.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {wocs.map((w) => (
            <Card
              key={w.woc_id}
              className="cursor-pointer transition-colors hover:bg-muted/40"
              onClick={() => setSelectedId(w.woc_id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{w.name}</CardTitle>
                  <Badge variant={statusBadgeVariant(w.status)}>
                    {WOC_STATUSES.find((s) => s.value === w.status)?.label ??
                      w.status}
                  </Badge>
                </div>
                {w.cadence && <CardDescription>{w.cadence}</CardDescription>}
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline">
                  {w.member_count} member{w.member_count === 1 ? "" : "s"}
                </Badge>
                {w.scope_unit_count > 0 && (
                  <Badge
                    variant="outline"
                    className={
                      w.represented_unit_count < w.scope_unit_count
                        ? "border-amber-500 text-amber-700 dark:border-amber-600 dark:text-amber-400"
                        : "border-emerald-500 text-emerald-700 dark:border-emerald-600 dark:text-emerald-400"
                    }
                  >
                    covers {w.represented_unit_count} of {w.scope_unit_count} units
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <WocEditDialog
        campaignId={campaignId}
        woc={null}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}
