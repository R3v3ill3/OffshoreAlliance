"use client";

import { useEffect, useState } from "react";
import {
  useActivityAmbitionLinks,
  useSaveActivityAmbitionLinks,
  type ActivityAmbitionLinkRow,
} from "@/lib/hooks/useCampaignAmbitionContext";
import { useUpdateAmbition, useDeleteAmbition, useCampaignAmbitions } from "@/lib/hooks/useStagePlan";
import { AssessableAmbitionPicker } from "./assessable-ambition-picker";
import { AmbitionCard } from "@/components/campaigns/planning/AmbitionCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

function linkAmbitionLabel(link: ActivityAmbitionLinkRow): string {
  const pa = link.plan_ambition;
  if (!pa) return `Ambition #${link.plan_ambition_id}`;
  const opt = Array.isArray(pa.ambition_options)
    ? pa.ambition_options[0]
    : pa.ambition_options;
  return pa.custom_text?.trim() || opt?.option_text || `Ambition #${pa.ambition_id}`;
}

type AmbitionCardRow = Parameters<typeof AmbitionCard>[0]["ambition"];

function linkToAmbitionRow(link: ActivityAmbitionLinkRow): AmbitionCardRow {
  const pa = link.plan_ambition!;
  const opt = pa.ambition_options;
  return {
    ambition_id: pa.ambition_id,
    plan_id: 0,
    ambition_option_id: null,
    custom_text: pa.custom_text,
    target_value: pa.target_value,
    target_unit: pa.target_unit,
    metric_type: pa.metric_type,
    target_value_max: null,
    target_date: null,
    is_achieved: false,
    achieved_date: null,
    sort_order: 0,
    is_hard_gate: false,
    is_system_default: false,
    ambition_scope: "worker_assessable",
    ambition_options: opt
      ? {
          option_text: opt.option_text ?? "",
          category: "",
          has_variable: null,
          variable_label: null,
          variable_type: null,
        }
      : null,
  } as AmbitionCardRow;
}

export type ActivityAmbitionLinksPanelProps = {
  campaignId: string;
  activityId: number;
  activityTitle: string;
  canWrite: boolean;
};

export function ActivityAmbitionLinksPanel({
  campaignId,
  activityId,
  activityTitle,
  canWrite,
}: ActivityAmbitionLinksPanelProps) {
  const numericCampaignId = Number(campaignId);
  const { data: links = [], isLoading } = useActivityAmbitionLinks(activityId);
  const saveLinks = useSaveActivityAmbitionLinks();
  const updateAmbition = useUpdateAmbition();
  const deleteAmbition = useDeleteAmbition();
  const { data: campaignAmbitionOptions = [] } = useCampaignAmbitions(numericCampaignId);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [syncedActivityId, setSyncedActivityId] = useState<number | null>(null);
  const [editLink, setEditLink] = useState<ActivityAmbitionLinkRow | null>(null);

  useEffect(() => {
    if (syncedActivityId === activityId) return;
    const ids = new Set(links.map((l) => l.plan_ambition_id));
    const primary = links.find((l) => l.is_primary)?.plan_ambition_id ?? null;
    setSelectedIds(ids);
    setPrimaryId(primary ?? (ids.size === 1 ? [...ids][0] : null));
    setSyncedActivityId(activityId);
  }, [activityId, links, syncedActivityId]);

  function persistLinks(nextIds: Set<number>, nextPrimary: number | null) {
    if (!canWrite) return;
    saveLinks.mutate({
      activityId,
      campaignId,
      selectedAmbitionIds: Array.from(nextIds),
      primaryAmbitionId: nextPrimary,
    });
  }

  function handleSelectedIdsChange(ids: Set<number>) {
    setSelectedIds(ids);
    const nextPrimary =
      primaryId != null && ids.has(primaryId)
        ? primaryId
        : ids.size === 1
          ? [...ids][0]
          : ids.size > 0
            ? primaryId
            : null;
    if (nextPrimary !== primaryId) setPrimaryId(nextPrimary);
    persistLinks(ids, nextPrimary);
  }

  function handlePrimaryIdChange(id: number | null) {
    setPrimaryId(id);
    persistLinks(selectedIds, id);
  }

  const editRow = editLink ? linkToAmbitionRow(editLink) : null;
  const editStageNumber = editLink?.plan_ambition?.plan?.stage_number;

  return (
    <div className="rounded-md border p-4 space-y-4">
      <div>
        <h4 className="text-sm font-medium">Ambition links</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          For assessment <span className="font-medium text-foreground">{activityTitle}</span>
        </p>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading links…</p>
      ) : (
        <>
          {links.length > 0 && (
            <ul className="space-y-1 text-xs">
              {links.map((link) => (
                <li key={link.id} className="flex items-center justify-between gap-2">
                  <span>
                    {linkAmbitionLabel(link)}
                    {link.is_primary && (
                      <span className="ml-1 text-[10px] text-primary font-medium">Primary</span>
                    )}
                  </span>
                  {canWrite && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => setEditLink(link)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canWrite ? (
            <AssessableAmbitionPicker
              campaignId={campaignId}
              selectedIds={selectedIds}
              primaryId={primaryId}
              onSelectedIdsChange={handleSelectedIdsChange}
              onPrimaryIdChange={handlePrimaryIdChange}
              allowCreate
            />
          ) : (
            <p className="text-xs text-muted-foreground">You don&apos;t have permission to edit links.</p>
          )}

          {saveLinks.isPending && (
            <p className="text-[11px] text-muted-foreground">Saving links…</p>
          )}
        </>
      )}

      {editRow && editStageNumber != null && (
        <Dialog open={editLink != null} onOpenChange={(open) => !open && setEditLink(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit ambition</DialogTitle>
            </DialogHeader>
            <AmbitionCard
              ambition={editRow}
              stageNumber={editStageNumber}
              campaignAmbitionOptions={campaignAmbitionOptions}
              onPatch={async (ambitionId, patch) => {
                try {
                  await updateAmbition.mutateAsync({
                    ambition_id: ambitionId,
                    campaign_id: numericCampaignId,
                    stage_number: editStageNumber,
                    ...patch,
                  });
                } catch {
                  toast.error("Failed to update ambition");
                }
              }}
              onDelete={async (ambition) => {
                if (ambition.is_system_default) {
                  toast.error("This ambition cannot be removed");
                  return;
                }
                try {
                  await deleteAmbition.mutateAsync({
                    ambition_id: ambition.ambition_id,
                    campaign_id: numericCampaignId,
                    stage_number: editStageNumber,
                  });
                  setEditLink(null);
                  const next = new Set(selectedIds);
                  next.delete(ambition.ambition_id);
                  setSelectedIds(next);
                  persistLinks(next, primaryId === ambition.ambition_id ? null : primaryId);
                } catch {
                  toast.error("Failed to remove ambition");
                }
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
