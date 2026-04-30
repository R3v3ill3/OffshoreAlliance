'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  GitBranch,
  PlusCircle,
  ChevronDown,
} from 'lucide-react'
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
import {
  useDecisionPoints,
  type DecisionPointRow,
  type DecisionScenario,
  type MemberVoteOutcome,
  type DecisionStrengthOutcome,
  type DecisionResolution,
} from '@/hooks/useDecisionPoints'

// ─── Label maps ────────────────────────────────────────────────────────────────

const SCENARIO_LABELS: Record<DecisionScenario, string> = {
  good_offer: 'Good offer received',
  drags_on: 'Bargaining drags on',
  employer_launches_proposal: 'Employer launches proposal',
}

const VOTE_LABELS: Record<MemberVoteOutcome, string> = {
  yes: 'Yes',
  no: 'No',
  not_yet: 'Not yet held',
  n_a: 'N/A',
}

const STRENGTH_LABELS: Record<DecisionStrengthOutcome, string> = {
  strong: 'Strong',
  weak: 'Weak',
  unclear: 'Unclear',
  n_a: 'N/A',
}

const RESOLUTION_LABELS: Record<DecisionResolution, string> = {
  settled: 'Settled',
  route_to_pabo: 'Route to PABO',
  route_to_capacity_building: 'Route to capacity building',
  route_to_ratification: 'Route to ratification',
  pending: 'Pending',
}

// ─── Badges ────────────────────────────────────────────────────────────────────

function ResolutionBadge({ resolution }: { resolution: DecisionResolution | null }) {
  if (!resolution || resolution === 'pending') {
    return (
      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 gap-1">
        <Clock className="h-3 w-3" />
        Pending
      </Badge>
    )
  }
  if (resolution === 'settled' || resolution === 'route_to_ratification') {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        {RESOLUTION_LABELS[resolution]}
      </Badge>
    )
  }
  return (
    <Badge className="bg-blue-100 text-blue-800 border-blue-200 gap-1">
      <GitBranch className="h-3 w-3" />
      {RESOLUTION_LABELS[resolution]}
    </Badge>
  )
}

// ─── Active decision callout ────────────────────────────────────────────────────

function ActiveDecisionCallout({
  decision,
  onResolve,
}: {
  decision: DecisionPointRow
  onResolve: () => void
}) {
  return (
    <Card className="border-yellow-300 bg-yellow-50">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
          <CardTitle className="text-sm font-semibold text-yellow-800">
            Active decision pending
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        <div>
          <p className="text-sm font-medium">
            {decision.scenario ? SCENARIO_LABELS[decision.scenario] : 'Unknown scenario'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Triggered {format(new Date(decision.triggered_at), 'dd MMM yyyy HH:mm')}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {decision.member_vote_outcome && (
            <span>
              <span className="text-muted-foreground">Member vote: </span>
              {VOTE_LABELS[decision.member_vote_outcome]}
            </span>
          )}
          {decision.strength_outcome && (
            <span>
              <span className="text-muted-foreground">Strength: </span>
              {STRENGTH_LABELS[decision.strength_outcome]}
            </span>
          )}
        </div>
        {decision.notes && (
          <p className="text-xs text-muted-foreground border-t pt-2">{decision.notes}</p>
        )}
        <Button size="sm" onClick={onResolve}>
          Resolve decision
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Timeline entry ─────────────────────────────────────────────────────────────

function TimelineEntry({ decision }: { decision: DecisionPointRow }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex gap-3">
      {/* Dot */}
      <div className="flex flex-col items-center pt-1">
        <div
          className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
            decision.resolution === 'pending' ? 'bg-yellow-400' : 'bg-gray-300'
          }`}
        />
        <div className="w-px flex-1 bg-gray-200 mt-1" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium leading-none">
              {decision.scenario ? SCENARIO_LABELS[decision.scenario] : 'Decision'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {format(new Date(decision.triggered_at), 'dd MMM yyyy HH:mm')}
            </p>
          </div>
          <ResolutionBadge resolution={decision.resolution} />
        </div>

        <button
          className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown
            className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          />
          {open ? 'Hide details' : 'Show details'}
        </button>

        {open && (
          <div className="mt-2 space-y-1 text-xs">
            {decision.member_vote_outcome && (
              <div>
                <span className="text-muted-foreground">Member vote: </span>
                {VOTE_LABELS[decision.member_vote_outcome]}
              </div>
            )}
            {decision.strength_outcome && (
              <div>
                <span className="text-muted-foreground">Strength: </span>
                {STRENGTH_LABELS[decision.strength_outcome]}
              </div>
            )}
            {decision.resolution && decision.resolution !== 'pending' && (
              <div>
                <span className="text-muted-foreground">Resolution: </span>
                {RESOLUTION_LABELS[decision.resolution]}
              </div>
            )}
            {decision.resolved_at && (
              <div>
                <span className="text-muted-foreground">Resolved: </span>
                {format(new Date(decision.resolved_at), 'dd MMM yyyy')}
              </div>
            )}
            {decision.notes && (
              <p className="text-muted-foreground italic mt-1">{decision.notes}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── New decision dialog ────────────────────────────────────────────────────────

interface NewDecisionDialogProps {
  campaignId: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

function NewDecisionDialog({ campaignId, open, onOpenChange }: NewDecisionDialogProps) {
  const { createDecisionPoint } = useDecisionPoints(campaignId)

  const [scenario, setScenario] = useState<DecisionScenario | ''>('')
  const [memberVote, setMemberVote] = useState<MemberVoteOutcome | ''>('')
  const [strengthOutcome, setStrengthOutcome] = useState<DecisionStrengthOutcome | ''>('')
  const [notes, setNotes] = useState('')

  function handleClose() {
    setScenario('')
    setMemberVote('')
    setStrengthOutcome('')
    setNotes('')
    onOpenChange(false)
  }

  async function handleSubmit() {
    if (!scenario) {
      toast.error('Please select a scenario.')
      return
    }

    try {
      await createDecisionPoint.mutateAsync({
        campaign_id: campaignId,
        scenario,
        member_vote_outcome: (memberVote as MemberVoteOutcome) || null,
        strength_outcome: (strengthOutcome as DecisionStrengthOutcome) || null,
        resolution: 'pending',
        notes: notes || null,
      })
      toast.success('Decision point logged.')
      handleClose()
    } catch (err) {
      toast.error('Failed to log decision point. Please try again.')
      console.error(err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log decision point</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="scenario">Scenario *</Label>
            <Select
              value={scenario}
              onValueChange={(v) => setScenario(v as DecisionScenario)}
            >
              <SelectTrigger id="scenario">
                <SelectValue placeholder="Select scenario…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="good_offer">Good offer received</SelectItem>
                <SelectItem value="drags_on">Bargaining drags on</SelectItem>
                <SelectItem value="employer_launches_proposal">
                  Employer launches proposal
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vote">Member vote outcome</Label>
            <Select
              value={memberVote}
              onValueChange={(v) => setMemberVote(v as MemberVoteOutcome)}
            >
              <SelectTrigger id="vote">
                <SelectValue placeholder="Select vote outcome…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
                <SelectItem value="not_yet">Not yet held</SelectItem>
                <SelectItem value="n_a">N/A</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="strength">Strength assessment outcome</Label>
            <Select
              value={strengthOutcome}
              onValueChange={(v) => setStrengthOutcome(v as DecisionStrengthOutcome)}
            >
              <SelectTrigger id="strength">
                <SelectValue placeholder="Select strength…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strong">Strong</SelectItem>
                <SelectItem value="weak">Weak</SelectItem>
                <SelectItem value="unclear">Unclear</SelectItem>
                <SelectItem value="n_a">N/A</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Context or additional information…"
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
            disabled={!scenario || createDecisionPoint.isPending}
          >
            {createDecisionPoint.isPending ? 'Saving…' : 'Log decision'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Resolve dialog ─────────────────────────────────────────────────────────────

interface ResolveDialogProps {
  decision: DecisionPointRow
  open: boolean
  onOpenChange: (open: boolean) => void
}

function ResolveDecisionDialog({ decision, open, onOpenChange }: ResolveDialogProps) {
  const { resolveDecisionPoint } = useDecisionPoints(decision.campaign_id)
  const [resolution, setResolution] = useState<Exclude<DecisionResolution, 'pending'> | ''>('')
  const [notes, setNotes] = useState(decision.notes ?? '')

  function handleClose() {
    setResolution('')
    setNotes(decision.notes ?? '')
    onOpenChange(false)
  }

  async function handleSubmit() {
    if (!resolution) {
      toast.error('Please select a resolution.')
      return
    }

    try {
      await resolveDecisionPoint.mutateAsync({
        decision_id: decision.decision_id,
        campaign_id: decision.campaign_id,
        resolution,
        notes: notes || null,
      })
      toast.success('Decision resolved.')
      handleClose()
    } catch (err) {
      toast.error('Failed to resolve decision. Please try again.')
      console.error(err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve decision</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="resolution">Resolution *</Label>
            <Select
              value={resolution}
              onValueChange={(v) =>
                setResolution(v as Exclude<DecisionResolution, 'pending'>)
              }
            >
              <SelectTrigger id="resolution">
                <SelectValue placeholder="Select resolution…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="settled">Settled</SelectItem>
                <SelectItem value="route_to_pabo">Route to PABO</SelectItem>
                <SelectItem value="route_to_capacity_building">
                  Route to capacity building
                </SelectItem>
                <SelectItem value="route_to_ratification">Route to ratification</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="res-notes">Notes</Label>
            <Textarea
              id="res-notes"
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
            disabled={!resolution || resolveDecisionPoint.isPending}
          >
            {resolveDecisionPoint.isPending ? 'Saving…' : 'Resolve'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface DecisionPointTimelineProps {
  campaignId: number
}

export function DecisionPointTimeline({ campaignId }: DecisionPointTimelineProps) {
  const [newOpen, setNewOpen] = useState(false)
  const [resolveTarget, setResolveTarget] = useState<DecisionPointRow | null>(null)

  const { decisionPoints, activeDecision, isLoading, error } =
    useDecisionPoints(campaignId)

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-5 w-48 bg-muted rounded" />
        <div className="h-20 bg-muted rounded" />
      </div>
    )
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">Failed to load decision points.</p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Decision points</h2>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setNewOpen(true)}
        >
          <PlusCircle className="h-3.5 w-3.5" />
          Log decision
        </Button>
      </div>

      {/* Active decision callout */}
      {activeDecision && (
        <ActiveDecisionCallout
          decision={activeDecision}
          onResolve={() => setResolveTarget(activeDecision)}
        />
      )}

      {/* Timeline */}
      {decisionPoints.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No decision points logged yet.
          </CardContent>
        </Card>
      ) : (
        <div className="pl-1">
          {decisionPoints.map((dp) => (
            <TimelineEntry key={dp.decision_id} decision={dp} />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <NewDecisionDialog
        campaignId={campaignId}
        open={newOpen}
        onOpenChange={setNewOpen}
      />
      {resolveTarget && (
        <ResolveDecisionDialog
          decision={resolveTarget}
          open={!!resolveTarget}
          onOpenChange={(open) => {
            if (!open) setResolveTarget(null)
          }}
        />
      )}
    </div>
  )
}
