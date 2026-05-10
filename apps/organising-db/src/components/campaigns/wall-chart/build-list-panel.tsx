"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ListPlus,
  Mail,
  Phone as PhoneIcon,
  ListChecks,
  ChevronDown,
  Loader2,
  X,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";
import {
  DND_MIME_TYPE,
  DND_UNIT_MIME_TYPE,
  parseDragPayload,
  parseUnitDragPayload,
} from "./dnd";
import { BuildListItemRow } from "./build-list-item-row";
import { BuildListLeaderSlot } from "./build-list-leader-slot";
import {
  useBuildList,
  type BuildListPurpose,
  type BuildListItem,
  type FiredTaskDraft,
} from "./use-build-list";

const PURPOSE_OPTIONS: { value: BuildListPurpose; label: string; Icon: typeof Mail }[] = [
  { value: "email", label: "Email", Icon: Mail },
  { value: "phone", label: "Phone", Icon: PhoneIcon },
  { value: "task", label: "Activist task", Icon: ListChecks },
];

export type BuildListPanelProps = {
  campaignId: string;
  canWrite: boolean;
  open: boolean;
  onClose: () => void;
  /**
   * When provided, the panel uses this hook instance instead of creating its
   * own. Lets external code (e.g. the wall-chart selection bar) share the
   * same active list and trigger adds.
   */
  controller?: ReturnType<typeof useBuildList>;
  /**
   * Called after firing a task list. The wall chart implements this to open
   * the existing CreateTaskListDialog with the hydrated draft.
   */
  onTaskDraftCreated?: (draft: FiredTaskDraft) => void;
  /**
   * Sticky-top offset in pixels for the panel. Lets the parent push the
   * panel down so its top sits just below any sticky element above it
   * (e.g. the campaign summary header). Defaults to 8px.
   */
  stickyTopPx?: number;
};

export function BuildListPanel({
  campaignId,
  canWrite,
  open,
  onClose,
  controller,
  onTaskDraftCreated,
  stickyTopPx = 8,
}: BuildListPanelProps) {
  const router = useRouter();
  const ownController = useBuildList({ campaignId });
  const buildList = controller ?? ownController;
  const list = buildList.detail.data ?? null;

  // Local-only edits to the list metadata. Saved on blur / via Save button.
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState<BuildListPurpose | "">("");
  const [organiserPick, setOrganiserPick] = useState("");
  // Drag-state inside the items list (for reorder).
  const reorderDraggedId = useRef<number | null>(null);

  // Sync local fields when the active list changes / refetches.
  useEffect(() => {
    if (list) {
      setName(list.name);
      setPurpose(list.default_purpose ?? "");
      // organiserPick can't be re-derived from organiser_id alone (CampaignOrganiserSelect uses user-uuid keys); leave for re-confirm.
    } else {
      setName("");
      setPurpose("");
      setOrganiserPick("");
    }
  }, [list?.list_id, list?.name, list?.default_purpose]);

  const items = list?.items ?? [];
  const itemCount = items.length;
  const withEmail = items.filter((i) => Boolean(i.worker?.email?.trim())).length;
  const withPhone = items.filter((i) => Boolean(i.worker?.phone?.trim())).length;

  const isCreating = buildList.createList.isPending;
  const isMutating =
    isCreating ||
    buildList.addItems.isPending ||
    buildList.removeItems.isPending ||
    buildList.updateMeta.isPending ||
    buildList.fire.isPending;

  // Handle drops on the panel: a worker payload (one or many) or a whole-unit payload.
  // If no list exists yet, auto-create one using current name/purpose, then add the items.
  const onPanelDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!canWrite) return;

    const workerRaw = e.dataTransfer.getData(DND_MIME_TYPE);
    const unitRaw = e.dataTransfer.getData(DND_UNIT_MIME_TYPE);
    let workerIds: number[] = [];
    let sourceOuId: number | null = null;

    if (unitRaw) {
      const unitPayload = parseUnitDragPayload(unitRaw);
      if (unitPayload) {
        workerIds = unitPayload.workerIds;
        sourceOuId = unitPayload.ouId;
      }
    } else if (workerRaw) {
      const payload = parseDragPayload(workerRaw);
      if (payload) {
        workerIds = payload.refs.map((r) => r.workerId);
        // If all refs share a fromOuId, use it; else null (mixed source).
        const ouSet = new Set(payload.refs.map((r) => r.fromOuId));
        sourceOuId = ouSet.size === 1 ? [...ouSet][0] : null;
      }
    }

    if (workerIds.length === 0) return;

    let targetListId = list?.list_id ?? null;
    if (targetListId == null) {
      const created = await buildList.createList.mutateAsync({
        name: name.trim() || "Untitled list",
        default_purpose: purpose || null,
      });
      targetListId = created.list_id;
    }

    await buildList.addItems.mutateAsync({
      listId: targetListId,
      workerIds,
      sourceOuId,
    });
  };

  const handleNameBlur = () => {
    if (!list) return;
    if (name.trim() && name.trim() !== list.name) {
      buildList.updateMeta.mutate({ listId: list.list_id, name: name.trim() });
    }
  };

  const handlePurposeChange = (next: string) => {
    const valid: BuildListPurpose[] = ["email", "phone", "task"];
    const v = valid.includes(next as BuildListPurpose) ? (next as BuildListPurpose) : null;
    setPurpose(v ?? "");
    if (list) {
      buildList.updateMeta.mutate({ listId: list.list_id, default_purpose: v });
    }
  };

  const handleRemoveItem = (workerId: number) => {
    if (!list) return;
    buildList.removeItems.mutate({ listId: list.list_id, workerIds: [workerId] });
  };

  const handleSetWorkerLeader = async (workerId: number) => {
    if (!list) return;
    await buildList.updateMeta.mutateAsync({
      listId: list.list_id,
      leader_worker_id: workerId,
      leader_organiser_id: null,
    });
    setOrganiserPick("");
  };

  const handleClearWorkerLeader = () => {
    if (!list) return;
    buildList.updateMeta.mutate({
      listId: list.list_id,
      leader_worker_id: null,
    });
  };

  // Reorder via row-level drag handle (using same MIME, but identified by being already in the list).
  const onRowDragStart = (workerId: number, e: React.DragEvent<HTMLDivElement>) => {
    reorderDraggedId.current = workerId;
    e.dataTransfer.effectAllowed = "move";
    // Set a low-fidelity drag image; the row itself is the drag image by default.
  };

  const onRowDragOver = (_workerId: number, e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.dropEffect = "move";
  };

  const onRowDrop = (overWorkerId: number) => {
    const dragged = reorderDraggedId.current;
    reorderDraggedId.current = null;
    if (!list || dragged == null || dragged === overWorkerId) return;
    const ids = items.map((i) => i.worker_id);
    const fromIdx = ids.indexOf(dragged);
    const toIdx = ids.indexOf(overWorkerId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...ids];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, dragged);
    buildList.reorderItems.mutate({ listId: list.list_id, orderedWorkerIds: next });
  };

  const onFire = async (pathway: BuildListPurpose) => {
    if (!list) return;
    if (items.length === 0) return;
    try {
      const result = await buildList.fire.mutateAsync({
        listId: list.list_id,
        pathway,
        leaderOrganiserPickerValue:
          pathway === "task" ? organiserPick || null : null,
      });
      if (pathway === "task" && result.draft && onTaskDraftCreated) {
        onTaskDraftCreated(result.draft);
        // Clear the active list — it's fired now and shouldn't keep
        // appearing as the build target. Picker filters to draft anyway.
        buildList.open(null);
        return;
      }
      if (result.redirect_to) router.push(result.redirect_to);
    } catch (err) {
      console.error("Fire failed", err);
    }
  };

  if (!open) return null;

  const missingContactKind: "email" | "phone" | null =
    purpose === "email" ? "email" : purpose === "phone" ? "phone" : null;

  return (
    <aside
      role="region"
      aria-label="Build list panel"
      // top + max-height are driven by the parent so the panel docks
      // immediately below the sticky campaign summary instead of
      // disappearing behind it. The 16px gap = stickyTop padding (8px
      // requested by parent) + 8px breathing room at the bottom.
      style={{
        top: `${stickyTopPx}px`,
        maxHeight: `calc(100vh - ${stickyTopPx + 16}px)`,
      }}
      className={cn(
        "sticky w-full md:w-[360px] lg:w-[400px]",
        "rounded border bg-card shadow-sm flex flex-col print:hidden"
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-1.5">
          <ListPlus className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Build list</h3>
          {isMutating && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-1">
          <ListPicker buildList={buildList} disabled={!canWrite} />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={onClose}
            aria-label="Close build list panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="space-y-3 px-3 py-3 overflow-y-auto flex-1">
        <div className="space-y-1.5">
          <Label htmlFor="build-list-name" className="text-xs">
            List name
          </Label>
          <Input
            id="build-list-name"
            value={name}
            placeholder="e.g. EBA voting push — Day shift"
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
            disabled={!canWrite || isCreating}
            className="h-8 text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Purpose</Label>
          <Select value={purpose} onValueChange={handlePurposeChange} disabled={!canWrite}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Choose later" />
            </SelectTrigger>
            <SelectContent>
              {PURPOSE_OPTIONS.map(({ value, label, Icon }) => (
                <SelectItem key={value} value={value}>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            Drives early warnings (missing email/phone) and shows a leader slot for tasks.
            Not enforced — you can fire the list into any pathway.
          </p>
        </div>

        {purpose === "task" && list && (
          <BuildListLeaderSlot
            workerLeader={
              list.leader_worker
                ? {
                    worker_id: list.leader_worker.worker_id,
                    first_name: list.leader_worker.first_name,
                    last_name: list.leader_worker.last_name,
                  }
                : null
            }
            organiserPickerValue={organiserPick}
            onOrganiserPickerChange={async (next) => {
              setOrganiserPick(next);
              // The organiser picker emits "user:<uuid>"; we need to resolve to organiser_id.
              // Server route will handle resolution when firing into task pathway. For now
              // we just store the picker value locally; we'll resolve on fire.
            }}
            onAcceptWorker={handleSetWorkerLeader}
            onClearWorkerLeader={handleClearWorkerLeader}
            disabled={!canWrite}
          />
        )}

        <DropZone canWrite={canWrite} hasItems={items.length > 0} onDrop={onPanelDrop} />

        {items.length > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
              <span>{itemCount} worker{itemCount === 1 ? "" : "s"}</span>
              <span>
                {withEmail} email · {withPhone} phone
              </span>
            </div>
            <ul className="space-y-1">
              {items.map((item: BuildListItem) => {
                const flagged: "email" | "phone" | null =
                  missingContactKind === "email" && !item.worker?.email
                    ? "email"
                    : missingContactKind === "phone" && !item.worker?.phone
                      ? "phone"
                      : null;
                return (
                  <li key={item.id}>
                    <BuildListItemRow
                      item={item}
                      missingContact={flagged}
                      // Negative ids are optimistic placeholders that haven't
                      // been confirmed by the server yet — the row shows a
                      // small saving spinner in place of the drag handle.
                      pending={item.id < 0}
                      onRemove={canWrite ? handleRemoveItem : undefined}
                      onDragStart={onRowDragStart}
                      onDragOver={onRowDragOver}
                      onDrop={onRowDrop}
                      onDragEnd={() => {
                        reorderDraggedId.current = null;
                      }}
                      rightAction={
                        purpose === "task" && canWrite ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-1.5 text-[10px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSetWorkerLeader(item.worker_id);
                            }}
                            title="Make this worker the task leader"
                          >
                            Leader
                          </Button>
                        ) : null
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic px-1">
            {canWrite
              ? "Drag worker tiles or unit-card handles into the box above to start. Hold Shift and click tiles to multi-select first, then drag any selected tile to add the whole batch."
              : "You don't have permission to build lists for this campaign."}
          </p>
        )}
      </div>

      <footer className="border-t px-3 py-2">
        <FireBar
          purpose={purpose}
          listEmpty={items.length === 0 || !list}
          firing={buildList.fire.isPending}
          onFire={onFire}
          canWrite={canWrite}
        />
      </footer>
    </aside>
  );
}

function DropZone({
  canWrite,
  hasItems,
  onDrop,
}: {
  canWrite: boolean;
  hasItems: boolean;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
}) {
  const [over, setOver] = useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canWrite) return;
    if (
      !e.dataTransfer.types.includes(DND_MIME_TYPE) &&
      !e.dataTransfer.types.includes(DND_UNIT_MIME_TYPE)
    ) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!over) setOver(true);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        onDrop(e);
      }}
      className={cn(
        "rounded border-2 border-dashed p-3 text-center text-xs transition-colors",
        over
          ? "border-primary bg-primary/10 text-primary"
          : "border-muted-foreground/30 bg-muted/30 text-muted-foreground"
      )}
      aria-label="Drop zone — drop worker tiles or unit cards to add to the list"
    >
      {over
        ? "Drop to add to list"
        : hasItems
          ? "Drop more workers or whole units here"
          : "Drop worker tiles, unit cards, or a multi-selection here"}
    </div>
  );
}

function FireBar({
  purpose,
  listEmpty,
  firing,
  onFire,
  canWrite,
}: {
  purpose: BuildListPurpose | "";
  listEmpty: boolean;
  firing: boolean;
  onFire: (p: BuildListPurpose) => void;
  canWrite: boolean;
}) {
  const disabled = !canWrite || listEmpty || firing;
  if (purpose) {
    const Icon =
      purpose === "email" ? Mail : purpose === "phone" ? PhoneIcon : ListChecks;
    return (
      <div className="flex items-center justify-end">
        <Button
          type="button"
          size="sm"
          className="h-8 text-xs"
          onClick={() => onFire(purpose)}
          disabled={disabled}
        >
          {firing ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Icon className="h-3.5 w-3.5 mr-1.5" />
          )}
          Continue to {purpose === "task" ? "task wizard" : `${purpose} pathway`}
          <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {PURPOSE_OPTIONS.map(({ value, label, Icon }) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() => onFire(value)}
          disabled={disabled}
        >
          <Icon className="h-3.5 w-3.5 mr-1" />
          {label}
        </Button>
      ))}
    </div>
  );
}

function ListPicker({
  buildList,
  disabled,
}: {
  buildList: ReturnType<typeof useBuildList>;
  disabled: boolean;
}) {
  const lists = buildList.lists.data ?? [];
  if (lists.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-1.5 text-[11px]"
          disabled={disabled}
          title="Open a saved draft list"
        >
          Lists <ChevronDown className="ml-0.5 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onClick={() => buildList.open(null)}>
          <span className="text-xs">+ New list</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {lists.slice(0, 12).map((l) => (
          <DropdownMenuItem
            key={l.list_id}
            onClick={() => buildList.open(l.list_id)}
            className="flex flex-col items-start gap-0.5"
          >
            <span className="text-xs font-medium truncate w-full">{l.name}</span>
            <span className="text-[10px] text-muted-foreground">
              {l.default_purpose ?? "no purpose"} ·{" "}
              {l.items_count?.[0]?.count ?? 0} workers ·{" "}
              {new Date(l.updated_at).toLocaleDateString()}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
