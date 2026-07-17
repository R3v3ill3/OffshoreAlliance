"use client";

/**
 * WOC meeting log dialog — structured on the standard five-item
 * agenda (What's new → Last tasks & recognition → Next tasks →
 * Walk-thru → Next meeting).
 *
 * "Track commitments & attendance" (early-stage units) creates a
 * backing campaign_activities row (kind woc_meeting) plus an
 * activity_event for the date; commitments are recorded as expected
 * ratings and attendance as actual, via meeting_attendance +
 * record_assessment_event — so they surface on the Assessments tab
 * and wall chart automatically. Mature units leave the toggle off
 * and just log the meeting.
 *
 * On save the dialog snapshots which in-scope units were represented
 * among attendees ("gap check": crews missing is an agenda item, not
 * background noise).
 */
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { WOC_FORMATS } from "@/lib/campaign/activist-constants";
import { invalidateWocData, type WocMemberWithWorker } from "./use-woc-data";
import { useActivistTasks } from "./use-activist-data";
import type { WocMeetingRow, WocUnitRepresentationRow } from "./types";

const NONE = "__none__";

/** Per-attendee capture state. */
type AttendeeStatus = "none" | "committed" | "attended" | "did_not_attend";

const ATTENDEE_CYCLE: AttendeeStatus[] = [
  "none",
  "committed",
  "attended",
  "did_not_attend",
];

const ATTENDEE_LABELS: Record<AttendeeStatus, string> = {
  none: "—",
  committed: "Committed",
  attended: "Attended",
  did_not_attend: "Did not attend",
};

type MeetingForm = {
  meeting_date: string;
  format: string;
  chair_worker_id: string;
  whats_new: string;
  recognition_notes: string;
  new_tasks_summary: string;
  next_meeting_date: string;
  next_chair_worker_id: string;
  notes: string;
  track_attendance: boolean;
  attendee_status: Record<number, AttendeeStatus>;
};

function formFromMeeting(meeting: WocMeetingRow | null): MeetingForm {
  const attendees =
    (meeting?.attendees_snapshot as Array<{
      worker_id: number;
      status?: AttendeeStatus;
    }> | null) ?? [];
  const attendee_status: Record<number, AttendeeStatus> = {};
  for (const a of attendees) {
    attendee_status[a.worker_id] = a.status ?? "attended";
  }
  return {
    meeting_date:
      meeting?.meeting_date ?? new Date().toISOString().slice(0, 10),
    format: meeting?.format ?? NONE,
    chair_worker_id:
      meeting?.chair_worker_id != null ? String(meeting.chair_worker_id) : NONE,
    whats_new: meeting?.whats_new ?? "",
    recognition_notes: meeting?.recognition_notes ?? "",
    new_tasks_summary: meeting?.new_tasks_summary ?? "",
    next_meeting_date: meeting?.next_meeting_date ?? "",
    next_chair_worker_id:
      meeting?.next_chair_worker_id != null
        ? String(meeting.next_chair_worker_id)
        : NONE,
    notes: meeting?.notes ?? "",
    track_attendance: meeting?.activity_id != null,
    attendee_status,
  };
}

export function WocMeetingDialog({
  campaignId,
  wocId,
  wocName,
  meeting,
  previousMeeting,
  members,
  representation,
  open,
  onOpenChange,
}: {
  campaignId: string;
  wocId: number;
  wocName: string;
  meeting: WocMeetingRow | null;
  previousMeeting: WocMeetingRow | null;
  members: WocMemberWithWorker[];
  representation: WocUnitRepresentationRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!open) return null;
  return (
    <WocMeetingDialogInner
      key={meeting?.meeting_id ?? "new"}
      campaignId={campaignId}
      wocId={wocId}
      wocName={wocName}
      meeting={meeting}
      previousMeeting={previousMeeting}
      members={members}
      representation={representation}
      onOpenChange={onOpenChange}
    />
  );
}

function WocMeetingDialogInner({
  campaignId,
  wocId,
  wocName,
  meeting,
  previousMeeting,
  members,
  representation,
  onOpenChange,
}: {
  campaignId: string;
  wocId: number;
  wocName: string;
  meeting: WocMeetingRow | null;
  previousMeeting: WocMeetingRow | null;
  members: WocMemberWithWorker[];
  representation: WocUnitRepresentationRow[];
  onOpenChange: (open: boolean) => void;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MeetingForm>(() => formFromMeeting(meeting));
  const set = (patch: Partial<MeetingForm>) =>
    setForm((f) => ({ ...f, ...patch }));

  const activeMembers = useMemo(
    () => members.filter((m) => m.left_on == null),
    [members]
  );

  // "Last tasks & recognition" — tasks set at the previous meeting.
  const { data: allTasks = [] } = useActivistTasks(campaignId);
  const previousTasks = useMemo(
    () =>
      previousMeeting
        ? allTasks.filter(
            (t) => t.set_in_woc_meeting_id === previousMeeting.meeting_id
          )
        : [],
    [allTasks, previousMeeting]
  );

  const cycleAttendee = (workerId: number) => {
    const current = form.attendee_status[workerId] ?? "none";
    const next =
      ATTENDEE_CYCLE[(ATTENDEE_CYCLE.indexOf(current) + 1) % ATTENDEE_CYCLE.length];
    set({ attendee_status: { ...form.attendee_status, [workerId]: next } });
  };

  const saveMutation = useAuthAwareMutation({
    mutationFn: async () => {
      const presentIds = Object.entries(form.attendee_status)
        .filter(([, s]) => s === "committed" || s === "attended")
        .map(([id]) => Number(id));

      // Gap check snapshot: which in-scope units have an attendee?
      let represented: Array<{ ou_id: number; name: string }> = [];
      let missing: Array<{ ou_id: number; name: string }> = [];
      if (representation.length > 0) {
        const unitIds = representation.map((r) => r.ou_id!);
        const { data: assignments } = await supabase
          .from("campaign_worker_ou")
          .select("ou_id, worker_id")
          .in("ou_id", unitIds);
        const presentSet = new Set(presentIds);
        const coveredUnits = new Set(
          (assignments ?? [])
            .filter((a) => presentSet.has(a.worker_id))
            .map((a) => a.ou_id)
        );
        represented = representation
          .filter((r) => coveredUnits.has(r.ou_id!))
          .map((r) => ({ ou_id: r.ou_id!, name: r.ou_name ?? "" }));
        missing = representation
          .filter((r) => !coveredUnits.has(r.ou_id!))
          .map((r) => ({ ou_id: r.ou_id!, name: r.ou_name ?? "" }));
      }

      // Optional commitments/attendance activity (early-stage units).
      let activityId = meeting?.activity_id ?? null;
      let eventId = meeting?.event_id ?? null;
      if (form.track_attendance && activityId == null) {
        const title = `WOC meeting — ${wocName} · ${form.meeting_date}`;
        const { data: activity, error: actError } = await supabase
          .from("campaign_activities")
          .insert({
            campaign_id: Number(campaignId),
            title,
            activity_kind: "woc_meeting",
            template_key: "activist_woc_meeting",
            is_binary: true,
            description:
              "Auto-created from the Activists & WOCs meeting log to track commitments and attendance.",
          })
          .select("activity_id")
          .single();
        if (actError) throw actError;
        activityId = activity.activity_id;
        const { data: event, error: eventError } = await supabase
          .from("activity_events")
          .insert({
            activity_id: activityId,
            name: title,
            event_kind: "meeting",
            scheduled_at: new Date(`${form.meeting_date}T00:00:00`).toISOString(),
          })
          .select("event_id")
          .single();
        if (eventError) throw eventError;
        eventId = event.event_id;
      }

      const values = {
        woc_id: wocId,
        meeting_date: form.meeting_date,
        format: form.format === NONE ? null : form.format,
        chair_worker_id:
          form.chair_worker_id === NONE ? null : Number(form.chair_worker_id),
        activity_id: activityId,
        event_id: eventId,
        whats_new: form.whats_new || null,
        recognition_notes: form.recognition_notes || null,
        new_tasks_summary: form.new_tasks_summary || null,
        crews_represented_snapshot: represented,
        crews_missing_snapshot: missing,
        attendees_snapshot: Object.entries(form.attendee_status)
          .filter(([, s]) => s !== "none")
          .map(([worker_id, status]) => ({
            worker_id: Number(worker_id),
            status,
          })),
        next_meeting_date: form.next_meeting_date || null,
        next_chair_worker_id:
          form.next_chair_worker_id === NONE
            ? null
            : Number(form.next_chair_worker_id),
        notes: form.notes || null,
      };

      if (meeting) {
        const { error } = await supabase
          .from("woc_committee_meetings")
          .update(values)
          .eq("meeting_id", meeting.meeting_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("woc_committee_meetings")
          .insert(values);
        if (error) throw error;
      }

      // Commitments (expected) and attendance (actual) feed ratings.
      if (form.track_attendance && activityId != null && eventId != null) {
        for (const [workerIdStr, status] of Object.entries(
          form.attendee_status
        )) {
          if (status === "none") continue;
          const workerId = Number(workerIdStr);
          const attendanceStatus =
            status === "committed"
              ? "attending"
              : status === "attended"
                ? "attended"
                : "did_not_attend";
          const { error: attError } = await supabase
            .from("meeting_attendance")
            .upsert(
              {
                event_id: eventId,
                worker_id: workerId,
                status: attendanceStatus,
              },
              { onConflict: "event_id,worker_id" }
            );
          if (attError) throw attError;
          const { error: rpcError } = await supabase.rpc(
            "record_assessment_event",
            {
              p_activity_id: activityId,
              p_worker_id: workerId,
              p_binary_value: attendanceStatus,
              p_rating_phase: status === "committed" ? "expected" : "actual",
              p_event_id: eventId,
              p_source: "meeting",
            }
          );
          if (rpcError) throw rpcError;
        }
      }
    },
    onSuccess: () => {
      invalidateWocData(queryClient, campaignId);
      queryClient.invalidateQueries({ queryKey: ["activist-tasks", campaignId] });
      toast.success(meeting ? "Meeting updated" : "Meeting logged");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(`Failed to save meeting: ${e.message}`),
  });

  const memberName = (m: WocMemberWithWorker) =>
    m.workers ? `${m.workers.first_name} ${m.workers.last_name}` : `#${m.worker_id}`;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {meeting ? "Edit WOC meeting" : "Log WOC meeting"} — {wocName}
          </DialogTitle>
          <DialogDescription>
            The standard agenda: what&apos;s new → last tasks &amp; recognition →
            next tasks → walk-thru → next meeting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="wm-date">Meeting date</Label>
              <Input
                id="wm-date"
                type="date"
                value={form.meeting_date}
                onChange={(e) => set({ meeting_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={form.format} onValueChange={(v) => set({ format: v })}>
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
            <div className="space-y-2">
              <Label>Chair</Label>
              <Select
                value={form.chair_worker_id}
                onValueChange={(v) => set({ chair_worker_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {activeMembers.map((m) => (
                    <SelectItem key={m.worker_id} value={String(m.worker_id)}>
                      {memberName(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-md border p-3">
            <Switch
              id="wm-track"
              checked={form.track_attendance}
              disabled={meeting?.activity_id != null}
              onCheckedChange={(v) => set({ track_attendance: v })}
            />
            <div>
              <Label htmlFor="wm-track">Track commitments &amp; attendance</Label>
              <p className="text-xs text-muted-foreground">
                Creates an assessable activity for this meeting: commitments are
                recorded as expected, attendance as actual — visible on the
                Assessments tab. Leave off for mature units that just log the
                meeting.
              </p>
            </div>
          </div>

          {form.track_attendance && (
            <div className="space-y-2">
              <Label>Attendance (click a name to cycle: committed → attended → did not attend)</Label>
              <div className="flex flex-wrap gap-2">
                {activeMembers.map((m) => {
                  const status = form.attendee_status[m.worker_id] ?? "none";
                  return (
                    <Button
                      key={m.worker_id}
                      type="button"
                      size="sm"
                      variant={status === "none" ? "outline" : "default"}
                      className={
                        status === "did_not_attend"
                          ? "bg-red-600 hover:bg-red-600/90"
                          : status === "committed"
                            ? "bg-sky-600 hover:bg-sky-600/90"
                            : undefined
                      }
                      onClick={() => cycleAttendee(m.worker_id)}
                    >
                      {memberName(m)}
                      {status !== "none" && (
                        <span className="ml-1 text-[10px] opacity-80">
                          {ATTENDEE_LABELS[status]}
                        </span>
                      )}
                    </Button>
                  );
                })}
                {activeMembers.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No current WOC members — build the roster first.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="wm-new">1 · What&apos;s new</Label>
            <Textarea
              id="wm-new"
              rows={2}
              placeholder="Employer moves, member sentiment, new starters, rumours to kill…"
              value={form.whats_new}
              onChange={(e) => set({ whats_new: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>2 · Last tasks &amp; recognition</Label>
            {previousTasks.length > 0 ? (
              <ul className="space-y-1 rounded-md border p-3">
                {previousTasks.map((t) => (
                  <li key={t.activist_task_id} className="flex items-center gap-2 text-sm">
                    <Badge
                      variant={t.status === "complete" ? "default" : "outline"}
                      className="text-[10px]"
                    >
                      {t.status === "complete"
                        ? (t.outcome ?? "done")
                        : t.status}
                    </Badge>
                    <span className="line-clamp-1">{t.responsibility}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                {previousMeeting
                  ? "No tasks were linked to the previous meeting."
                  : "First logged meeting — nothing to review."}
              </p>
            )}
            <Textarea
              rows={2}
              placeholder="Recognition given — specifically, to whom, for what."
              value={form.recognition_notes}
              onChange={(e) => set({ recognition_notes: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wm-tasks">
              3 &amp; 4 · Next tasks — walked through, inoculated, sized
            </Label>
            <Textarea
              id="wm-tasks"
              rows={2}
              placeholder="Headline of tasks set (create each as a 4A task from this meeting afterwards)."
              value={form.new_tasks_summary}
              onChange={(e) => set({ new_tasks_summary: e.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wm-next-date">5 · Next meeting</Label>
              <Input
                id="wm-next-date"
                type="date"
                value={form.next_meeting_date}
                onChange={(e) => set({ next_meeting_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Next chair (rotate deliberately)</Label>
              <Select
                value={form.next_chair_worker_id}
                onValueChange={(v) => set({ next_chair_worker_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {activeMembers.map((m) => (
                    <SelectItem key={m.worker_id} value={String(m.worker_id)}>
                      {memberName(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wm-notes">Notes</Label>
            <Textarea
              id="wm-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save meeting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
