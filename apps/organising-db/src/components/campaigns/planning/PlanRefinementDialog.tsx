"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/lib/supabase/auth-context"
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlertTriangle } from "lucide-react"
import type { PlanRevisionType } from "@/types/database"

interface PlanRefinementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: number
  stageNumber: number
  /** What kind of edit triggered the prompt — pre-fills revision_type. */
  defaultRevisionType?: PlanRevisionType
  /**
   * Called after the revision note has been saved successfully. The caller
   * should run their own pending change here (e.g. apply a date update).
   */
  onConfirmed: () => void | Promise<void>
}

const REVISION_LABELS: Record<PlanRevisionType, string> = {
  schedule_change: "Stage dates / schedule",
  scope_change: "Scope (employers / worksites / workers)",
  ambition_change: "Ambitions or targets",
  capacity_change: "Capacities",
  management_change: "Management systems",
  where_to_play_change: "Where-to-play",
  theory_change: "Theory of winning",
  other: "Other",
}

const REVISION_ORDER: PlanRevisionType[] = [
  "schedule_change",
  "scope_change",
  "ambition_change",
  "capacity_change",
  "management_change",
  "where_to_play_change",
  "theory_change",
  "other",
]

/**
 * Captures *why* an organiser is editing a stage that's already started.
 * The strategic plan is iterative — dates shift, ambitions evolve as the
 * campaign unfolds — but those changes are easy to lose track of without
 * a written record. This dialog persists a `plan_revision_notes` row,
 * then runs the caller's `onConfirmed` (which is where the actual
 * mutation lives — e.g. applying the new dates).
 */
export function PlanRefinementDialog({
  open,
  onOpenChange,
  campaignId,
  stageNumber,
  defaultRevisionType = "schedule_change",
  onConfirmed,
}: PlanRefinementDialogProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [revisionType, setRevisionType] =
    useState<PlanRevisionType>(defaultRevisionType)
  const [notes, setNotes] = useState("")
  const [triggersDownstream, setTriggersDownstream] = useState(false)

  const recordRevision = useAuthAwareMutation({
    mutationFn: async () => {
      const payload = {
        campaign_id: campaignId,
        stage_number_affected: stageNumber,
        revision_type: revisionType,
        notes,
        triggers_downstream_shift: triggersDownstream,
        revised_by: user?.id ?? null,
      }
      const { error } = await supabase
        .from("plan_revision_notes")
        .insert(payload)
      if (error) throw error
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({
        queryKey: ["plan-revision-notes", campaignId],
      })
      try {
        await onConfirmed()
      } finally {
        onOpenChange(false)
        // Reset for the next time the dialog opens.
        setNotes("")
        setTriggersDownstream(false)
        setRevisionType(defaultRevisionType)
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Refine plan — stage {stageNumber}
          </DialogTitle>
          <DialogDescription>
            This stage is already in progress or completed. Capture what
            you&apos;re changing and why so the plan&apos;s history stays readable. The
            change itself runs once you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>What changed?</Label>
            <Select
              value={revisionType}
              onValueChange={(v) => setRevisionType(v as PlanRevisionType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVISION_ORDER.map((type) => (
                  <SelectItem key={type} value={type}>
                    {REVISION_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Why?</Label>
            <Textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Field intel, employer behaviour, gate outcome, member feedback…"
            />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={triggersDownstream}
              onChange={(e) => setTriggersDownstream(e.target.checked)}
            />
            <span>
              This change shifts subsequent stages.{" "}
              <span className="text-xs text-muted-foreground">
                (Tick if dates after this stage will need reworking.)
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!notes.trim() || recordRevision.isPending}
            onClick={() => recordRevision.mutate()}
          >
            {recordRevision.isPending
              ? "Saving…"
              : "Record &amp; apply change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
