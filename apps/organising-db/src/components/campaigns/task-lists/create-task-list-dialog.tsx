"use client";

/**
 * Stepper-based task-list creator (Phase 3 of leader-tasking).
 *
 * Replaces the legacy single-screen CreateTaskListDialog with a 5-step
 * composer:
 *
 *   1. Anchor   — pick an entry point (Leader / Activity / Workers).
 *   2. Leader   — pick a worker leader OR organiser.
 *   3. Activity — pick or create the linked activity, edit assessment_type.
 *   4. Workers  — pick the workers using the shared <WorkerPicker /> from
 *                 ../shared/worker-picker.tsx (same picker the relationships
 *                 tab uses, so behaviour stays consistent).
 *   5. Options  — Membership-ask flag + Save-as-draft / Activate-now toggle.
 *
 * State management uses useReducer; the user can navigate freely between
 * steps via the stepper indicator at the top. Steps that are not yet
 * relevant (e.g. workers when no leader picked) remain navigable so the
 * user can always go back and edit prior choices.
 *
 * The mutation:
 *   - INSERTs campaign_task_lists with status = 'active' or 'draft'.
 *     If the row is created/updated in status='active' with a
 *     leader_worker_id, the trigger fn_auto_rate_promote_task_list_leader()
 *     auto-rates the LEADER as 1 (when an activity is linked) and ensures
 *     the leader's union role is activist or delegate — promoting to
 *     activist if it is anything else. Drafts are no-ops on this path.
 *   - Bulk-INSERTs campaign_task_list_items for the selected workers.
 *     The trigger fn_task_list_item_side_effects() ensures a campaign
 *     membership shell row exists and links each assignee as a follower
 *     of the leader. It does NOT auto-rate the assignee and does NOT
 *     change their union role — workers on the list are there to be
 *     assessed by the leader.
 *   - Persists `include_membership_ask`. Phase 4 reads this flag from the
 *     leader webform; no extra inserts are produced here.
 *
 * The dialog also accepts a `draft` prop. When set, the stepper is opened
 * pre-populated with that draft's leader/activity/workers/options so the
 * user can complete setup and activate. On save we UPDATE the existing
 * row instead of INSERTing a new one.
 */

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { resolveCampaignOrganiserId } from "@/lib/campaign/resolve-campaign-organiser";
import { CampaignOrganiserSelect } from "@/components/campaigns/campaign-organiser-select";
import { CreateAssessmentDialog } from "@/components/campaigns/assessments/create-assessment-dialog";
import { WorkerPicker } from "@/components/campaigns/shared/worker-picker";
import { useLeaderUnitContext } from "@/components/campaigns/wall-chart/leader-unit-context";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  Info,
  Link2,
  Loader2,
  Phone,
  Plus,
  Users,
  ListChecks,
  Crown,
  Settings,
  CircleDot,
  Search,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { fetchApi } from "@/lib/api/fetch-api";
import { IssueLinkDialog, type IssueLinkResult } from "@/components/share/issue-link-dialog";
import { IssuedLinkResultDialog } from "@/components/share/issued-link-result-dialog";

const NONE = "__none__";

const ASSESSMENT_TYPE_VALUES = [
  "hard",
  "self_assessed",
  "organiser_assessed",
  "activist_assessed",
] as const;
type AssessmentType = (typeof ASSESSMENT_TYPE_VALUES)[number];

const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  hard: "Hard outcome",
  self_assessed: "Self assessed",
  organiser_assessed: "Organiser assessed",
  activist_assessed: "Activist assessed",
};

const ASSESSMENT_TYPE_HELP =
  "Provenance for ratings on this assessment. " +
  "Hard = directly observed (e.g. signed petition). " +
  "Self assessed = the worker rated themselves. " +
  "Organiser assessed = staff rated (default). " +
  "Activist assessed = a worker leader rated via the leader webform.";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type CreateTaskListLeaderLock = {
  workerId: number;
  workerName: string;
};

export type CreateTaskListDraft = {
  task_list_id: number;
  title: string | null;
  activity_id: number | null;
  leader_worker_id: number | null;
  leader_organiser_id: number | null;
  include_membership_ask: boolean;
  leader_instructions: string | null;
  worker_ids: number[];
};

export type CreateTaskListDialogProps = {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Force the leader to a particular worker; hides the leader picker. */
  leaderWorkerLock?: CreateTaskListLeaderLock;
  /** Pre-populate the stepper from a saved draft (UPDATE instead of INSERT). */
  draft?: CreateTaskListDraft;
  onCreated?: (taskListId: number, leaderWorkerId: number | null) => void;
};

type Step = "anchor" | "leader" | "activity" | "workers" | "options";

type FormState = {
  anchor: "leader" | "activity" | "workers" | null;
  leader_worker_id: string;       // "" | number-as-string
  leader_organiser_pick: string;  // "" | "user:<uuid>"
  activity_id: string;            // "" | number-as-string
  worker_ids: number[];
  use_followers: boolean;         // toggle in Leader step
  followers_seeded_for_leader: number | null;
  title: string;
  leader_instructions: string;
  include_membership_ask: boolean;
  activate_now: boolean;
};

type Action =
  | { type: "ANCHOR"; value: FormState["anchor"] }
  | { type: "SET_LEADER_WORKER"; value: string }
  | { type: "SET_LEADER_ORGANISER"; value: string }
  | { type: "SET_ACTIVITY"; value: string }
  | { type: "SET_WORKERS"; value: number[] }
  | { type: "SET_USE_FOLLOWERS"; value: boolean }
  | { type: "MARK_FOLLOWERS_SEEDED"; leaderId: number | null }
  | { type: "SET_TITLE"; value: string }
  | { type: "SET_LEADER_INSTRUCTIONS"; value: string }
  | { type: "SET_MEMBERSHIP_ASK"; value: boolean }
  | { type: "SET_ACTIVATE_NOW"; value: boolean }
  | { type: "RESET"; value: FormState };

const EMPTY_STATE: FormState = {
  anchor: null,
  leader_worker_id: "",
  leader_organiser_pick: "",
  activity_id: "",
  worker_ids: [],
  use_followers: true,
  followers_seeded_for_leader: null,
  title: "",
  leader_instructions: "",
  include_membership_ask: false,
  activate_now: false,
};

function reducer(state: FormState, action: Action): FormState {
  switch (action.type) {
    case "ANCHOR":
      return { ...state, anchor: action.value };
    case "SET_LEADER_WORKER": {
      // Reset the followers-seed marker any time the worker leader changes
      // (including switching from one leader to another) so the workers step
      // re-seeds from the new leader's follower set.
      const prevLeaderId = state.leader_worker_id;
      const nextLeaderId = action.value;
      const leaderChanged = prevLeaderId !== nextLeaderId;
      return {
        ...state,
        leader_worker_id: nextLeaderId,
        followers_seeded_for_leader: leaderChanged
          ? null
          : state.followers_seeded_for_leader,
        // Picking a worker leader implicitly clears any organiser leader so
        // the form's leader axis stays single-valued.
        leader_organiser_pick: nextLeaderId !== "" ? "" : state.leader_organiser_pick,
      };
    }
    case "SET_LEADER_ORGANISER":
      return {
        ...state,
        leader_organiser_pick: action.value,
        // Picking an organiser implicitly clears any previously selected
        // worker leader to keep the form's leader axis single-valued.
        leader_worker_id: action.value !== "" && action.value !== NONE ? "" : state.leader_worker_id,
      };
    case "SET_ACTIVITY":
      return { ...state, activity_id: action.value };
    case "SET_WORKERS":
      return { ...state, worker_ids: action.value };
    case "SET_USE_FOLLOWERS":
      return { ...state, use_followers: action.value };
    case "MARK_FOLLOWERS_SEEDED":
      return { ...state, followers_seeded_for_leader: action.leaderId };
    case "SET_TITLE":
      return { ...state, title: action.value };
    case "SET_LEADER_INSTRUCTIONS":
      return { ...state, leader_instructions: action.value };
    case "SET_MEMBERSHIP_ASK":
      return { ...state, include_membership_ask: action.value };
    case "SET_ACTIVATE_NOW":
      return { ...state, activate_now: action.value };
    case "RESET":
      return action.value;
    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function CreateTaskListDialog({
  campaignId,
  open,
  onOpenChange,
  leaderWorkerLock,
  draft,
  onCreated,
}: CreateTaskListDialogProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const router = useRouter();

  // Set after a successful save — shows the success/link-generation step.
  const [savedResult, setSavedResult] = useState<{
    task_list_id: number;
    leader_worker_id: number | null;
    status: string;
    title: string;
  } | null>(null);
  const [issueLinkOpen, setIssueLinkOpen] = useState(false);
  const [issueResult, setIssueResult] = useState<IssueLinkResult | null>(null);
  const [phoneCallListId, setPhoneCallListId] = useState<number | null>(null);
  const [isCreatingCallList, setIsCreatingCallList] = useState(false);
  const [phoneShareOpen, setPhoneShareOpen] = useState(false);
  const [phoneShareIssueResult, setPhoneShareIssueResult] = useState<IssueLinkResult | null>(null);

  const initialState = useMemo<FormState>(() => {
    if (draft) {
      return {
        anchor: "leader",
        leader_worker_id: draft.leader_worker_id ? String(draft.leader_worker_id) : "",
        leader_organiser_pick: "", // organiser picker can't recover the user-id from organiser_id alone — leave for user to re-confirm
        activity_id: draft.activity_id ? String(draft.activity_id) : "",
        worker_ids: draft.worker_ids,
        use_followers: false,
        followers_seeded_for_leader: draft.leader_worker_id ?? null,
        title: draft.title ?? "",
        leader_instructions: draft.leader_instructions ?? "",
        include_membership_ask: draft.include_membership_ask,
        activate_now: false,
      };
    }
    if (leaderWorkerLock) {
      return {
        ...EMPTY_STATE,
        anchor: "leader",
        leader_worker_id: String(leaderWorkerLock.workerId),
      };
    }
    return EMPTY_STATE;
  }, [draft, leaderWorkerLock]);

  const [state, dispatch] = useReducer(reducer, initialState);
  const [currentStep, setCurrentStep] = useState<Step>(
    leaderWorkerLock || draft ? "leader" : "anchor"
  );
  const [organiserFieldKey, setOrganiserFieldKey] = useState(0);
  const [createActivityOpen, setCreateActivityOpen] = useState(false);

  // Stable list of worker_ids that arrived with the draft. The Workers step
  // pins these in a "Pre-loaded from your build list" group at the top so
  // the user can confirm or trim them. We keep this separate from
  // state.worker_ids (which changes as the user toggles) so the group stays
  // anchored to the original cohort even if the user unticks rows.
  const preloadedWorkerIdsRef = useRef<number[]>(draft?.worker_ids ?? []);

  // Re-initialise when the dialog re-opens or the draft id changes.
  useEffect(() => {
    if (open) {
      dispatch({ type: "RESET", value: initialState });
      setCurrentStep(leaderWorkerLock || draft ? "leader" : "anchor");
      setOrganiserFieldKey((k) => k + 1);
      preloadedWorkerIdsRef.current = draft?.worker_ids ?? [];
      setSavedResult(null);
      setIssueLinkOpen(false);
      setIssueResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft?.task_list_id]);

  const { data: activities = [] } = useQuery({
    queryKey: ["campaign-activities", campaignId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_activities")
        .select(
          "activity_id, title, is_binary, supporter_outcome_value, assessment_type"
        )
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // The leader picker (LeaderPickerWidget below) fetches its own data with a
  // richer schema (role, occupation, OU). The flat `campaign-members` query
  // and `memberOptions` derivation that used to live here have been removed.

  const leaderWorkerId = leaderWorkerLock
    ? leaderWorkerLock.workerId
    : state.leader_worker_id
    ? Number(state.leader_worker_id)
    : null;

  // Fetch the leader's existing followers to power the "use existing
  // followers as the worker list" toggle in the Leader step.
  const { data: leaderFollowers = [] } = useQuery({
    queryKey: [
      "leader-links-existing-followers",
      campaignId,
      leaderWorkerId ?? 0,
    ],
    enabled: open && leaderWorkerId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_leader_worker_links")
        .select("follower_worker_id")
        .eq("campaign_id", Number(campaignId))
        .eq("leader_worker_id", leaderWorkerId as number);
      if (error) throw error;
      return (data ?? []).map((r) => r.follower_worker_id as number);
    },
  });

  // When the user toggles "use existing followers" ON, seed the workers
  // selection from the leader's follower list. Only seed once per leader
  // change to avoid stomping on manual deselections.
  useEffect(() => {
    if (!open) return;
    if (leaderWorkerId == null) return;
    if (!state.use_followers) return;
    if (state.followers_seeded_for_leader === leaderWorkerId) return;
    if (leaderFollowers.length === 0) return;
    dispatch({ type: "SET_WORKERS", value: leaderFollowers });
    dispatch({ type: "MARK_FOLLOWERS_SEEDED", leaderId: leaderWorkerId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    leaderWorkerId,
    state.use_followers,
    state.followers_seeded_for_leader,
    leaderFollowers.length,
  ]);

  const selectedActivity = useMemo(
    () =>
      activities.find(
        (a: { activity_id: number }) =>
          state.activity_id !== "" && a.activity_id === Number(state.activity_id)
      ) as
        | {
            activity_id: number;
            title: string;
            is_binary: boolean;
            supporter_outcome_value: string | null;
            assessment_type: string;
          }
        | undefined,
    [activities, state.activity_id]
  );

  const hasLeader =
    !!leaderWorkerLock ||
    state.leader_worker_id !== "" ||
    (state.leader_organiser_pick !== "" && state.leader_organiser_pick !== NONE);
  const hasActivity = state.activity_id !== "";
  const canActivate = hasLeader && hasActivity;

  /* ------------------------------------------------------------------ */
  /* Mutations                                                          */
  /* ------------------------------------------------------------------ */

  // Patch the activity's assessment_type when the user changes it inline
  // from the Activity step.
  const patchAssessmentType = useAuthAwareMutation({
    mutationFn: async (vars: { activity_id: number; assessment_type: AssessmentType }) => {
      const { error } = await supabase
        .from("campaign_activities")
        .update({ assessment_type: vars.assessment_type })
        .eq("activity_id", vars.activity_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-activities", campaignId] });
    },
    onError: (err) => {
      toast.error(`Failed to update assessment type: ${(err as Error).message}`);
    },
  });

  const saveTaskList = useAuthAwareMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");

      const activity_id =
        state.activity_id !== "" ? Number(state.activity_id) : null;
      const leader_worker_id = leaderWorkerLock
        ? leaderWorkerLock.workerId
        : state.leader_worker_id
        ? Number(state.leader_worker_id)
        : null;

      let leader_organiser_id: number | null = null;
      if (
        !leader_worker_id &&
        state.leader_organiser_pick &&
        state.leader_organiser_pick !== NONE
      ) {
        leader_organiser_id = await resolveCampaignOrganiserId(
          supabase,
          state.leader_organiser_pick,
          { currentUserId: user.id, isAdmin }
        );
      }

      const targetStatus = state.activate_now ? "active" : "draft";
      if (targetStatus === "active" && !canActivate) {
        throw new Error(
          "Activation requires both a leader and an assessment. Save as draft instead."
        );
      }

      const taskListPayload = {
        campaign_id: Number(campaignId),
        activity_id,
        leader_worker_id,
        leader_organiser_id,
        title: state.title || null,
        leader_instructions: state.leader_instructions || null,
        status: targetStatus,
        include_membership_ask: state.include_membership_ask,
      };

      let task_list_id: number;
      if (draft) {
        const { error } = await supabase
          .from("campaign_task_lists")
          .update(taskListPayload)
          .eq("task_list_id", draft.task_list_id);
        if (error) throw error;
        task_list_id = draft.task_list_id;
      } else {
        const { data: tl, error } = await supabase
          .from("campaign_task_lists")
          .insert(taskListPayload)
          .select("task_list_id")
          .single();
        if (error) throw error;
        task_list_id = (tl as { task_list_id: number }).task_list_id;
      }

      // Sync the worker items. For a draft re-open we diff against existing
      // items so the trigger only fires for *new* assignments. For a fresh
      // create we just bulk-insert.
      let existingWorkerIds: number[] = [];
      if (draft) {
        const { data: existing, error: exErr } = await supabase
          .from("campaign_task_list_items")
          .select("worker_id")
          .eq("task_list_id", task_list_id);
        if (exErr) throw exErr;
        existingWorkerIds = (existing ?? []).map((r) => r.worker_id as number);
      }
      const existingSet = new Set(existingWorkerIds);
      const desiredSet = new Set(state.worker_ids);
      const toInsert = state.worker_ids.filter((id) => !existingSet.has(id));
      const toRemove = existingWorkerIds.filter((id) => !desiredSet.has(id));

      if (toInsert.length > 0) {
        const startSort = existingWorkerIds.length;
        const { error: iErr } = await supabase
          .from("campaign_task_list_items")
          .insert(
            toInsert.map((worker_id, i) => ({
              task_list_id,
              worker_id,
              sort_order: startSort + i,
            }))
          );
        if (iErr) throw iErr;
      }
      if (toRemove.length > 0) {
        const { error: dErr } = await supabase
          .from("campaign_task_list_items")
          .delete()
          .eq("task_list_id", task_list_id)
          .in("worker_id", toRemove);
        if (dErr) throw dErr;
      }

      return { task_list_id, leader_worker_id, status: targetStatus };
    },
    onSuccess: ({ task_list_id, leader_worker_id, status }) => {
      queryClient.invalidateQueries({ queryKey: ["campaign-task-lists", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-activity-ratings"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-rating-summary", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-members", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-member-ids", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-members-full", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["leader-links"] });
      queryClient.invalidateQueries({ queryKey: ["campaign-leader-form-events"] });
      if (leader_worker_id != null) {
        queryClient.invalidateQueries({
          queryKey: ["campaign-task-lists", campaignId, "for-leader", leader_worker_id],
        });
      }
      // Stay open on the success step instead of closing immediately.
      setSavedResult({
        task_list_id,
        leader_worker_id,
        status,
        title: state.title || (draft?.title ?? "Untitled task list"),
      });
      onCreated?.(task_list_id, leader_worker_id);
    },
    onError: (err) => {
      toast.error(`Failed to save task list: ${(err as Error).message}`);
    },
  });

  /* ------------------------------------------------------------------ */
  /* Step navigation                                                    */
  /* ------------------------------------------------------------------ */

  const STEPS: { id: Step; label: string; icon: typeof Crown }[] = [
    { id: "anchor", label: "Start", icon: CircleDot },
    { id: "leader", label: "Leader", icon: Crown },
    { id: "activity", label: "Assessment", icon: ListChecks },
    { id: "workers", label: "Workers", icon: Users },
    { id: "options", label: "Options", icon: Settings },
  ];
  // The anchor step is hidden once a draft / lock has supplied the entry point.
  const visibleSteps =
    leaderWorkerLock || draft ? STEPS.filter((s) => s.id !== "anchor") : STEPS;

  const currentIdx = visibleSteps.findIndex((s) => s.id === currentStep);
  const goPrev = () => {
    if (currentIdx > 0) setCurrentStep(visibleSteps[currentIdx - 1].id);
  };
  const goNext = () => {
    if (currentIdx < visibleSteps.length - 1) {
      setCurrentStep(visibleSteps[currentIdx + 1].id);
    }
  };

  const stepCompleteness: Record<Step, boolean> = {
    anchor: state.anchor !== null,
    leader: hasLeader,
    activity: hasActivity,
    workers: state.worker_ids.length > 0,
    options: true, // always considered "fillable"
  };

  /* ------------------------------------------------------------------ */
  /* Render                                                             */
  /* ------------------------------------------------------------------ */

  const handleDone = () => {
    onOpenChange(false);
  };

  const handleViewTask = () => {
    router.push(`/campaigns/${campaignId}?tab=tasks`);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">

          {/* ── Success step ─────────────────────────────────────────── */}
          {savedResult ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                  {savedResult.status === "active" ? "Task list activated" : "Draft saved"}
                </DialogTitle>
                <DialogDescription>
                  &ldquo;{savedResult.title}&rdquo;
                  {savedResult.status === "active"
                    ? " is live. Generate a share link to send to the leader."
                    : " has been saved as a draft. Activate it before generating a share link."}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-2">
                {savedResult.status === "active" && (
                  <div className="rounded-md border bg-muted/30 p-4 space-y-3">
                    <p className="text-sm font-medium">Share with leader</p>
                    <p className="text-xs text-muted-foreground">
                      Generate a password-protected link for the leader's webform. You can
                      also do this later from the Task Lists tab.
                    </p>
                    <Button
                      type="button"
                      className="w-full sm:w-auto"
                      onClick={() => setIssueLinkOpen(true)}
                    >
                      <Link2 className="h-4 w-4 mr-2" />
                      Generate share link
                    </Button>
                  </div>
                )}

                {savedResult.status === "active" && (
                  <div className="rounded-md border bg-muted/30 p-4 space-y-3">
                    <p className="text-sm font-medium">Also phone call this group</p>
                    <p className="text-xs text-muted-foreground">
                      Create a mobile calling link from these workers&apos; phone numbers so
                      callers can start dialling immediately. Each caller picks their name
                      on sign-in — the system prevents the same contact being called twice.
                    </p>
                    {phoneCallListId == null ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={isCreatingCallList}
                        onClick={async () => {
                          setIsCreatingCallList(true);
                          try {
                            const res = await fetchApi(
                              `/api/campaigns/${campaignId}/task-lists/${savedResult.task_list_id}/create-call-list`,
                              { method: "POST" },
                            );
                            const json = await res.json() as { list_id?: number; added?: number; error?: string };
                            if (!res.ok) throw new Error(json.error ?? "Failed to create call list");
                            setPhoneCallListId(json.list_id!);
                            toast.success(`Call list created with ${json.added ?? 0} contacts`);
                            setPhoneShareOpen(true);
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed to create call list");
                          } finally {
                            setIsCreatingCallList(false);
                          }
                        }}
                      >
                        {isCreatingCallList ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Phone className="h-4 w-4 mr-2" />
                        )}
                        Create &amp; share phone call link
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => setPhoneShareOpen(true)}
                      >
                        <Phone className="h-4 w-4 mr-2" />
                        Share phone call link again
                      </Button>
                    )}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 sm:flex-none"
                    onClick={handleViewTask}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View task
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1 sm:flex-none"
                    onClick={handleDone}
                  >
                    Return to wall chart
                  </Button>
                </div>
              </div>
            </>
          ) : (
            /* ── Wizard steps ──────────────────────────────────────────── */
            <>
              <DialogHeader>
                <DialogTitle>
                  {draft
                    ? `Complete setup: ${draft.title || "Untitled draft"}`
                    : leaderWorkerLock
                    ? `New task list for ${leaderWorkerLock.workerName}`
                    : "New task list"}
                </DialogTitle>
                <DialogDescription>
                  Configure the leader, activity, workers, and activation options for this
                  campaign task list.
                </DialogDescription>
              </DialogHeader>

              {/* Stepper indicator */}
              <ol className="flex items-center gap-1 border-b pb-3 mb-2">
                {visibleSteps.map((step, idx) => {
                  const isActive = step.id === currentStep;
                  const isComplete = stepCompleteness[step.id];
                  const Icon = step.icon;
                  return (
                    <li key={step.id} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => setCurrentStep(step.id)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : isComplete
                            ? "bg-muted text-foreground hover:bg-accent"
                            : "text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {isComplete && !isActive ? (
                          <Check size={12} />
                        ) : (
                          <Icon size={12} />
                        )}
                        <span>{step.label}</span>
                      </button>
                      {idx < visibleSteps.length - 1 && (
                        <span className="px-1 text-muted-foreground">›</span>
                      )}
                    </li>
                  );
                })}
              </ol>

              <div className="min-h-[260px]">
                {currentStep === "anchor" && (
                  <AnchorStep
                    value={state.anchor}
                    onChange={(v) => {
                      dispatch({ type: "ANCHOR", value: v });
                      if (v === "leader") setCurrentStep("leader");
                      else if (v === "activity") setCurrentStep("activity");
                      else if (v === "workers") setCurrentStep("workers");
                    }}
                  />
                )}

                {currentStep === "leader" && (
                  <LeaderStep
                    campaignId={campaignId}
                    state={state}
                    dispatch={dispatch}
                    organiserFieldKey={organiserFieldKey}
                    leaderWorkerLock={leaderWorkerLock}
                    followersCount={leaderFollowers.length}
                  />
                )}

                {currentStep === "activity" && (
                  <ActivityStep
                    activities={activities as {
                      activity_id: number;
                      title: string;
                      is_binary: boolean;
                      supporter_outcome_value: string | null;
                      assessment_type: string;
                    }[]}
                    state={state}
                    dispatch={dispatch}
                    selectedActivity={selectedActivity}
                    onCreateNew={() => setCreateActivityOpen(true)}
                    onPatchAssessmentType={(activity_id, assessment_type) =>
                      patchAssessmentType.mutate({ activity_id, assessment_type })
                    }
                    isPatching={patchAssessmentType.isPending}
                  />
                )}

                {currentStep === "workers" && (
                  <WorkersStep
                    campaignId={campaignId}
                    leaderWorkerId={leaderWorkerId}
                    workerIds={state.worker_ids}
                    preloadedWorkerIds={preloadedWorkerIdsRef.current}
                    onChange={(ids) => dispatch({ type: "SET_WORKERS", value: ids })}
                  />
                )}

                {currentStep === "options" && (
                  <OptionsStep
                    state={state}
                    dispatch={dispatch}
                    canActivate={canActivate}
                    hasLeader={hasLeader}
                    hasActivity={hasActivity}
                  />
                )}
              </div>

              <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-3 border-t">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={goPrev}
                    disabled={currentIdx === 0}
                  >
                    <ArrowLeft size={14} className="mr-1" /> Back
                  </Button>
                  {currentStep !== "options" && (
                    <Button type="button" variant="outline" onClick={goNext}>
                      Next <ArrowRight size={14} className="ml-1" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => saveTaskList.mutate()}
                    disabled={saveTaskList.isPending}
                  >
                    {saveTaskList.isPending
                      ? "Saving…"
                      : state.activate_now
                      ? draft
                        ? "Activate"
                        : "Create & activate"
                      : draft
                      ? "Save draft"
                      : "Save as draft"}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <CreateAssessmentDialog
        campaignId={campaignId}
        open={createActivityOpen}
        onOpenChange={setCreateActivityOpen}
        lockKind="assessment"
        onCreated={(activity_id) => {
          dispatch({ type: "SET_ACTIVITY", value: String(activity_id) });
          setCreateActivityOpen(false);
        }}
      />

      {savedResult && (
        <>
          <IssueLinkDialog
            title="Generate share link"
            target={
              issueLinkOpen
                ? {
                    title: savedResult.title,
                    contextLabel: "For task list",
                    endpoint: `/api/campaigns/${campaignId}/task-lists/${savedResult.task_list_id}/token`,
                  }
                : null
            }
            onClose={() => setIssueLinkOpen(false)}
            onIssued={(result) => {
              setIssueLinkOpen(false);
              setIssueResult(result);
            }}
          />
          <IssuedLinkResultDialog
            title="Share link ready"
            result={issueResult}
            onClose={() => setIssueResult(null)}
          />

          <IssueLinkDialog
            title="Share for mobile calling"
            target={
              phoneShareOpen && phoneCallListId != null
                ? {
                    title: `Call — ${savedResult.title}`,
                    contextLabel: "For call list",
                    endpoint: `/api/campaigns/${campaignId}/call-lists/${phoneCallListId}/share-token`,
                  }
                : null
            }
            passwordHelp="Share this link with your callers — each person picks their name on sign-in and the system prevents anyone calling the same contact twice."
            onClose={() => setPhoneShareOpen(false)}
            onIssued={(result) => {
              setPhoneShareOpen(false);
              setPhoneShareIssueResult(result);
            }}
          />
          <IssuedLinkResultDialog
            title="Mobile-call link ready"
            result={phoneShareIssueResult}
            onClose={() => setPhoneShareIssueResult(null)}
          />
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Step components                                                    */
/* ------------------------------------------------------------------ */

function AnchorStep({
  value,
  onChange,
}: {
  value: FormState["anchor"];
  onChange: (v: FormState["anchor"]) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        How would you like to start? You can always come back and change any
        choice — the stepper above is fully navigable.
      </p>
      <RadioGroup
        value={value ?? ""}
        onValueChange={(v) => onChange(v as FormState["anchor"])}
        className="grid gap-2"
      >
        <AnchorOption
          value="leader"
          label="Start with a Leader"
          description="Pick a worker leader (or organiser); their existing followers can pre-fill the worker list."
          icon={<Crown size={16} />}
        />
        <AnchorOption
          value="activity"
          label="Start with an Assessment"
          description="Pick or create the assessment first, then choose a leader and the workers to assess."
          icon={<ListChecks size={16} />}
        />
        <AnchorOption
          value="workers"
          label="Start with Workers"
          description="Pick the workers first, then attach a leader and assessment later."
          icon={<Users size={16} />}
        />
      </RadioGroup>
    </div>
  );
}

function AnchorOption({
  value,
  label,
  description,
  icon,
}: {
  value: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <label
      htmlFor={`anchor-${value}`}
      className="flex items-start gap-3 rounded border p-3 cursor-pointer hover:bg-accent"
    >
      <RadioGroupItem id={`anchor-${value}`} value={value} className="mt-1" />
      <span className="flex-1">
        <span className="flex items-center gap-2 font-medium text-sm">
          {icon} {label}
        </span>
        <span className="block text-xs text-muted-foreground mt-1">
          {description}
        </span>
      </span>
    </label>
  );
}

function LeaderStep({
  campaignId,
  state,
  dispatch,
  organiserFieldKey,
  leaderWorkerLock,
  followersCount,
}: {
  campaignId: string;
  state: FormState;
  dispatch: React.Dispatch<Action>;
  organiserFieldKey: number;
  leaderWorkerLock?: CreateTaskListLeaderLock;
  followersCount: number;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A leader can be a worker (preferred) or a staff organiser. Pick one;
        the other is hidden once you&apos;ve chosen.
      </p>

      {!leaderWorkerLock && (
        <div className="space-y-2">
          <Label>Worker leader</Label>
          <LeaderPickerWidget
            campaignId={campaignId}
            value={state.leader_worker_id}
            onChange={(v) =>
              dispatch({ type: "SET_LEADER_WORKER", value: v })
            }
          />
        </div>
      )}

      {leaderWorkerLock && (
        <div className="rounded border bg-muted/30 px-3 py-2 text-sm">
          <span className="font-medium">Leader: </span>
          {leaderWorkerLock.workerName}
        </div>
      )}

      {state.leader_worker_id !== "" || leaderWorkerLock ? (
        followersCount > 0 ? (
          <label className="flex items-start gap-2 text-sm cursor-pointer rounded border bg-muted/20 px-3 py-2">
            <Checkbox
              checked={state.use_followers}
              onCheckedChange={(v) =>
                dispatch({ type: "SET_USE_FOLLOWERS", value: !!v })
              }
              className="mt-0.5"
            />
            <span className="flex-1">
              <span className="block font-medium">
                Use existing followers as the worker list
              </span>
              <span className="block text-xs text-muted-foreground">
                {followersCount} follower{followersCount === 1 ? "" : "s"} already
                linked to this leader. The Workers step will be pre-populated;
                you can still add or remove individuals there.
              </span>
            </span>
          </label>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            This leader has no existing followers. You&apos;ll pick the workers from
            scratch in the Workers step.
          </p>
        )
      ) : null}

      {!leaderWorkerLock && state.leader_worker_id === "" && (
        <CampaignOrganiserSelect
          key={organiserFieldKey}
          resetKey={organiserFieldKey}
          label="Organiser leader (alternative to worker leader)"
          value={state.leader_organiser_pick}
          onChange={(v) =>
            dispatch({
              type: "SET_LEADER_ORGANISER",
              value: v === NONE ? "" : v,
            })
          }
          allowNone
          autoDefaultToCurrentUser={false}
          showStaffHint={false}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* LeaderPickerWidget — campaign-scoped, role-filtered worker picker.  */
/*                                                                     */
/* Default view: workers in this campaign whose member_role_type_id    */
/* maps to contact / activist / delegate. Columns: name, role,         */
/* occupation, organising unit. Search across all those fields. The    */
/* "Add new leader" toggle widens the candidate pool to every worker   */
/* in campaign_worker_membership so a non-leader can be promoted on    */
/* the spot (the Phase 1 trigger will mark them as activist when the   */
/* task list activates and they're added to it).                       */
/* ------------------------------------------------------------------ */

const LEADER_ROLE_NAMES = new Set(["contact", "activist", "delegate"]);

type LeaderCandidate = {
  worker_id: number;
  first_name: string;
  last_name: string;
  occupation: string | null;
  role_name: string | null;
  role_display_name: string | null;
};

function LeaderPickerWidget({
  campaignId,
  value,
  onChange,
}: {
  campaignId: string;
  /** "" or stringified worker_id */
  value: string;
  onChange: (v: string) => void;
}) {
  const supabase = createClient();
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const { data: candidates = [] } = useQuery({
    queryKey: ["task-list-leader-picker", campaignId],
    queryFn: async (): Promise<LeaderCandidate[]> => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(
          `worker_id,
           worker:workers(
             worker_id, first_name, last_name, occupation,
             member_role_type:member_role_types(role_name, display_name)
           )`
        )
        .eq("campaign_id", campaignId);
      if (error) throw error;
      const out: LeaderCandidate[] = [];
      for (const row of data ?? []) {
        const wr = (row as { worker: unknown }).worker;
        const w = (Array.isArray(wr) ? wr[0] : wr) as
          | {
              worker_id: number;
              first_name: string;
              last_name: string;
              occupation: string | null;
              member_role_type: unknown;
            }
          | null;
        if (!w) continue;
        const mt = (Array.isArray(w.member_role_type)
          ? w.member_role_type[0]
          : w.member_role_type) as { role_name: string; display_name: string } | null;
        out.push({
          worker_id: w.worker_id,
          first_name: w.first_name,
          last_name: w.last_name,
          occupation: w.occupation ?? null,
          role_name: mt?.role_name ?? null,
          role_display_name: mt?.display_name ?? null,
        });
      }
      return out;
    },
  });

  const ctx = useLeaderUnitContext({ campaignId, leaderWorkerId: 0 });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates
      .filter((c) =>
        showAll
          ? true
          : c.role_name != null && LEADER_ROLE_NAMES.has(c.role_name.toLowerCase())
      )
      .filter((c) => {
        if (!q) return true;
        const fields = [
          `${c.first_name} ${c.last_name}`,
          c.role_display_name ?? "",
          c.role_name ?? "",
          c.occupation ?? "",
          ctx.allWorkerOuNames(c.worker_id).join(" "),
        ].join(" ").toLowerCase();
        return fields.includes(q);
      })
      .sort(
        (a, b) =>
          a.last_name.localeCompare(b.last_name) ||
          a.first_name.localeCompare(b.first_name)
      );
  }, [candidates, showAll, search, ctx]);

  const selectedId = value !== "" ? Number(value) : null;
  const selected = candidates.find((c) => c.worker_id === selectedId) ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder={
              showAll
                ? "Search all campaign workers…"
                : "Search by name, role, occupation, unit…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
        <Button
          type="button"
          variant={showAll ? "default" : "outline"}
          size="sm"
          onClick={() => setShowAll((s) => !s)}
        >
          <UserPlus size={14} className="mr-1" />
          {showAll ? "Leaders only" : "Add new leader"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {showAll
          ? "Showing all workers in this campaign. Picking one will promote them to activist when the list is activated, unless their role is already activist or delegate."
          : "Showing workers with role contact, activist, or delegate. Switch to \"Add new leader\" to widen the list."}
      </p>
      <div className="max-h-72 overflow-y-auto rounded border divide-y">
        {filtered.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            {showAll
              ? "No matching workers."
              : "No leaders yet in this campaign. Click \"Add new leader\" to pick from the wider workforce."}
          </p>
        ) : (
          filtered.map((c) => {
            const isSelected = c.worker_id === selectedId;
            const ous = ctx.allWorkerOuNames(c.worker_id).join(", ");
            const role = c.role_display_name ?? c.role_name ?? "—";
            return (
              <button
                key={c.worker_id}
                type="button"
                className={`w-full text-left px-2 py-1.5 text-xs flex items-start gap-2 hover:bg-muted/40 ${
                  isSelected ? "bg-primary/10" : ""
                }`}
                onClick={() => onChange(String(c.worker_id))}
              >
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">
                    {c.last_name}, {c.first_name}
                  </span>
                  {c.occupation && (
                    <span className="block text-[10px] text-muted-foreground truncate">
                      {c.occupation}
                    </span>
                  )}
                </span>
                <span className="flex flex-col items-end gap-0.5 shrink-0">
                  <span className="text-[10px] uppercase bg-background border px-1 rounded">
                    {role}
                  </span>
                  {ous && (
                    <span
                      title={`Unit(s): ${ous}`}
                      className="text-[10px] rounded px-1 truncate max-w-[10rem] bg-muted text-muted-foreground"
                    >
                      {ous}
                    </span>
                  )}
                </span>
                {isSelected && (
                  <Check size={14} className="text-primary mt-0.5 shrink-0" />
                )}
              </button>
            );
          })
        )}
      </div>
      {selected && (
        <p className="text-[11px] text-muted-foreground">
          Selected:{" "}
          <span className="font-medium">
            {selected.first_name} {selected.last_name}
          </span>{" "}
          ·{" "}
          <button
            type="button"
            className="underline"
            onClick={() => onChange("")}
          >
            Clear
          </button>
        </p>
      )}
    </div>
  );
}

function ActivityStep({
  activities,
  state,
  dispatch,
  selectedActivity,
  onCreateNew,
  onPatchAssessmentType,
  isPatching,
}: {
  activities: {
    activity_id: number;
    title: string;
    is_binary: boolean;
    supporter_outcome_value: string | null;
    assessment_type: string;
  }[];
  state: FormState;
  dispatch: React.Dispatch<Action>;
  selectedActivity:
    | {
        activity_id: number;
        title: string;
        is_binary: boolean;
        supporter_outcome_value: string | null;
        assessment_type: string;
      }
    | undefined;
  onCreateNew: () => void;
  onPatchAssessmentType: (activity_id: number, assessment_type: AssessmentType) => void;
  isPatching: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Pick an existing assessment or create one inline. Linking an assessment
        is required before the task list can be activated; drafts can leave it
        blank for now.
      </p>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Linked assessment</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCreateNew}
          >
            <Plus size={14} className="mr-1" /> New assessment
          </Button>
        </div>
        <Select
          value={state.activity_id || NONE}
          onValueChange={(v) =>
            dispatch({ type: "SET_ACTIVITY", value: v === NONE ? "" : v })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select assessment (or leave blank for draft)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None (save as draft)</SelectItem>
            {activities.map((a) => (
              <SelectItem key={a.activity_id} value={String(a.activity_id)}>
                {a.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedActivity && (
        <div className="rounded border bg-muted/20 px-3 py-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Selected assessment
              </p>
              <p className="text-sm font-medium">{selectedActivity.title}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {selectedActivity.is_binary && (
                <Badge variant="outline" className="text-[10px]">
                  Binary
                </Badge>
              )}
              {selectedActivity.is_binary && selectedActivity.supporter_outcome_value && (
                <Badge variant="outline" className="text-[10px]">
                  Supporter = {selectedActivity.supporter_outcome_value}
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs">Assessment type</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground">
                      <Info size={12} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">{ASSESSMENT_TYPE_HELP}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Select
              value={selectedActivity.assessment_type}
              onValueChange={(v) =>
                onPatchAssessmentType(selectedActivity.activity_id, v as AssessmentType)
              }
              disabled={isPatching}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSESSMENT_TYPE_VALUES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ASSESSMENT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              The leader webform always tags its own ratings as
              &quot;activist_assessed&quot; via the per-rating override; this
              setting is the assessment-level default.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkersStep({
  campaignId,
  leaderWorkerId,
  workerIds,
  preloadedWorkerIds,
  onChange,
}: {
  campaignId: string;
  leaderWorkerId: number | null;
  workerIds: number[];
  /**
   * Worker IDs that arrived with the draft (e.g. from the wall chart build
   * list). They get pinned at the top of the picker in a "Pre-loaded from
   * list" group so the user can confirm or trim them before saving.
   */
  preloadedWorkerIds?: number[];
  onChange: (ids: number[]) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Pick the workers the leader will rate. These workers are added to
        the list for assessment by the leader — their assessment ratings
        and union role are not changed by this step. When a worker leader
        is set, each assignee is automatically linked as a follower of
        that leader. The leader themselves is auto-rated 1 and (if needed)
        promoted to activist when the list is activated.
      </p>
      {preloadedWorkerIds && preloadedWorkerIds.length > 0 && (
        <p className="text-xs rounded border border-emerald-300/70 bg-emerald-50 px-2 py-1.5 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          {preloadedWorkerIds.length} worker
          {preloadedWorkerIds.length === 1 ? "" : "s"} were pre-loaded from
          your build list and are already selected below. Untick any you
          want to leave off the task list.
        </p>
      )}
      <WorkerPicker
        campaignId={campaignId}
        leaderWorkerId={leaderWorkerId ?? undefined}
        initialSelected={workerIds}
        preloadedWorkerIds={preloadedWorkerIds}
        preloadedGroupLabel="Pre-loaded from your build list"
        onChange={onChange}
      />
    </div>
  );
}

function OptionsStep({
  state,
  dispatch,
  canActivate,
  hasLeader,
  hasActivity,
}: {
  state: FormState;
  dispatch: React.Dispatch<Action>;
  canActivate: boolean;
  hasLeader: boolean;
  hasActivity: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>List title (optional)</Label>
        <Input
          value={state.title}
          onChange={(e) => dispatch({ type: "SET_TITLE", value: e.target.value })}
          placeholder="Defaults to a generated title if left blank"
        />
      </div>

      <div className="space-y-2">
        <Label>Instructions for the leader (optional)</Label>
        <Textarea
          value={state.leader_instructions}
          onChange={(e) =>
            dispatch({ type: "SET_LEADER_INSTRUCTIONS", value: e.target.value })
          }
          placeholder="These instructions appear at the top of the leader's webform, below the video. Use this to explain what you need the leader to do."
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          Displayed as plain text — formatting is not supported.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm cursor-pointer rounded border bg-muted/10 px-3 py-2">
        <Checkbox
          checked={state.include_membership_ask}
          onCheckedChange={(v) =>
            dispatch({ type: "SET_MEMBERSHIP_ASK", value: !!v })
          }
          className="mt-0.5"
        />
        <span className="flex-1">
          <span className="block font-medium">Include membership ask</span>
          <span className="block text-xs text-muted-foreground">
            Surfaces an inline membership-conversion column in the leader
            webform (non_member → member_pending and similar). Phase 4 reads
            this flag to render the column.
          </span>
        </span>
      </label>

      <div className="space-y-2">
        <Label>Status on save</Label>
        <RadioGroup
          value={state.activate_now ? "active" : "draft"}
          onValueChange={(v) =>
            dispatch({ type: "SET_ACTIVATE_NOW", value: v === "active" })
          }
          className="grid gap-2"
        >
          <label
            htmlFor="status-draft"
            className="flex items-start gap-2 rounded border p-2 cursor-pointer hover:bg-accent"
          >
            <RadioGroupItem id="status-draft" value="draft" className="mt-1" />
            <span className="flex-1">
              <span className="block font-medium text-sm">Save as draft</span>
              <span className="block text-xs text-muted-foreground">
                Stays editable. No tokens can be issued until activated.
              </span>
            </span>
          </label>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <label
                  htmlFor="status-active"
                  className={`flex items-start gap-2 rounded border p-2 cursor-pointer hover:bg-accent ${
                    !canActivate ? "opacity-60" : ""
                  }`}
                >
                  <RadioGroupItem
                    id="status-active"
                    value="active"
                    className="mt-1"
                    disabled={!canActivate}
                  />
                  <span className="flex-1">
                    <span className="block font-medium text-sm">Activate now</span>
                    <span className="block text-xs text-muted-foreground">
                      Available once both a leader and an assessment are set.
                    </span>
                  </span>
                </label>
              </TooltipTrigger>
              {!canActivate && (
                <TooltipContent>
                  <p className="text-xs">
                    Activation requires both a leader{" "}
                    {hasLeader ? "(set)" : "(missing)"} and an assessment{" "}
                    {hasActivity ? "(set)" : "(missing)"}.
                  </p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </RadioGroup>
      </div>
    </div>
  );
}
