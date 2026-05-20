"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { useSaveActivityRating } from "@/lib/hooks/useSaveActivityRating";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, ChevronDown, ChevronUp, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { isWorkerMemberLike } from "@/lib/campaign/constants";
import {
  MembershipNonOaFields,
  type NonOaUnionOptionRow,
  type UnionMembershipTypeOption,
} from "@/components/workers/membership-non-oa-fields";
import { WorkerRelationshipsTab } from "./worker-relationships-tab";
import { RatingPicker } from "../assessments/rating-picker";
import { CreateTaskListDialog } from "../task-lists/create-task-list-dialog";
import type {
  WallChartOU,
  WallChartRoleType,
  WallChartWorker,
  WallChartWorkerContactFocusField,
} from "./types";
import { ouDisplayName } from "./types";

type OccupationOption = {
  occupation_id: number;
  canonical_name: string;
  group_name: string | null;
};

type WorkerNoteRow = {
  note_id: number;
  worker_id: number;
  campaign_id: number | null;
  note_text: string;
  flag_for_follow_up: boolean;
  created_at: string;
};

type WorkerNoteInsert = {
  worker_id: number;
  campaign_id: number | null;
  note_text: string;
  flag_for_follow_up: boolean;
};

type QueryError = { message: string };

type WorkerNotesTable = {
  select: (columns: string) => {
    eq: (column: string, value: number) => {
      order: (
        column: string,
        options: { ascending: boolean }
      ) => Promise<{ data: WorkerNoteRow[] | null; error: QueryError | null }>;
    };
  };
  insert: (row: WorkerNoteInsert) => {
    select: (columns: string) => {
      single: () => Promise<{ data: WorkerNoteRow | null; error: QueryError | null }>;
    };
  };
};

function workerNotesTable(supabase: ReturnType<typeof createClient>) {
  return (supabase as unknown as { from: (table: "worker_notes") => WorkerNotesTable }).from(
    "worker_notes"
  );
}

function normalizeOccupation(row: unknown): OccupationOption {
  const r = row as {
    occupation_id: number;
    canonical_name: string;
    occupation_group?: { name?: string | null } | { name?: string | null }[] | null;
  };
  const group = Array.isArray(r.occupation_group)
    ? r.occupation_group[0]
    : r.occupation_group;
  return {
    occupation_id: r.occupation_id,
    canonical_name: r.canonical_name,
    group_name: group?.name ?? null,
  };
}

export type WorkerDetailSheetProps = {
  campaignId: string;
  workerId: number;
  worker: WallChartWorker;
  ous: WallChartOU[];
  assignedOuIds: number[];
  primaryOuId: number | null;
  roleTypes: WallChartRoleType[];
  canWrite: boolean;
  detailFocusField?: WallChartWorkerContactFocusField | null;
  onClose: () => void;
  onRequestCopyToUnit?: (workerId: number) => void;
};

export function WorkerDetailSheet({
  campaignId,
  workerId,
  worker,
  ous,
  assignedOuIds,
  primaryOuId,
  roleTypes,
  canWrite,
  detailFocusField = null,
  onClose,
  onRequestCopyToUnit,
}: WorkerDetailSheetProps) {
  return (
    <Tabs defaultValue="details" className="mt-2">
      <TabsList className="grid grid-cols-4 w-full">
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="ratings">Ratings</TabsTrigger>
        <TabsTrigger value="units">Units</TabsTrigger>
        <TabsTrigger value="relationships">Relationships</TabsTrigger>
      </TabsList>

      <TabsContent value="details">
        <DetailsTab
          campaignId={campaignId}
          workerId={workerId}
          worker={worker}
          roleTypes={roleTypes}
          canWrite={canWrite}
          detailFocusField={detailFocusField}
          onClose={onClose}
          ous={ous}
        />
      </TabsContent>

      <TabsContent value="ratings">
        <RatingsTab
          campaignId={campaignId}
          workerId={workerId}
          workerName={`${worker.first_name} ${worker.last_name}`}
          canWrite={canWrite}
        />
      </TabsContent>

      <TabsContent value="units">
        <UnitsTab
          campaignId={campaignId}
          workerId={workerId}
          ous={ous}
          assignedOuIds={assignedOuIds}
          primaryOuId={primaryOuId}
          canWrite={canWrite}
          onRequestCopyToUnit={onRequestCopyToUnit}
        />
      </TabsContent>

      <TabsContent value="relationships">
        <WorkerRelationshipsTab
          workerId={workerId}
          campaignId={campaignId}
          workerName={`${worker.first_name} ${worker.last_name}`}
          canWrite={canWrite}
          currentRoleTypeId={worker.member_role_type?.role_type_id ?? null}
          currentRoleName={
            worker.member_role_type?.display_name ??
            worker.member_role_type?.role_name ??
            null
          }
          roleTypes={roleTypes}
        />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Details — edits first/last/email/phone/role + HSR + Bargaining rep
// ---------------------------------------------------------------------------

function DetailsTab({
  campaignId,
  workerId,
  worker,
  roleTypes,
  canWrite,
  detailFocusField,
  onClose,
  ous,
}: {
  campaignId: string;
  workerId: number;
  worker: WallChartWorker;
  roleTypes: WallChartRoleType[];
  canWrite: boolean;
  detailFocusField?: WallChartWorkerContactFocusField | null;
  onClose: () => void;
  ous: WallChartOU[];
}) {
  const supabase = createClient();
  const qc = useQueryClient();
  const cid = Number(campaignId);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const [first, setFirst] = useState(worker.first_name);
  const [last, setLast] = useState(worker.last_name);
  const [email, setEmail] = useState(worker.email ?? "");
  const [phone, setPhone] = useState(worker.phone ?? "");
  const [roleId, setRoleId] = useState(String(worker.member_role_type?.role_type_id ?? ""));
  const [occupationId, setOccupationId] = useState<number | null>(worker.canonical_occupation_id);
  const [isHsr, setIsHsr] = useState(!!worker.is_hsr);
  const [isBargainingRep, setIsBargainingRep] = useState(!!worker.is_bargaining_rep);
  const [unionMembershipTypeId, setUnionMembershipTypeId] = useState<number | null>(
    worker.union_membership_type_id
  );
  const [nonOaUnionOptionId, setNonOaUnionOptionId] = useState<number | null>(
    worker.non_oa_union_option_id
  );
  const [noteText, setNoteText] = useState("");
  const [flagForFollowUp, setFlagForFollowUp] = useState(false);

  const { data: unionMembershipTypes = [] } = useQuery({
    queryKey: ["union-membership-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("union_membership_types")
        .select("union_membership_type_id, display_name, type_name")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as UnionMembershipTypeOption[];
    },
    enabled: !!canWrite,
    staleTime: 60_000,
  });

  const { data: nonOaUnionOptionsList = [] } = useQuery({
    queryKey: ["non-oa-union-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("non_oa_union_options")
        .select("non_oa_union_option_id, badge_initials, display_name")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as NonOaUnionOptionRow[];
    },
    enabled: !!canWrite,
    staleTime: 60_000,
  });

  const { data: occupations = [] } = useQuery({
    queryKey: ["occupations-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("occupations")
        .select(
          "occupation_id, canonical_name, occupation_group:occupation_groups(name)"
        )
        .order("canonical_name");
      if (error) throw error;
      return (data ?? []).map(normalizeOccupation);
    },
    enabled: !!canWrite,
    staleTime: 60_000,
  });

  const { data: workerNotes = [] } = useQuery({
    queryKey: ["worker-notes", workerId],
    queryFn: async () => {
      const { data, error } = await workerNotesTable(supabase)
        .select(
          "note_id, worker_id, campaign_id, note_text, flag_for_follow_up, created_at"
        )
        .eq("worker_id", workerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedMembershipTypeName = useMemo(
    () => unionMembershipTypes.find((t) => t.union_membership_type_id === unionMembershipTypeId)?.type_name,
    [unionMembershipTypes, unionMembershipTypeId]
  );

  useEffect(() => {
    if (!detailFocusField) return;
    const id = requestAnimationFrame(() => {
      const el = detailFocusField === "email" ? emailRef.current : phoneRef.current;
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      el?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [detailFocusField, worker.worker_id]);

  const resolvedRoleName = useMemo(() => {
    if (!roleId || roleId === "__none__") return null;
    return roleTypes.find((r) => r.role_type_id === Number(roleId))?.role_name ?? null;
  }, [roleId, roleTypes]);

  const delegateOk = isWorkerMemberLike({
    unionMembershipTypeName:
      selectedMembershipTypeName ?? worker.union_membership_type?.type_name,
    memberRoleName: resolvedRoleName ?? worker.member_role_type?.role_name,
    isBargainingRep,
  });

  const updateWorker = useAuthAwareMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("workers")
        .update({
          first_name: first,
          last_name: last,
          email: email || null,
          phone: phone || null,
          member_role_type_id: roleId && roleId !== "__none__" ? Number(roleId) : null,
          canonical_occupation_id: occupationId,
          is_hsr: isHsr,
          is_bargaining_rep: isBargainingRep,
          union_membership_type_id: unionMembershipTypeId,
          non_oa_union_option_id: nonOaUnionOptionId,
        })
        .eq("worker_id", workerId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-members-full", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign-members", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign-rating-summary", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign-list-stats-members", cid] });
      qc.invalidateQueries({ queryKey: ["campaign-list-builder-workers", cid] });
      qc.invalidateQueries({ queryKey: ["worker", String(workerId)] });
      qc.invalidateQueries({ queryKey: ["workers"] });
    },
  });

  const createOccupation = useAuthAwareMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Occupation name is required");
      const { data, error } = await supabase
        .from("occupations")
        .insert({ canonical_name: trimmed })
        .select("occupation_id, canonical_name, occupation_group:occupation_groups(name)")
        .single();
      if (error) throw error;
      return normalizeOccupation(data);
    },
    onSuccess: (occupation) => {
      setOccupationId(occupation.occupation_id);
      qc.invalidateQueries({ queryKey: ["occupations-all"] });
      toast.success(`Added ${occupation.canonical_name}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to add occupation");
    },
  });

  const addWorkerNote = useAuthAwareMutation({
    mutationFn: async () => {
      const text = noteText.trim();
      if (!text) throw new Error("Note text is required");
      const { data, error } = await workerNotesTable(supabase)
        .insert({
          worker_id: workerId,
          campaign_id: Number.isFinite(cid) ? cid : null,
          note_text: text,
          flag_for_follow_up: flagForFollowUp,
        })
        .select("note_id, worker_id, campaign_id, note_text, flag_for_follow_up, created_at")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setNoteText("");
      setFlagForFollowUp(false);
      qc.invalidateQueries({ queryKey: ["worker-notes", workerId] });
      toast.success("Note added");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to add note");
    },
  });

  return (
    <div className="grid gap-3 py-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="First name">
          <Input value={first} onChange={(e) => setFirst(e.target.value)} disabled={!canWrite} />
        </Field>
        <Field label="Last name">
          <Input value={last} onChange={(e) => setLast(e.target.value)} disabled={!canWrite} />
        </Field>
      </div>
      <Field label="Email">
        <Input
          ref={emailRef}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={!canWrite}
        />
      </Field>
      <Field label="Phone">
        <Input
          ref={phoneRef}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={!canWrite}
        />
      </Field>
      <Field label="Occupation">
        <OccupationCombobox
          value={occupationId}
          onChange={setOccupationId}
          options={occupations}
          disabled={!canWrite}
          fallbackLabel={worker.canonical_occupation?.canonical_name ?? null}
          onCreate={(name) => createOccupation.mutate(name)}
          isCreating={createOccupation.isPending}
        />
      </Field>
      <Field label="Organising role">
        <Select value={roleId || "__none__"} onValueChange={setRoleId} disabled={!canWrite}>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {roleTypes.map((r) => (
              <SelectItem
                key={r.role_type_id}
                value={String(r.role_type_id)}
                disabled={r.role_name === "delegate" && !delegateOk}
              >
                {r.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {canWrite && unionMembershipTypes.length > 0 && (
        <MembershipNonOaFields
          disabled={updateWorker.isPending}
          membershipTypes={unionMembershipTypes}
          nonOaUnionOptions={nonOaUnionOptionsList}
          invalidateQueryKeys={[
            ["non-oa-union-options"],
            ["campaign-members-full", campaignId],
            ["campaign-members", campaignId],
            ["campaign-list-stats-members", cid],
            ["campaign-list-builder-workers", cid],
            ["worker", String(workerId)],
          ]}
          unionMembershipTypeId={unionMembershipTypeId}
          nonOaUnionOptionId={nonOaUnionOptionId}
          onUnionMembershipChange={(id) => {
            const prevIsNonOa = unionMembershipTypes.some(
              (t) =>
                t.union_membership_type_id === unionMembershipTypeId &&
                t.type_name === "non_oa_member"
            );
            const nextIsNonOa = unionMembershipTypes.some(
              (t) =>
                t.union_membership_type_id === id &&
                t.type_name === "non_oa_member"
            );
            setUnionMembershipTypeId(id);
            if (!nextIsNonOa) setNonOaUnionOptionId(null);
            else if (!prevIsNonOa && nextIsNonOa) setNonOaUnionOptionId(null);
          }}
          onNonOaUnionChange={setNonOaUnionOptionId}
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <ToggleRow
          label="HSR"
          checked={isHsr}
          onChange={setIsHsr}
          disabled={!canWrite}
        />
        <ToggleRow
          label="Bargaining rep"
          checked={isBargainingRep}
          onChange={setIsBargainingRep}
          disabled={!canWrite}
        />
      </div>

      <WorkerNotesSection
        canWrite={canWrite}
        legacyNotes={worker.notes}
        noteText={noteText}
        onNoteTextChange={setNoteText}
        flagForFollowUp={flagForFollowUp}
        onFlagForFollowUpChange={setFlagForFollowUp}
        onAddNote={() => addWorkerNote.mutate()}
        isAdding={addWorkerNote.isPending}
        notes={workerNotes}
      />

      {canWrite && (
        <Button
          onClick={() => {
            updateWorker.mutate(undefined, {
              onSuccess: () => onClose(),
            });
          }}
        >
          Save
        </Button>
      )}

      {canWrite && (
        <RemoveFromCampaignPanel
          campaignId={campaignId}
          workerId={workerId}
          workerName={`${worker.first_name} ${worker.last_name}`}
          ous={ous}
          onRemoved={onClose}
        />
      )}
    </div>
  );
}

function OccupationCombobox({
  value,
  onChange,
  options,
  disabled,
  fallbackLabel,
  onCreate,
  isCreating,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  options: OccupationOption[];
  disabled?: boolean;
  fallbackLabel?: string | null;
  onCreate: (name: string) => void;
  isCreating?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected =
    options.find((occupation) => occupation.occupation_id === value) ??
    (value != null && fallbackLabel
      ? { occupation_id: value, canonical_name: fallbackLabel, group_name: null }
      : null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return options;
    return options.filter(
      (occupation) =>
        occupation.canonical_name.toLowerCase().includes(q) ||
        (occupation.group_name?.toLowerCase().includes(q) ?? false)
    );
  }, [search, options]);

  const grouped = useMemo(() => {
    const map = new Map<string, OccupationOption[]>();
    for (const occupation of filtered) {
      const key = occupation.group_name ?? "Other";
      const list = map.get(key) ?? [];
      list.push(occupation);
      map.set(key, list);
    }
    return map;
  }, [filtered]);

  const exactMatch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return options.some((occupation) => occupation.canonical_name.toLowerCase() === q);
  }, [search, options]);

  useEffect(() => {
    function handleClick(e: globalThis.MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(id: number) {
    onChange(id);
    setSearch("");
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setSearch("");
  }

  function handleCreate() {
    const trimmed = search.trim();
    if (!trimmed || exactMatch || isCreating) return;
    onCreate(trimmed);
    setSearch("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex h-9 w-full cursor-text items-center rounded-md border border-input bg-background px-3 text-sm shadow-sm"
        onClick={() => {
          if (!disabled) {
            setOpen(true);
            setSearch("");
            setTimeout(() => inputRef.current?.focus(), 0);
          }
        }}
      >
        {open ? (
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            value={search}
            placeholder="Search job types..."
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setOpen(true)}
          />
        ) : (
          <span className={selected ? "flex-1 truncate" : "flex-1 text-muted-foreground"}>
            {selected ? selected.canonical_name : "Select job type..."}
          </span>
        )}
        {selected && !open && !disabled && (
          <button
            type="button"
            className="ml-1 rounded text-muted-foreground hover:text-foreground"
            onClick={handleClear}
            aria-label="Clear occupation"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {filtered.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">No job types found.</p>
          ) : (
            [...grouped.entries()].map(([group, items]) => (
              <div key={group}>
                <div className="sticky top-0 bg-muted/80 px-3 py-1 text-xs font-semibold text-muted-foreground backdrop-blur">
                  {group}
                </div>
                {items.map((occupation) => (
                  <button
                    key={occupation.occupation_id}
                    type="button"
                    className={`flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                      occupation.occupation_id === value ? "bg-accent/50 font-medium" : ""
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(occupation.occupation_id);
                    }}
                  >
                    {occupation.canonical_name}
                  </button>
                ))}
              </div>
            ))
          )}
          {search.trim() && !exactMatch && (
            <div className="border-t p-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full justify-start text-xs"
                disabled={isCreating}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleCreate();
                }}
              >
                {isCreating ? "Adding..." : `Add "${search.trim()}"`}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WorkerNotesSection({
  canWrite,
  legacyNotes,
  noteText,
  onNoteTextChange,
  flagForFollowUp,
  onFlagForFollowUpChange,
  onAddNote,
  isAdding,
  notes,
}: {
  canWrite: boolean;
  legacyNotes: string | null;
  noteText: string;
  onNoteTextChange: (value: string) => void;
  flagForFollowUp: boolean;
  onFlagForFollowUpChange: (value: boolean) => void;
  onAddNote: () => void;
  isAdding: boolean;
  notes: WorkerNoteRow[];
}) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Notes
        </p>
        <p className="text-xs text-muted-foreground">
          Notes are timestamped when saved. Follow-up flags are stored for a later workflow.
        </p>
      </div>

      {legacyNotes?.trim() && (
        <div className="rounded border bg-muted/30 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Existing profile notes
          </p>
          <p className="mt-1 whitespace-pre-wrap text-xs">{legacyNotes}</p>
        </div>
      )}

      {canWrite && (
        <div className="space-y-2">
          <Textarea
            value={noteText}
            onChange={(e) => onNoteTextChange(e.target.value)}
            rows={3}
            placeholder="Add a note..."
            className="text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={flagForFollowUp}
                onCheckedChange={(checked) => onFlagForFollowUpChange(checked === true)}
              />
              Flag for follow up
            </label>
            <Button
              type="button"
              size="sm"
              disabled={isAdding || !noteText.trim()}
              onClick={onAddNote}
            >
              {isAdding ? "Adding..." : "Add note"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {notes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No timestamped notes yet.</p>
        ) : (
          notes.map((note) => (
            <div key={note.note_id} className="rounded border px-2 py-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">
                  {new Date(note.created_at).toLocaleString()}
                </span>
                {note.flag_for_follow_up && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    Follow up
                  </span>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap">{note.note_text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Remove from campaign panel — inline destructive zone on the Details tab.
// ---------------------------------------------------------------------------

function RemoveFromCampaignPanel({
  campaignId,
  workerId,
  workerName,
  ous,
  onRemoved,
}: {
  campaignId: string;
  workerId: number;
  workerName: string;
  ous: WallChartOU[];
  onRemoved: () => void;
}) {
  const supabase = createClient();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [clearEmployer, setClearEmployer] = useState(false);
  const [clearWorksite, setClearWorksite] = useState(false);

  // Only fetch employer/worksite info when the panel is open.
  const { data: workerRecord } = useQuery({
    queryKey: ["worker-employer-worksite", workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select(
          `employer_id, worksite_id,
           employer:employers(employer_name),
           worksite:worksites(worksite_name)`
        )
        .eq("worker_id", workerId)
        .single();
      if (error) throw error;
      return data as {
        employer_id: number | null;
        worksite_id: number | null;
        employer: { employer_name: string } | { employer_name: string }[] | null;
        worksite: { worksite_name: string } | { worksite_name: string }[] | null;
      };
    },
    enabled: expanded,
    staleTime: 30_000,
  });

  const employerName = (() => {
    const e = workerRecord?.employer;
    if (!e) return null;
    return (Array.isArray(e) ? e[0] : e)?.employer_name ?? null;
  })();

  const worksiteName = (() => {
    const w = workerRecord?.worksite;
    if (!w) return null;
    return (Array.isArray(w) ? w[0] : w)?.worksite_name ?? null;
  })();

  const removeFromCampaign = useAuthAwareMutation({
    mutationFn: async () => {
      const cidNum = Number(campaignId);

      // 1. Remove all OU assignments for this worker in this campaign.
      const ouIds = ous.map((o) => o.ou_id);
      if (ouIds.length > 0) {
        const { error: ouErr } = await supabase
          .from("campaign_worker_ou")
          .delete()
          .eq("worker_id", workerId)
          .in("ou_id", ouIds);
        if (ouErr) throw ouErr;
      }

      // 2. Remove campaign membership.
      const { error: memErr } = await supabase
        .from("campaign_worker_membership")
        .delete()
        .eq("campaign_id", cidNum)
        .eq("worker_id", workerId);
      if (memErr) throw memErr;

      // 3. Optionally clear employer / worksite on the worker record.
      const workerUpdates: Record<string, unknown> = {};
      if (clearEmployer) workerUpdates.employer_id = null;
      if (clearWorksite) workerUpdates.worksite_id = null;
      if (Object.keys(workerUpdates).length > 0) {
        const { error: wErr } = await supabase
          .from("workers")
          .update(workerUpdates)
          .eq("worker_id", workerId);
        if (wErr) throw wErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign-members-full", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign-members", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign-list-builder-workers", Number(campaignId)] });
      qc.invalidateQueries({ queryKey: ["campaign-ou-coverage", campaignId] });
      qc.invalidateQueries({ queryKey: ["campaign-rating-summary", campaignId] });
      qc.invalidateQueries({ queryKey: ["workers"] });
      toast.success(`${workerName} removed from campaign.`);
      onRemoved();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to remove worker from campaign");
    },
  });

  return (
    <div className="border-t pt-3 mt-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-destructive transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          No longer in campaign universe
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Removes <strong>{workerName}</strong> from this campaign — all unit
            assignments and campaign ratings will be unlinked. The worker record
            itself is kept so they can be re-added if needed.
          </p>

          {/* Employer / worksite update options */}
          {(workerRecord?.employer_id != null || workerRecord?.worksite_id != null) && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Also update employment details?
              </p>

              {workerRecord?.employer_id != null && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={clearEmployer}
                    onCheckedChange={(v) => setClearEmployer(!!v)}
                    className="mt-0.5"
                  />
                  <span className="text-xs leading-snug">
                    Clear employer
                    {employerName ? (
                      <span className="text-muted-foreground"> ({employerName})</span>
                    ) : null}
                    {" "}— set to unknown
                  </span>
                </label>
              )}

              {workerRecord?.worksite_id != null && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={clearWorksite}
                    onCheckedChange={(v) => setClearWorksite(!!v)}
                    className="mt-0.5"
                  />
                  <span className="text-xs leading-snug">
                    Clear worksite
                    {worksiteName ? (
                      <span className="text-muted-foreground"> ({worksiteName})</span>
                    ) : null}
                    {" "}— set to unknown
                  </span>
                </label>
              )}
            </div>
          )}

          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="w-full"
            disabled={removeFromCampaign.isPending}
            onClick={() => removeFromCampaign.mutate()}
          >
            {removeFromCampaign.isPending
              ? "Removing…"
              : "Remove from campaign"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ratings — activity-level rating history for this worker in this campaign.
// ---------------------------------------------------------------------------

function RatingsTab({
  campaignId,
  workerId,
  workerName,
  canWrite,
}: {
  campaignId: string;
  workerId: number;
  workerName: string;
  canWrite: boolean;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [selectedActivityId, setSelectedActivityId] = useState<string>("");
  const [pickerValue, setPickerValue] = useState<{
    rating: number | null;
    binary_value: string | null;
  }>({ rating: null, binary_value: null });
  const [notes, setNotes] = useState("");
  const [taskListDialogOpen, setTaskListDialogOpen] = useState(false);

  const { data: assessments = [] } = useQuery({
    queryKey: ["campaign-activities", campaignId, "assessment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_activities")
        .select("activity_id, title, is_binary, supporter_outcome_value, activity_kind")
        .eq("campaign_id", campaignId)
        .eq("activity_kind", "assessment")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as {
        activity_id: number;
        title: string;
        is_binary: boolean | null;
        supporter_outcome_value: string | null;
        activity_kind: string;
      }[];
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["worker-activity-ratings", campaignId, workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_activity_ratings")
        .select(
          `rating_id, rating, binary_value, notes, rated_at, source,
           activity:campaign_activities(activity_id, title, is_binary, campaign_id)`
        )
        .eq("worker_id", workerId)
        .order("rated_at", { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .map((r) => {
          const aRaw = (r as { activity: unknown }).activity;
          const a = (Array.isArray(aRaw) ? aRaw[0] : aRaw) as
            | { activity_id: number; title: string; is_binary: boolean | null; campaign_id: number }
            | null;
          return { ...(r as Record<string, unknown>), activity: a } as {
            rating_id: number;
            rating: number | null;
            binary_value: string | null;
            notes: string | null;
            rated_at: string;
            source: string | null;
            activity: {
              activity_id: number;
              title: string;
              is_binary: boolean | null;
              campaign_id: number;
            } | null;
          };
        })
        .filter((r) => r.activity?.campaign_id === Number(campaignId));
    },
  });

  const selectedActivity = useMemo(
    () => assessments.find((a) => String(a.activity_id) === selectedActivityId) ?? null,
    [assessments, selectedActivityId]
  );

  const saveRating = useSaveActivityRating({
    campaignId,
    onSuccess: () => {
      toast.success("Rating saved");
      setNotes("");
    },
    onError: (err) => {
      toast.error(`Failed to save rating: ${err.message}`);
    },
  });

  const deleteRating = useAuthAwareMutation<void, Error, number>({
    mutationFn: async (ratingId) => {
      const { error } = await supabase
        .from("campaign_activity_ratings")
        .delete()
        .eq("rating_id", ratingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["worker-activity-ratings", campaignId, workerId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-rating-summary", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-activity-ratings", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-activity-ratings-dist", campaignId] });
      toast.success("Rating removed");
    },
    onError: (err) => {
      toast.error(`Failed to remove rating: ${(err as Error).message}`);
    },
  });

  function loadRowIntoForm(r: (typeof rows)[number]) {
    if (!r.activity) return;
    setSelectedActivityId(String(r.activity.activity_id));
    setPickerValue({ rating: r.rating, binary_value: r.binary_value });
    setNotes(r.notes ?? "");
  }

  return (
    <div className="py-3 space-y-4">
      {canWrite && (
        <div className="flex items-center justify-between rounded border bg-muted/20 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            Build a leader task list with {workerName} as the leader.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTaskListDialogOpen(true)}
          >
            New task list
          </Button>
        </div>
      )}

      {canWrite && (
        <div className="rounded border p-3 space-y-2 bg-muted/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Record rating
          </p>
          {assessments.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No assessments exist for this campaign yet. Use &quot;Add assessment&quot; on the
              wall chart header to create one.
            </p>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Assessment</Label>
                <Select
                  value={selectedActivityId}
                  onValueChange={(v) => {
                    setSelectedActivityId(v);
                    setPickerValue({ rating: null, binary_value: null });
                  }}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Pick an assessment…" />
                  </SelectTrigger>
                  <SelectContent>
                    {assessments.map((a) => (
                      <SelectItem key={a.activity_id} value={String(a.activity_id)}>
                        {a.title}
                        {a.is_binary ? " (binary)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rating</Label>
                <RatingPicker
                  value={pickerValue}
                  onChange={setPickerValue}
                  isBinary={Boolean(selectedActivity?.is_binary)}
                  disabled={!selectedActivity}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="text-xs"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={
                    !selectedActivity ||
                    saveRating.isPending ||
                    (pickerValue.rating == null && pickerValue.binary_value == null)
                  }
                  onClick={() => {
                    if (!selectedActivity) return;
                    if (pickerValue.rating == null && pickerValue.binary_value == null) return;
                    saveRating.mutate({
                      activityId: selectedActivity.activity_id,
                      workerId,
                      rating: pickerValue.rating,
                      binary_value: pickerValue.binary_value,
                      notes,
                    });
                  }}
                >
                  {saveRating.isPending ? "Saving…" : "Save rating"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Rating history
        </p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading ratings…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No activity ratings recorded for this worker yet.
          </p>
        ) : (
          <div className="space-y-1">
            {rows.map((r) => (
              <div
                key={r.rating_id}
                className="rounded border px-2 py-1.5 flex items-center justify-between text-xs"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {r.activity?.title ?? "(untitled activity)"}
                  </p>
                  <p className="text-muted-foreground">
                    {new Date(r.rated_at).toLocaleDateString()} · {r.source ?? "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="tabular-nums font-semibold">
                    {r.rating != null
                      ? r.rating
                      : r.binary_value ?? <span className="text-muted-foreground">—</span>}
                  </div>
                  {canWrite && r.activity && (
                    <button
                      type="button"
                      onClick={() => loadRowIntoForm(r)}
                      className="text-[10px] text-muted-foreground underline hover:text-foreground"
                      title="Load into form to edit"
                    >
                      Edit
                    </button>
                  )}
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => deleteRating.mutate(r.rating_id)}
                      disabled={deleteRating.isPending}
                      className="text-[10px] text-destructive/70 underline hover:text-destructive disabled:opacity-50"
                      title="Remove this rating"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateTaskListDialog
        campaignId={campaignId}
        open={taskListDialogOpen}
        onOpenChange={setTaskListDialogOpen}
        leaderWorkerLock={{ workerId, workerName }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Units — membership in organising units. Primary toggle, remove, add.
// ---------------------------------------------------------------------------

function UnitsTab({
  campaignId,
  workerId,
  ous,
  assignedOuIds,
  primaryOuId,
  canWrite,
  onRequestCopyToUnit,
}: {
  campaignId: string;
  workerId: number;
  ous: WallChartOU[];
  assignedOuIds: number[];
  primaryOuId: number | null;
  canWrite: boolean;
  onRequestCopyToUnit?: (workerId: number) => void;
}) {
  const supabase = createClient();
  const qc = useQueryClient();
  const ouById = useMemo(() => {
    const m = new Map<number, WallChartOU>();
    for (const o of ous) m.set(o.ou_id, o);
    return m;
  }, [ous]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["campaign-worker-ou", campaignId] });
  };

  const setPrimary = useAuthAwareMutation({
    mutationFn: async (ouId: number) => {
      // Clear any existing primary for this worker in this campaign, then set new.
      const campaignOuIds = ous.map((o) => o.ou_id);
      if (campaignOuIds.length === 0) return;
      const { error: clearErr } = await supabase
        .from("campaign_worker_ou")
        .update({ is_primary: false })
        .eq("worker_id", workerId)
        .in("ou_id", campaignOuIds);
      if (clearErr) throw clearErr;
      const { error } = await supabase
        .from("campaign_worker_ou")
        .update({ is_primary: true })
        .eq("worker_id", workerId)
        .eq("ou_id", ouId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeFromUnit = useAuthAwareMutation({
    mutationFn: async (ouId: number) => {
      const { error } = await supabase
        .from("campaign_worker_ou")
        .delete()
        .eq("worker_id", workerId)
        .eq("ou_id", ouId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return (
    <div className="py-3 space-y-2">
      {assignedOuIds.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This worker isn’t assigned to any organising unit in this campaign.
        </p>
      ) : (
        assignedOuIds.map((ouId) => {
          const ou = ouById.get(ouId);
          if (!ou) return null;
          const isPrimary = primaryOuId === ouId;
          return (
            <div
              key={ouId}
              className="rounded border px-2 py-1.5 flex items-center justify-between gap-2 text-xs"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{ouDisplayName(ou)}</p>
                {isPrimary && (
                  <span className="inline-block mt-0.5 text-[10px] uppercase tracking-wide text-primary">
                    Primary
                  </span>
                )}
              </div>
              {canWrite && (
                <div className="flex gap-1">
                  {!isPrimary && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setPrimary.mutate(ouId)}
                    >
                      Make primary
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[11px] text-destructive"
                    onClick={() => removeFromUnit.mutate(ouId)}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </div>
          );
        })
      )}
      {canWrite && onRequestCopyToUnit && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onRequestCopyToUnit(workerId)}
        >
          Add to another unit
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

