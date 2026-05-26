"use client";

/**
 * Leader webform — Phase 4 overhaul.
 *
 * Top-level state machine: password_required -> loading -> form.
 *
 *  - password_required: shows campaign + activity + leader name (from the
 *    401 GET payload), a password form, and lockout / remaining-attempts
 *    feedback. On success the cookie is set server-side and we re-fetch the
 *    full payload.
 *
 *  - form: rich editor with the worker table, inline edit drawers, the
 *    membership column, an "Add another worker" card with two tabs (search
 *    campaign universe / add new prospective), and a single Submit that
 *    POSTs the whole diff.
 *
 * The cookie name is per-token (see `cookieNameFromToken` from Phase 2);
 * we never see the cookie value here — the server-side handler sets it.
 */

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { fetchApi } from "@/lib/api/fetch-api";
import { VOTE_SUPPORTER_OPTIONS } from "@/lib/campaign/constants";
import { RATING_LEVELS } from "@/types/planner-types";
import { Search, UserX } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────
// Payload types — mirror the GET /api/campaign-leader/[token] response.
// ─────────────────────────────────────────────────────────────────────

type WorkerRow = {
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  occupation: string | null;
  worksite_id: number | null;
  worksite_name: string | null;
  shift_id: number | null;
  shift_name: string | null;
  work_area_id: number | null;
  work_area_name: string | null;
  roster_panel_id: number | null;
  roster_panel_name: string | null;
  union_membership_type_id: number | null;
  union_membership_type_name: string | null;
  union_membership_type_key: string | null;
  employer_id: number | null;
  existing_rating: number | null;
  binary_value: string | null;
  notes: string | null;
};

type OptionRow = {
  id: number;
  name: string;
  employer_id: number | null;
  worksite_id: number | null;
};

type WorksiteOption = { worksite_id: number; worksite_name: string };
type UnionOption = { union_id: number; name: string; badge: string | null };

type FormPayload = {
  campaign: { id?: number; campaign_id?: number; name: string };
  task_list: {
    task_list_id?: number;
    id?: number;
    title: string | null;
    include_membership_ask: boolean;
    leader_worker_id: number | null;
    leader_instructions: string | null;
  };
  activity: {
    activity_id: number;
    title: string;
    is_binary: boolean;
    supporter_outcome_value: string | null;
    assessment_type: string | null;
    rating_labels: Record<string, string> | null;
  } | null;
  workers: WorkerRow[];
  membership_options: {
    unions: UnionOption[];
    allowed_transitions: Record<string, ReadonlyArray<string>>;
  };
  shift_options: OptionRow[];
  work_area_options: OptionRow[];
  roster_panel_options: OptionRow[];
  worksite_options: WorksiteOption[];
};

type GateInfo = {
  campaign_name: string | null;
  activity_title: string | null;
  leader_name: string | null;
  task_list_title: string | null;
  locked_until?: string | null;
};

// ─────────────────────────────────────────────────────────────────────
// Reducer for the worker-table editing state.
// ─────────────────────────────────────────────────────────────────────

type WorkerEditDraft = {
  worksite_id?: number | null;
  shift_id?: number | null;
  work_area_id?: number | null;
  roster_panel_id?: number | null;
  occupation?: string | null;
  phone?: string | null;
  email?: string | null;
};

type MembershipChange = {
  worker_id: number;
  to_type: "member_pending" | "non_oa_member";
  non_oa_union_id?: number;
};

type ProspectiveDraft = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  rating: string;
  notes: string;
};

type TableState = {
  ratings: Record<number, number>;
  binaries: Record<number, string>;
  notes: Record<number, string>;
  expandedRow: number | null;
  workerEdits: Record<number, WorkerEditDraft>;
  membershipChanges: Record<number, MembershipChange>;
  existingAdded: number[];
  /** Sticky list of rows added via "Search campaign universe" — these come
   *  from a separate fetch and are not yet part of the server payload. */
  pendingAddedRows: WorkerRow[];
  prospective: ProspectiveDraft[];
  /** Workers flagged as "no longer in campaign" — removed from the list on submit. */
  removedWorkers: number[];
};

type TableAction =
  | { type: "hydrate"; payload: FormPayload }
  | { type: "set_rating"; worker_id: number; rating: number }
  | { type: "set_binary"; worker_id: number; value: string }
  | { type: "set_notes"; worker_id: number; value: string }
  | { type: "toggle_row"; worker_id: number }
  | { type: "edit_field"; worker_id: number; field: keyof WorkerEditDraft; value: string | number | null }
  | { type: "queue_membership"; change: MembershipChange }
  | { type: "clear_membership"; worker_id: number }
  | { type: "add_existing"; row: WorkerRow }
  | { type: "remove_existing"; worker_id: number }
  | { type: "add_prospective"; row: ProspectiveDraft }
  | { type: "remove_prospective"; index: number }
  | { type: "toggle_removed"; worker_id: number }
  | { type: "reset_after_submit" };

function initialTableState(): TableState {
  return {
    ratings: {},
    binaries: {},
    notes: {},
    expandedRow: null,
    workerEdits: {},
    membershipChanges: {},
    existingAdded: [],
    pendingAddedRows: [],
    prospective: [],
    removedWorkers: [],
  };
}

function tableReducer(state: TableState, action: TableAction): TableState {
  switch (action.type) {
    case "hydrate": {
      const r: Record<number, number> = {};
      const b: Record<number, string> = {};
      const n: Record<number, string> = {};
      for (const w of action.payload.workers) {
        if (w.existing_rating != null) r[w.worker_id] = w.existing_rating;
        if (w.binary_value) b[w.worker_id] = w.binary_value;
        if (w.notes) n[w.worker_id] = w.notes;
      }
      return {
        ...initialTableState(),
        ratings: r,
        binaries: b,
        notes: n,
      };
    }
    case "toggle_removed": {
      const already = state.removedWorkers.includes(action.worker_id);
      return {
        ...state,
        removedWorkers: already
          ? state.removedWorkers.filter((id) => id !== action.worker_id)
          : [...state.removedWorkers, action.worker_id],
      };
    }
    case "set_rating":
      return { ...state, ratings: { ...state.ratings, [action.worker_id]: action.rating } };
    case "set_binary":
      return { ...state, binaries: { ...state.binaries, [action.worker_id]: action.value } };
    case "set_notes":
      return { ...state, notes: { ...state.notes, [action.worker_id]: action.value } };
    case "toggle_row":
      return {
        ...state,
        expandedRow: state.expandedRow === action.worker_id ? null : action.worker_id,
      };
    case "edit_field": {
      const prev = state.workerEdits[action.worker_id] ?? {};
      const next: WorkerEditDraft = { ...prev, [action.field]: action.value };
      return { ...state, workerEdits: { ...state.workerEdits, [action.worker_id]: next } };
    }
    case "queue_membership":
      return {
        ...state,
        membershipChanges: { ...state.membershipChanges, [action.change.worker_id]: action.change },
      };
    case "clear_membership": {
      const next = { ...state.membershipChanges };
      delete next[action.worker_id];
      return { ...state, membershipChanges: next };
    }
    case "add_existing":
      if (state.existingAdded.includes(action.row.worker_id)) return state;
      return {
        ...state,
        existingAdded: [...state.existingAdded, action.row.worker_id],
        pendingAddedRows: [...state.pendingAddedRows, action.row],
      };
    case "remove_existing":
      return {
        ...state,
        existingAdded: state.existingAdded.filter((id) => id !== action.worker_id),
        pendingAddedRows: state.pendingAddedRows.filter((r) => r.worker_id !== action.worker_id),
      };
    case "add_prospective":
      return { ...state, prospective: [...state.prospective, action.row] };
    case "remove_prospective":
      return {
        ...state,
        prospective: state.prospective.filter((_, i) => i !== action.index),
      };
    case "reset_after_submit":
      return {
        ...state,
        workerEdits: {},
        membershipChanges: {},
        existingAdded: [],
        pendingAddedRows: [],
        prospective: [],
        removedWorkers: [],
      };
    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Page state machine.
// ─────────────────────────────────────────────────────────────────────

type PageState =
  | { kind: "loading" }
  | { kind: "password_required"; gate: GateInfo }
  | { kind: "form"; payload: FormPayload }
  | { kind: "error"; message: string };

export default function LeaderTaskPage() {
  const params = useParams();
  const token = params?.token as string;
  const [state, setState] = useState<PageState>({ kind: "loading" });

  const loadPayload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetchApi(`/api/campaign-leader/${token}`);
      if (res.status === 401) {
        const gate = (await res.json()) as GateInfo & {
          requires_password?: boolean;
        };
        setState({ kind: "password_required", gate });
        return;
      }
      const json = (await res.json()) as FormPayload | { error: string };
      if (!res.ok) {
        const msg =
          (json as { error?: string }).error ?? "Failed to load task list";
        setState({ kind: "error", message: msg });
        return;
      }
      setState({ kind: "form", payload: json as FormPayload });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to load",
      });
    }
  }, [token]);

  useEffect(() => {
    // Defer to a microtask so React doesn't see a synchronous setState
    // during effect cleanup (eslint react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => {
      void loadPayload();
    });
  }, [loadPayload]);

  if (state.kind === "loading") {
    return (
      <div className="flex justify-center py-16">
        <EurekaLoadingSpinner />
      </div>
    );
  }

  if (state.kind === "password_required") {
    return (
      <PasswordGate
        token={token}
        gate={state.gate}
        onSuccess={() => void loadPayload()}
      />
    );
  }

  if (state.kind === "error") {
    return <p className="text-destructive text-center py-12">{state.message}</p>;
  }

  return (
    <LeaderForm
      token={token}
      payload={state.payload}
      onAfterSubmit={() => void loadPayload()}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// Password gate.
// ─────────────────────────────────────────────────────────────────────

const passwordSchema = z.object({
  password: z.string().min(1, "Enter the password"),
});
type PasswordForm = z.infer<typeof passwordSchema>;

function PasswordGate({
  token,
  gate,
  onSuccess,
}: {
  token: string;
  gate: GateInfo;
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(
    gate.locked_until ?? null,
  );
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "" },
  });

  async function onSubmit(values: PasswordForm) {
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetchApi(`/api/campaign-leader/${token}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: values.password }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        attempts_remaining?: number;
        locked_until?: string;
        error?: string;
      };
      if (res.ok && body.ok) {
        onSuccess();
        return;
      }
      if (res.status === 423) {
        setLockedUntil(body.locked_until ?? null);
        setServerError(
          "Too many failed attempts. The link is locked for 15 minutes.",
        );
        setAttemptsRemaining(0);
        return;
      }
      if (res.status === 401) {
        setAttemptsRemaining(body.attempts_remaining ?? null);
        setServerError(
          body.attempts_remaining != null
            ? `Incorrect password. ${body.attempts_remaining} attempts remaining.`
            : "Incorrect password.",
        );
        return;
      }
      if (res.status === 410) {
        setServerError(body.error ?? "This link has expired or been revoked.");
        return;
      }
      setServerError(
        typeof body.error === "string" ? body.error : "Sign-in failed",
      );
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  }

  const isLocked = !!lockedUntil && new Date(lockedUntil) > new Date();

  return (
    <div className="flex justify-center py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Enter password</CardTitle>
          <CardDescription>
            {gate.campaign_name ? (
              <>
                <span className="font-medium">{gate.campaign_name}</span>
                {gate.activity_title ? <> &middot; {gate.activity_title}</> : null}
                {gate.leader_name ? <> &middot; for {gate.leader_name}</> : null}
              </>
            ) : (
              "Enter the password shared with your link."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLocked ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive mb-4">
              This link is temporarily locked. Try again after{" "}
              {lockedUntil
                ? new Date(lockedUntil).toLocaleString()
                : "the cooldown ends"}
              .
            </div>
          ) : null}
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-3"
            noValidate
          >
            <div>
              <Label htmlFor="leader-password">Password</Label>
              <Input
                id="leader-password"
                type="password"
                autoComplete="current-password"
                disabled={isLocked || submitting}
                {...form.register("password")}
              />
              {form.formState.errors.password ? (
                <p className="text-xs text-destructive mt-1">
                  {form.formState.errors.password.message}
                </p>
              ) : null}
            </div>
            {serverError && !isLocked ? (
              <p className="text-sm text-destructive">{serverError}</p>
            ) : null}
            {attemptsRemaining != null && attemptsRemaining > 0 && !isLocked ? (
              <p className="text-xs text-muted-foreground">
                {attemptsRemaining} attempts remaining before the link is
                temporarily locked.
              </p>
            ) : null}
            <Button type="submit" disabled={submitting || isLocked} className="w-full">
              {submitting ? "Unlocking…" : "Unlock"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Main form (post-auth).
// ─────────────────────────────────────────────────────────────────────

function LeaderForm({
  token,
  payload,
  onAfterSubmit,
}: {
  token: string;
  payload: FormPayload;
  onAfterSubmit: () => void;
}) {
  const [tableState, dispatch] = useReducer(tableReducer, undefined, initialTableState);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [otherUnionDialog, setOtherUnionDialog] = useState<{
    open: boolean;
    worker?: WorkerRow;
  }>({ open: false });
  const [confirmPending, setConfirmPending] = useState<{
    open: boolean;
    worker?: WorkerRow;
    to?: "member_pending";
  }>({ open: false });
  // Which worker card is open in the detail drawer
  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);

  // Hydrate the reducer when the payload first arrives or changes.
  useEffect(() => {
    dispatch({ type: "hydrate", payload });
  }, [payload]);

  const isBinary = !!payload.activity?.is_binary;
  const includeMembership = !!payload.task_list?.include_membership_ask;
  const showRatings = !!payload.activity;

  const allWorkers = useMemo<WorkerRow[]>(
    () => [...payload.workers, ...tableState.pendingAddedRows],
    [payload.workers, tableState.pendingAddedRows],
  );

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitMessage(null);
    setSubmitErrors([]);
    try {
      const ratingsPayload = showRatings
        ? allWorkers
            .map((w) => {
              const rating =
                tableState.ratings[w.worker_id] ?? w.existing_rating ?? null;
              if (rating == null) return null;
              return {
                worker_id: w.worker_id,
                rating,
                binary_value: isBinary
                  ? tableState.binaries[w.worker_id] ?? w.binary_value ?? null
                  : null,
                notes: tableState.notes[w.worker_id] ?? w.notes ?? null,
              };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null)
        : [];

      const workerEdits = Object.entries(tableState.workerEdits)
        .map(([wid, patch]) => ({
          worker_id: Number(wid),
          patch,
        }))
        .filter((e) => Object.keys(e.patch).length > 0);

      const membershipChanges = Object.values(tableState.membershipChanges);

      const prospectivePayload = tableState.prospective
        .filter((p) => p.first_name.trim() && p.last_name.trim())
        .map((p) => ({
          first_name: p.first_name.trim(),
          last_name: p.last_name.trim(),
          email: p.email.trim() || null,
          phone: p.phone.trim() || null,
          rating: p.rating ? Number(p.rating) : null,
          notes: p.notes.trim() || null,
        }));

      const res = await fetchApi(`/api/campaign-leader/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ratings: ratingsPayload,
          prospective: prospectivePayload,
          worker_edits: workerEdits,
          membership_changes: membershipChanges,
          existing_added: tableState.existingAdded,
          removed_worker_ids: tableState.removedWorkers,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        results?: Record<string, { saved: number; errors: string[] }>;
        error?: unknown;
      };
      if (!res.ok && res.status !== 207) {
        setSubmitErrors([
          typeof body.error === "string" ? body.error : "Save failed",
        ]);
        return;
      }
      const errs: string[] = [];
      if (body.results) {
        for (const [section, res] of Object.entries(body.results)) {
          if (res.errors?.length) {
            for (const e of res.errors) errs.push(`${section}: ${e}`);
          }
        }
      }
      const saved =
        Object.values(body.results ?? {}).reduce(
          (a, r) => a + (r.saved ?? 0),
          0,
        ) || 0;
      if (errs.length) {
        setSubmitErrors(errs);
        setSubmitMessage(`Saved ${saved} change(s) with ${errs.length} issue(s).`);
      } else {
        setSubmitMessage(`Saved ${saved} change(s).`);
      }
      // Reload payload to reflect server state and clear local edits.
      dispatch({ type: "reset_after_submit" });
      onAfterSubmit();
    } catch (e) {
      setSubmitErrors([e instanceof Error ? e.message : "Save failed"]);
    } finally {
      setSubmitting(false);
    }
  }

  function handleMembershipSelect(worker: WorkerRow, value: string) {
    if (value === "member_pending") {
      setConfirmPending({ open: true, worker, to: "member_pending" });
    } else if (value === "non_oa_member") {
      setOtherUnionDialog({ open: true, worker });
    }
  }

  return (
    <div className="space-y-6 px-4 py-6 max-w-6xl mx-auto print:text-black">
      {/* Video header — mobile-optimised. max-h caps height on small screens so
          the video doesn't dominate the viewport before the leader sees content.
          playsInline is required on iOS to prevent fullscreen takeover. */}
      <div className="w-full aspect-video overflow-hidden rounded-md bg-black max-h-48 sm:max-h-64 print:hidden">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover"
        >
          <source src="/heritage_Eureka.mp4" type="video/mp4" />
        </video>
      </div>

      {payload.task_list?.leader_instructions ? (
        <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm whitespace-pre-wrap">
          {payload.task_list.leader_instructions}
        </div>
      ) : null}

      <header>
        <h1 className="text-2xl font-bold">{payload.task_list?.title ?? "Task list"}</h1>
        <p className="text-muted-foreground">{payload.campaign?.name}</p>
        {payload.activity ? (
          <p className="font-medium mt-1">
            {payload.activity.title}
            {payload.activity.assessment_type ? (
              <Badge variant="secondary" className="ml-2 align-middle">
                {humanAssessmentType(payload.activity.assessment_type)}
              </Badge>
            ) : null}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No assessment activity is bound to this list yet.
          </p>
        )}
      </header>

      {/* ── Progress bar ──────────────────────────────────────────────── */}
      {showRatings && (
        <div className="rounded-md border bg-muted/30 px-4 py-2.5 flex items-center justify-between gap-3">
          <span className="text-sm font-medium">
            {allWorkers.filter((w) => (tableState.ratings[w.worker_id] ?? w.existing_rating) != null).length}
            {" / "}
            {allWorkers.length} assessed
          </span>
          {tableState.removedWorkers.length > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <UserX className="h-3.5 w-3.5" />
              {tableState.removedWorkers.length} flagged for removal
            </span>
          )}
          {tableState.pendingAddedRows.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {tableState.pendingAddedRows.length} pending add
            </Badge>
          )}
        </div>
      )}

      {/* ── Worker card list ──────────────────────────────────────────── */}
      <div className="space-y-2">
        {allWorkers.map((w) => {
          const isPending = tableState.pendingAddedRows.some((r) => r.worker_id === w.worker_id);
          const isRemoved = tableState.removedWorkers.includes(w.worker_id);
          const currentRating = tableState.ratings[w.worker_id] ?? w.existing_rating ?? null;
          const currentBinary = tableState.binaries[w.worker_id] ?? w.binary_value ?? null;
          const hasNotes = !!(tableState.notes[w.worker_id] ?? w.notes);
          const hasEdits = !!(tableState.workerEdits[w.worker_id] && Object.keys(tableState.workerEdits[w.worker_id]).length > 0);
          const hasMembership = !!tableState.membershipChanges[w.worker_id];
          return (
            <button
              key={w.worker_id}
              type="button"
              onClick={() => setSelectedWorkerId(w.worker_id)}
              className={`w-full text-left rounded-lg border px-4 py-3 flex items-center gap-3 transition-colors hover:bg-accent active:bg-accent/70 ${isRemoved ? "opacity-50 line-through" : ""}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-semibold leading-snug">
                    {w.first_name} {w.last_name}
                  </span>
                  {isPending && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">new</Badge>
                  )}
                  {isRemoved && (
                    <Badge variant="destructive" className="text-[10px] px-1 py-0">removing</Badge>
                  )}
                  {(hasNotes || hasEdits || hasMembership) && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" title="Has unsaved changes" />
                  )}
                </div>
                {(w.occupation || w.worksite_name) ? (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {[w.occupation, w.worksite_name].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                {isBinary && currentBinary ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {VOTE_SUPPORTER_OPTIONS.find((o) => o.value === currentBinary)?.label ?? currentBinary}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0">
                {currentRating != null ? (
                  <span className={`inline-flex items-center justify-center rounded-full w-8 h-8 text-sm font-bold ${ratingBadgeClass(currentRating)}`}>
                    {currentRating}
                  </span>
                ) : showRatings ? (
                  <span className="inline-flex items-center justify-center rounded-full w-8 h-8 text-sm font-medium bg-muted text-muted-foreground">—</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Worker detail drawer ──────────────────────────────────────── */}
      {(() => {
        const selectedWorker = allWorkers.find((w) => w.worker_id === selectedWorkerId) ?? null;
        return (
          <WorkerDetailDialog
            open={selectedWorkerId !== null}
            worker={selectedWorker}
            tableState={tableState}
            dispatch={dispatch}
            payload={payload}
            showRatings={showRatings}
            isBinary={isBinary}
            includeMembership={includeMembership}
            onMembershipSelect={handleMembershipSelect}
            onClose={() => setSelectedWorkerId(null)}
          />
        );
      })()}

      <AddAnotherWorkerCard
        token={token}
        existingIds={new Set(allWorkers.map((w) => w.worker_id))}
        onAddExisting={(row) => dispatch({ type: "add_existing", row })}
        prospective={tableState.prospective}
        onAddProspective={(row) => dispatch({ type: "add_prospective", row })}
        onRemoveProspective={(i) => dispatch({ type: "remove_prospective", index: i })}
        ratingLabels={payload.activity?.rating_labels ?? null}
      />

      {submitErrors.length > 0 ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm font-medium text-destructive mb-1">
            Some changes had issues:
          </p>
          <ul className="text-xs text-destructive list-disc pl-4 space-y-0.5">
            {submitErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {submitMessage && submitErrors.length === 0 ? (
        <p className="text-sm text-green-600">{submitMessage}</p>
      ) : null}

      <div className="flex gap-2 print:hidden">
        <Button onClick={() => void handleSubmit()} disabled={submitting}>
          {submitting ? "Saving…" : "Submit changes"}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.print()}>
          Print
        </Button>
      </div>

      <ConfirmMembershipPendingDialog
        open={confirmPending.open}
        worker={confirmPending.worker}
        onCancel={() => setConfirmPending({ open: false })}
        onConfirm={() => {
          if (confirmPending.worker) {
            dispatch({
              type: "queue_membership",
              change: {
                worker_id: confirmPending.worker.worker_id,
                to_type: "member_pending",
              },
            });
          }
          setConfirmPending({ open: false });
        }}
      />

      <OtherUnionDialog
        open={otherUnionDialog.open}
        worker={otherUnionDialog.worker}
        unions={payload.membership_options.unions}
        onCancel={() => setOtherUnionDialog({ open: false })}
        onConfirm={(union_id) => {
          if (otherUnionDialog.worker) {
            dispatch({
              type: "queue_membership",
              change: {
                worker_id: otherUnionDialog.worker.worker_id,
                to_type: "non_oa_member",
                non_oa_union_id: union_id,
              },
            });
          }
          setOtherUnionDialog({ open: false });
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Membership cell + dialogs.
// ─────────────────────────────────────────────────────────────────────

function MembershipCell({
  worker,
  queued,
  allowed,
  onSelect,
  onClear,
  unions,
}: {
  worker: WorkerRow;
  queued: MembershipChange | undefined;
  allowed: Record<string, ReadonlyArray<string>>;
  onSelect: (value: string) => void;
  onClear: () => void;
  unions: UnionOption[];
}) {
  const fromKey = worker.union_membership_type_key ?? "non_member";
  const allowedTo = allowed[fromKey] ?? [];

  if (queued) {
    const unionName =
      queued.to_type === "non_oa_member" && queued.non_oa_union_id
        ? unions.find((u) => u.union_id === queued.non_oa_union_id)?.name
        : null;
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="capitalize">
          {queued.to_type === "member_pending" ? "Member-pending" : "Other union"}
          {unionName ? `: ${unionName}` : ""}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onClear}
        >
          Undo
        </Button>
      </div>
    );
  }

  if (allowedTo.length === 0) {
    return (
      <span
        className="text-xs text-muted-foreground italic"
        title="No allowed transitions from current state"
      >
        {worker.union_membership_type_name ?? "—"}
      </span>
    );
  }

  return (
    <Select value="" onValueChange={onSelect}>
      <SelectTrigger className="h-9 min-w-[170px]">
        <SelectValue
          placeholder={worker.union_membership_type_name ?? "Set membership"}
        />
      </SelectTrigger>
      <SelectContent>
        {allowedTo.includes("member_pending") ? (
          <SelectItem value="member_pending">Member-pending</SelectItem>
        ) : null}
        {allowedTo.includes("non_oa_member") ? (
          <SelectItem value="non_oa_member">Member of another union</SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  );
}

function ConfirmMembershipPendingDialog({
  open,
  worker,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  worker?: WorkerRow;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as join-pending?</DialogTitle>
          <DialogDescription>
            Flag {worker?.first_name} {worker?.last_name} as Member-pending. A
            staff member will follow up to complete the join.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OtherUnionDialog({
  open,
  worker,
  unions,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  worker?: WorkerRow;
  unions: UnionOption[];
  onCancel: () => void;
  onConfirm: (union_id: number) => void;
}) {
  const [selected, setSelected] = useState<string>("");
  useEffect(() => {
    if (open) return;
    void Promise.resolve().then(() => setSelected(""));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Which union?</DialogTitle>
          <DialogDescription>
            Mark {worker?.first_name} {worker?.last_name} as a member of another
            union and select which one.
          </DialogDescription>
        </DialogHeader>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger>
            <SelectValue placeholder="Select union" />
          </SelectTrigger>
          <SelectContent>
            {unions.map((u) => (
              <SelectItem key={u.union_id} value={String(u.union_id)}>
                {u.badge ? `${u.badge} — ${u.name}` : u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!selected}
            onClick={() => onConfirm(Number(selected))}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Add another worker (search / new).
// ─────────────────────────────────────────────────────────────────────

const prospectiveSchema = z.object({
  first_name: z.string().trim().min(1, "Required"),
  last_name: z.string().trim().min(1, "Required"),
  email: z
    .string()
    .trim()
    .max(200)
    .refine(
      (v) => v === "" || /.+@.+\..+/.test(v),
      "Enter a valid email or leave blank",
    ),
  phone: z.string().trim().max(40),
  rating: z.string(),
  notes: z.string().trim().max(2000),
});
type ProspectiveFormValues = z.infer<typeof prospectiveSchema>;

function AddAnotherWorkerCard({
  token,
  existingIds,
  onAddExisting,
  prospective,
  onAddProspective,
  onRemoveProspective,
  ratingLabels,
}: {
  token: string;
  existingIds: Set<number>;
  onAddExisting: (row: WorkerRow) => void;
  prospective: ProspectiveDraft[];
  onAddProspective: (row: ProspectiveDraft) => void;
  onRemoveProspective: (index: number) => void;
  ratingLabels?: Record<string, string> | null;
}) {
  const [tab, setTab] = useState<"search" | "new">("search");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add another worker</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "search" | "new")}>
          <TabsList>
            <TabsTrigger value="search">Search campaign universe</TabsTrigger>
            <TabsTrigger value="new">Add new worker</TabsTrigger>
          </TabsList>
          <TabsContent value="search">
            <SearchCampaignUniverse
              token={token}
              existingIds={existingIds}
              onAdd={onAddExisting}
            />
          </TabsContent>
          <TabsContent value="new">
            <ProspectiveForm
              prospective={prospective}
              onAdd={onAddProspective}
              onRemove={onRemoveProspective}
              ratingLabels={ratingLabels}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function SearchCampaignUniverse({
  token,
  existingIds,
  onAdd,
}: {
  token: string;
  existingIds: Set<number>;
  onAdd: (row: WorkerRow) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<WorkerRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setError(null);
    const handle = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetchApi(`/api/campaign-leader/${token}/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ q: trimmed }),
          });
          const body = (await res.json().catch(() => ({}))) as {
            results?: Array<{
              worker_id: number;
              first_name: string;
              last_name: string;
              email: string | null;
              phone: string | null;
              occupation: string | null;
            }>;
            error?: unknown;
          };
          if (cancelled) return;
          if (!res.ok) {
            setError(typeof body.error === "string" ? body.error : "Search failed");
            setResults([]);
            return;
          }
          const enriched: WorkerRow[] = (body.results ?? []).map((r) => ({
            worker_id: r.worker_id,
            first_name: r.first_name,
            last_name: r.last_name,
            email: r.email,
            phone: r.phone,
            occupation: r.occupation,
            worksite_id: null,
            worksite_name: null,
            shift_id: null,
            shift_name: null,
            work_area_id: null,
            work_area_name: null,
            roster_panel_id: null,
            roster_panel_name: null,
            union_membership_type_id: null,
            union_membership_type_name: null,
            union_membership_type_key: null,
            employer_id: null,
            existing_rating: null,
            binary_value: null,
            notes: null,
          }));
          setResults(enriched);
        } catch (e) {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : "Search failed");
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [q, token]);

  return (
    <div className="space-y-3 pt-3">
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, phone, or email"
          className="pl-8"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {searching ? (
        <p className="text-xs text-muted-foreground">Searching…</p>
      ) : null}
      {!searching && q.trim().length >= 2 && results.length === 0 ? (
        <p className="text-xs text-muted-foreground">No matching workers.</p>
      ) : null}
      <ul className="space-y-1">
        {results.map((r) => {
          const already = existingIds.has(r.worker_id);
          return (
            <li
              key={r.worker_id}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">
                  {r.first_name} {r.last_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {[r.occupation, r.phone, r.email].filter(Boolean).join(" · ")}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={already}
                onClick={() => onAdd(r)}
              >
                {already ? "On list" : "Add to my list"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProspectiveForm({
  prospective,
  onAdd,
  onRemove,
  ratingLabels,
}: {
  prospective: ProspectiveDraft[];
  onAdd: (row: ProspectiveDraft) => void;
  onRemove: (index: number) => void;
  ratingLabels?: Record<string, string> | null;
}) {
  const form = useForm<ProspectiveFormValues>({
    resolver: zodResolver(prospectiveSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      rating: "",
      notes: "",
    },
  });

  function submit(values: ProspectiveFormValues) {
    onAdd({
      first_name: values.first_name,
      last_name: values.last_name,
      email: values.email,
      phone: values.phone,
      rating: values.rating,
      notes: values.notes,
    });
    form.reset();
  }

  return (
    <div className="space-y-4 pt-3">
      <p className="text-xs text-muted-foreground">
        These additions go to a review queue and will be checked before being
        added to the campaign.
      </p>
      <form onSubmit={form.handleSubmit(submit)} className="grid sm:grid-cols-2 gap-2">
        <Input
          placeholder="First name"
          {...form.register("first_name")}
        />
        <Input
          placeholder="Last name"
          {...form.register("last_name")}
        />
        <Input placeholder="Email" type="email" {...form.register("email")} />
        <Input placeholder="Phone" type="tel" {...form.register("phone")} />
        <Controller
          control={form.control}
          name="rating"
          render={({ field }) => (
            <Select
              value={field.value || "__none__"}
              onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Rating (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {RATING_LEVELS.filter((lvl) => lvl.value > 0).map((lvl) => (
                  <SelectItem key={lvl.value} value={String(lvl.value)}>
                    {lvl.value} — {ratingLabels?.[String(lvl.value)] ?? lvl.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <Textarea
          placeholder="Notes (optional)"
          className="sm:col-span-2"
          {...form.register("notes")}
        />
        {form.formState.errors.first_name ? (
          <p className="text-xs text-destructive">
            First name: {form.formState.errors.first_name.message}
          </p>
        ) : null}
        {form.formState.errors.last_name ? (
          <p className="text-xs text-destructive">
            Last name: {form.formState.errors.last_name.message}
          </p>
        ) : null}
        {form.formState.errors.email ? (
          <p className="text-xs text-destructive">
            Email: {form.formState.errors.email.message}
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <Button type="submit" size="sm">
            Add to list
          </Button>
        </div>
      </form>
      {prospective.length > 0 ? (
        <ul className="space-y-1">
          {prospective.map((p, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">
                  {p.first_name} {p.last_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {[p.phone, p.email].filter(Boolean).join(" · ")}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => onRemove(i)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Rating colour helper (1=supporter leader green → 5=oppositional red)
// ─────────────────────────────────────────────────────────────────────

function ratingBadgeClass(rating: number): string {
  switch (rating) {
    case 1: return "bg-green-700 text-white";
    case 2: return "bg-green-500 text-white";
    case 3: return "bg-amber-400 text-amber-950";
    case 4: return "bg-orange-500 text-white";
    case 5: return "bg-red-600 text-white";
    default: return "bg-muted text-muted-foreground";
  }
}

// ─────────────────────────────────────────────────────────────────────
// Worker detail drawer — full-screen on mobile, constrained on desktop.
// ─────────────────────────────────────────────────────────────────────

function WorkerDetailDialog({
  open,
  worker,
  tableState,
  dispatch,
  payload,
  showRatings,
  isBinary,
  includeMembership,
  onMembershipSelect,
  onClose,
}: {
  open: boolean;
  worker: WorkerRow | null;
  tableState: TableState;
  dispatch: React.Dispatch<TableAction>;
  payload: FormPayload;
  showRatings: boolean;
  isBinary: boolean;
  includeMembership: boolean;
  onMembershipSelect: (worker: WorkerRow, value: string) => void;
  onClose: () => void;
}) {
  if (!worker) return null;
  // Capture as non-nullable so nested functions can close over it safely.
  const w0: WorkerRow = worker;

  const wid = w0.worker_id;
  const currentRating = tableState.ratings[wid] ?? worker.existing_rating ?? null;
  const currentBinary = tableState.binaries[wid] ?? worker.binary_value ?? null;
  const currentNotes = tableState.notes[wid] ?? worker.notes ?? "";
  const draft = tableState.workerEdits[wid] ?? {};
  const queuedMembership = tableState.membershipChanges[wid];
  const isRemoved = tableState.removedWorkers.includes(wid);
  const isPending = tableState.pendingAddedRows.some((r) => r.worker_id === wid);

  function valueOr<T>(raw: T | null | undefined, fallback: T | null): T | null {
    if (raw === undefined) return fallback;
    return raw;
  }

  function scoped<T extends { id: number; name: string; employer_id?: number | null; worksite_id?: number | null }>(opts: T[]): T[] {
    if (!w0.employer_id && !w0.worksite_id) return opts;
    const matches = opts.filter(
      (o) =>
        (o.employer_id && o.employer_id === w0.employer_id) ||
        (o.worksite_id && o.worksite_id === w0.worksite_id),
    );
    const rest = opts.filter(
      (o) =>
        !(o.employer_id && o.employer_id === w0.employer_id) &&
        !(o.worksite_id && o.worksite_id === w0.worksite_id),
    );
    return [...matches, ...rest];
  }

  const worksiteOpts = payload.worksite_options;
  const shiftOpts = scoped(payload.shift_options as { id: number; name: string; employer_id?: number | null; worksite_id?: number | null }[]);
  const workAreaOpts = scoped(payload.work_area_options as typeof shiftOpts);
  const rosterOpts = scoped(payload.roster_panel_options as typeof shiftOpts);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[92dvh] overflow-y-auto flex flex-col gap-0 p-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            {worker.first_name} {worker.last_name}
            {currentRating != null && (
              <span className={`inline-flex items-center justify-center rounded-full w-7 h-7 text-xs font-bold ${ratingBadgeClass(currentRating)}`}>
                {currentRating}
              </span>
            )}
          </DialogTitle>
          {(worker.occupation || worker.worksite_name) ? (
            <DialogDescription>
              {[worker.occupation, worker.worksite_name].filter(Boolean).join(" · ")}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* ── Assessment ──────────────────────────────────────────── */}
          {showRatings && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Assessment</h3>
              <div className="space-y-2">
                <Label className="text-xs">Rating</Label>
                <Select
                  value={currentRating != null ? String(currentRating) : ""}
                  onValueChange={(v) => dispatch({ type: "set_rating", worker_id: wid, rating: Number(v) })}
                >
                  <SelectTrigger className="h-11 text-base">
                    <SelectValue placeholder="— select rating —" />
                  </SelectTrigger>
                  <SelectContent>
                    {RATING_LEVELS.filter((lvl) => lvl.value > 0).map((lvl) => (
                      <SelectItem key={lvl.value} value={String(lvl.value)} className="py-3 text-base">
                        <span className={`inline-flex items-center justify-center rounded-full w-6 h-6 text-xs font-bold mr-2 ${ratingBadgeClass(lvl.value)}`}>{lvl.value}</span>
                        {payload.activity?.rating_labels?.[String(lvl.value)] ?? lvl.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isBinary && (
                <div className="space-y-2">
                  <Label className="text-xs">Response</Label>
                  <Select
                    value={currentBinary ?? ""}
                    onValueChange={(v) => dispatch({ type: "set_binary", worker_id: wid, value: v })}
                  >
                    <SelectTrigger className="h-11 text-base">
                      <SelectValue placeholder="— select response —" />
                    </SelectTrigger>
                    <SelectContent>
                      {VOTE_SUPPORTER_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="py-3 text-base">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  rows={3}
                  className="text-base resize-none"
                  placeholder="Add notes…"
                  value={currentNotes}
                  onChange={(e) => dispatch({ type: "set_notes", worker_id: wid, value: e.target.value })}
                />
              </div>
            </section>
          )}

          {/* ── Membership ──────────────────────────────────────────── */}
          {includeMembership && (
            <section className="space-y-3 pt-1 border-t">
              <h3 className="text-sm font-semibold pt-2">Membership</h3>
              <MembershipCell
                worker={worker}
                queued={queuedMembership}
                allowed={payload.membership_options.allowed_transitions}
                onSelect={(v) => onMembershipSelect(worker, v)}
                onClear={() => dispatch({ type: "clear_membership", worker_id: wid })}
                unions={payload.membership_options.unions}
              />
            </section>
          )}

          {/* ── Update details ──────────────────────────────────────── */}
          <section className="space-y-3 pt-1 border-t">
            <h3 className="text-sm font-semibold pt-2">Update details</h3>
            <div className="space-y-2">
              <Label htmlFor={`phone-d-${wid}`} className="text-xs">Phone</Label>
              <Input
                id={`phone-d-${wid}`}
                type="tel"
                className="h-11 text-base"
                placeholder={worker.phone ?? "Not set"}
                value={valueOr(draft.phone, worker.phone) ?? ""}
                onChange={(e) => dispatch({ type: "edit_field", worker_id: wid, field: "phone", value: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`email-d-${wid}`} className="text-xs">Email</Label>
              <Input
                id={`email-d-${wid}`}
                type="email"
                className="h-11 text-base"
                placeholder={worker.email ?? "Not set"}
                value={valueOr(draft.email, worker.email) ?? ""}
                onChange={(e) => dispatch({ type: "edit_field", worker_id: wid, field: "email", value: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`occ-d-${wid}`} className="text-xs">Occupation</Label>
              <Input
                id={`occ-d-${wid}`}
                className="h-11 text-base"
                placeholder={worker.occupation ?? "Not set"}
                value={valueOr(draft.occupation, worker.occupation) ?? ""}
                onChange={(e) => dispatch({ type: "edit_field", worker_id: wid, field: "occupation", value: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Worksite</Label>
              <Select
                value={valueOr(draft.worksite_id, worker.worksite_id) == null ? "__none__" : String(valueOr(draft.worksite_id, worker.worksite_id))}
                onValueChange={(v) => dispatch({ type: "edit_field", worker_id: wid, field: "worksite_id", value: v === "__none__" ? null : Number(v) })}
              >
                <SelectTrigger className="h-11 text-base"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {worksiteOpts.map((o) => (
                    <SelectItem key={o.worksite_id} value={String(o.worksite_id)}>{o.worksite_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Shift</Label>
              <Select
                value={valueOr(draft.shift_id, worker.shift_id) == null ? "__none__" : String(valueOr(draft.shift_id, worker.shift_id))}
                onValueChange={(v) => dispatch({ type: "edit_field", worker_id: wid, field: "shift_id", value: v === "__none__" ? null : Number(v) })}
              >
                <SelectTrigger className="h-11 text-base"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {shiftOpts.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Work area</Label>
              <Select
                value={valueOr(draft.work_area_id, worker.work_area_id) == null ? "__none__" : String(valueOr(draft.work_area_id, worker.work_area_id))}
                onValueChange={(v) => dispatch({ type: "edit_field", worker_id: wid, field: "work_area_id", value: v === "__none__" ? null : Number(v) })}
              >
                <SelectTrigger className="h-11 text-base"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {workAreaOpts.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Roster / panel</Label>
              <Select
                value={valueOr(draft.roster_panel_id, worker.roster_panel_id) == null ? "__none__" : String(valueOr(draft.roster_panel_id, worker.roster_panel_id))}
                onValueChange={(v) => dispatch({ type: "edit_field", worker_id: wid, field: "roster_panel_id", value: v === "__none__" ? null : Number(v) })}
              >
                <SelectTrigger className="h-11 text-base"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {rosterOpts.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* ── Flags ───────────────────────────────────────────────── */}
          <section className="space-y-3 pt-1 border-t">
            <h3 className="text-sm font-semibold pt-2">Flags</h3>
            <label className="flex items-start gap-3 rounded-md border px-3 py-3 cursor-pointer hover:bg-accent">
              <Checkbox
                checked={isRemoved}
                onCheckedChange={() => dispatch({ type: "toggle_removed", worker_id: wid })}
                className="mt-0.5"
              />
              <span className="flex-1">
                <span className="block text-sm font-medium">No longer in campaign universe</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Removes this person from the task list when you submit. They will remain in the system but won't appear in future tasks.
                </span>
              </span>
            </label>
            {isPending && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive w-full"
                onClick={() => {
                  dispatch({ type: "remove_existing", worker_id: wid });
                  onClose();
                }}
              >
                Remove from this list
              </Button>
            )}
          </section>
        </div>

        <DialogFooter className="px-4 py-3 border-t">
          <Button type="button" className="w-full h-11 text-base" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function humanAssessmentType(t: string): string {
  switch (t) {
    case "hard":
      return "Hard outcome";
    case "self_assessed":
      return "Self-assessed";
    case "organiser_assessed":
      return "Organiser-assessed";
    case "activist_assessed":
      return "Activist-assessed";
    default:
      return t;
  }
}
