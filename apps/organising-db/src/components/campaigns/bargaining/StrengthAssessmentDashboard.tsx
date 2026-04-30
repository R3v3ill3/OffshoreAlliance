'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { BarChart2, CheckCircle2, AlertCircle, HelpCircle, PlusCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'

import {
  useStrengthAssessment,
  type StrengthOutcome,
  type StrengthAssessmentRow,
} from '@/hooks/useStrengthAssessment'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function OutcomeBadge({ outcome }: { outcome: StrengthOutcome | null }) {
  if (!outcome) return <Badge variant="outline">Not declared</Badge>
  if (outcome === 'strong')
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Strong
      </Badge>
    )
  if (outcome === 'weak')
    return (
      <Badge className="bg-red-100 text-red-800 border-red-200 gap-1">
        <AlertCircle className="h-3 w-3" />
        Weak
      </Badge>
    )
  return (
    <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 gap-1">
      <HelpCircle className="h-3 w-3" />
      Unclear
    </Badge>
  )
}

function RatingDistributionBar({ row }: { row: StrengthAssessmentRow }) {
  const eligible = row.eligible_count ?? 0
  if (eligible === 0) return null

  const pct = (n: number | null) =>
    eligible > 0 ? Math.round(((n ?? 0) / eligible) * 100) : 0

  const segments = [
    { label: 'Supportive leaders', value: row.supportive_leader_count, color: 'bg-green-600' },
    { label: 'Supporters', value: row.supporter_count, color: 'bg-green-400' },
    { label: 'Neutral', value: row.neutral_count, color: 'bg-yellow-300' },
    { label: 'Opposed', value: row.opposed_count, color: 'bg-red-400' },
    { label: 'Oppositional', value: row.oppositional_count, color: 'bg-red-600' },
    { label: 'Unassessed', value: row.unassessed_count, color: 'bg-gray-200' },
  ]

  return (
    <div className="space-y-1">
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {segments.map((s) => {
          const width = pct(s.value)
          if (width === 0) return null
          return (
            <div
              key={s.label}
              className={s.color}
              style={{ width: `${width}%` }}
              title={`${s.label}: ${s.value ?? 0} (${width}%)`}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {segments.map((s) => (
          <span key={s.label}>
            <span className={`inline-block w-2 h-2 rounded-full mr-1 ${s.color}`} />
            {s.label}: {s.value ?? 0}
          </span>
        ))}
      </div>
    </div>
  )
}

function LatestSnapshotCard({ assessment }: { assessment: StrengthAssessmentRow }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Latest snapshot
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {format(new Date(assessment.assessed_at), 'dd MMM yyyy HH:mm')}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Outcome:</span>
          <OutcomeBadge outcome={assessment.outcome} />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div>
            <span className="text-muted-foreground">Eligible: </span>
            <span className="font-medium">{assessment.eligible_count ?? '—'}</span>
          </div>
          {assessment.percent_strike_ready != null && (
            <div>
              <span className="text-muted-foreground">Strike ready: </span>
              <span className="font-medium">{assessment.percent_strike_ready}%</span>
            </div>
          )}
          {assessment.percent_paid_membership != null && (
            <div>
              <span className="text-muted-foreground">Paid membership: </span>
              <span className="font-medium">{assessment.percent_paid_membership}%</span>
            </div>
          )}
        </div>

        <RatingDistributionBar row={assessment} />

        {assessment.notes && (
          <p className="text-sm text-muted-foreground border-t pt-2">{assessment.notes}</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Capture Dialog ────────────────────────────────────────────────────────────

interface CaptureDialogProps {
  campaignId: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

function CaptureSnapshotDialog({ campaignId, open, onOpenChange }: CaptureDialogProps) {
  const { inputs, createSnapshot } = useStrengthAssessment(campaignId)

  const [outcome, setOutcome] = useState<StrengthOutcome | ''>('')
  const [notes, setNotes] = useState('')
  const [percentStrikeReady, setPercentStrikeReady] = useState('')
  const [percentPaidMembership, setPercentPaidMembership] = useState('')

  function handleClose() {
    setOutcome('')
    setNotes('')
    setPercentStrikeReady('')
    setPercentPaidMembership('')
    onOpenChange(false)
  }

  async function handleSubmit() {
    if (!outcome) {
      toast.error('Please select an outcome before capturing.')
      return
    }

    try {
      await createSnapshot.mutateAsync({
        campaign_id: campaignId,
        // Pre-populate counts from the live view
        eligible_count: inputs?.eligible_count ?? null,
        supportive_leader_count: inputs?.supportive_leader_count ?? null,
        supporter_count: inputs?.supporter_count ?? null,
        neutral_count: inputs?.neutral_count ?? null,
        opposed_count: inputs?.opposed_count ?? null,
        oppositional_count: inputs?.oppositional_count ?? null,
        unassessed_count: inputs?.unassessed_count ?? null,
        percent_strike_ready: percentStrikeReady ? parseFloat(percentStrikeReady) : null,
        percent_paid_membership: percentPaidMembership
          ? parseFloat(percentPaidMembership)
          : null,
        notes: notes || null,
        outcome,
      })
      toast.success('Strength snapshot captured.')
      handleClose()
    } catch (err) {
      toast.error('Failed to capture snapshot. Please try again.')
      console.error(err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Capture strength snapshot</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Live inputs preview */}
          {inputs && (
            <Card className="bg-muted/40 border-dashed">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Current worker rating counts (auto-filled)
                </p>
                <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
                  <div>
                    <span className="text-muted-foreground">Eligible: </span>
                    {inputs.eligible_count ?? '—'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Supportive: </span>
                    {(inputs.supportive_leader_count ?? 0) + (inputs.supporter_count ?? 0)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Unassessed: </span>
                    {inputs.unassessed_count ?? '—'}
                  </div>
                </div>
                {inputs.overall_supportive_pct != null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Overall supportive (ambitions): {inputs.overall_supportive_pct}%
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Outcome */}
          <div className="space-y-1.5">
            <Label htmlFor="outcome">Strength outcome *</Label>
            <Select
              value={outcome}
              onValueChange={(v) => setOutcome(v as StrengthOutcome)}
            >
              <SelectTrigger id="outcome">
                <SelectValue placeholder="Select outcome…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strong">Strong</SelectItem>
                <SelectItem value="weak">Weak</SelectItem>
                <SelectItem value="unclear">Unclear</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Optional percentages */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="psr">% strike ready</Label>
              <Input
                id="psr"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="e.g. 72.5"
                value={percentStrikeReady}
                onChange={(e) => setPercentStrikeReady(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ppm">% paid membership</Label>
              <Input
                id="ppm"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="e.g. 65.0"
                value={percentPaidMembership}
                onChange={(e) => setPercentPaidMembership(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Organiser notes on strength rationale…"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!outcome || createSnapshot.isPending}
          >
            {createSnapshot.isPending ? 'Saving…' : 'Capture snapshot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface StrengthAssessmentDashboardProps {
  campaignId: number
}

export function StrengthAssessmentDashboard({ campaignId }: StrengthAssessmentDashboardProps) {
  const [captureOpen, setCaptureOpen] = useState(false)
  const { assessments, latestAssessment, isLoading, error } = useStrengthAssessment(campaignId)

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-5 w-48 bg-muted rounded" />
        <div className="h-28 bg-muted rounded" />
      </div>
    )
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load strength assessments.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Bargaining strength</h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setCaptureOpen(true)}
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Capture snapshot
        </Button>
      </div>

      {/* Latest snapshot */}
      {latestAssessment ? (
        <LatestSnapshotCard assessment={latestAssessment} />
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No strength snapshots yet. Capture the first one when bargaining opens.
          </CardContent>
        </Card>
      )}

      {/* History */}
      {assessments.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            History ({assessments.length} snapshots)
          </p>
          <div className="space-y-2">
            {assessments.slice(1).map((a) => (
              <Card key={a.assessment_id} className="border-muted">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <OutcomeBadge outcome={a.outcome} />
                      {a.eligible_count != null && (
                        <span className="text-xs text-muted-foreground">
                          {a.eligible_count} eligible
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(a.assessed_at), 'dd MMM yyyy')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Capture dialog */}
      <CaptureSnapshotDialog
        campaignId={campaignId}
        open={captureOpen}
        onOpenChange={setCaptureOpen}
      />
    </div>
  )
}
