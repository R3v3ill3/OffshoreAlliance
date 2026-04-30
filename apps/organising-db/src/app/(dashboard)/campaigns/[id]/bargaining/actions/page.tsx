'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useCampaign } from '@/lib/hooks/usePlannerCampaigns'
import { PiaActionLadder } from '@/components/campaigns/bargaining/PiaActionLadder'
import { PiaParticipationDashboard } from '@/components/campaigns/bargaining/PiaParticipationDashboard'
import { usePiaActions } from '@/hooks/usePiaActions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronRight, Zap, Plus } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

const ACTION_TYPES = [
  { value: 'work_to_rule', label: 'Work to Rule' },
  { value: 'overtime_ban', label: 'Overtime Ban' },
  { value: 'stopwork', label: 'Stop Work' },
  { value: 'strike', label: 'Strike' },
  { value: 'picket', label: 'Picket' },
  { value: 'other', label: 'Other' },
]

const ESCALATION_LEVELS = [
  { value: '1', label: '1 — Awareness' },
  { value: '2', label: '2 — Disruption' },
  { value: '3', label: '3 — Escalation' },
  { value: '4', label: '4 — Maximum Pressure' },
]

export default function BargainingActionsPage({ params }: PageProps) {
  const { id } = use(params)
  const campaignId = parseInt(id)

  const { data: campaign, isLoading: campaignLoading } = useCampaign(campaignId)
  const { data: piaActions, isLoading: actionsLoading } = usePiaActions(campaignId)
  const [newDialogOpen, setNewDialogOpen] = useState(false)

  // New PIA action form state
  const [actionType, setActionType] = useState('stopwork')
  const [escalationLevel, setEscalationLevel] = useState('2')
  const [noticeGivenAt, setNoticeGivenAt] = useState('')
  const [actionStartsAt, setActionStartsAt] = useState('')
  const [notes, setNotes] = useState('')

  function resetForm() {
    setActionType('stopwork')
    setEscalationLevel('2')
    setNoticeGivenAt('')
    setActionStartsAt('')
    setNotes('')
  }

  const hasActions = Array.isArray(piaActions) && piaActions.length > 0

  if (campaignLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-64" />
          <div className="h-64 bg-slate-200 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/campaigns" className="hover:text-foreground">Campaigns</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/campaigns/${campaignId}`} className="hover:text-foreground">
          {campaign?.name ?? 'Campaign'}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/campaigns/${campaignId}/bargaining`} className="hover:text-foreground">
          Bargaining
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span>PIA Actions</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-slate-500" />
          <h1 className="text-2xl font-bold text-slate-900">PIA Actions</h1>
        </div>
        <Button onClick={() => setNewDialogOpen(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New PIA action
        </Button>
      </div>

      {actionsLoading && (
        <div className="animate-pulse space-y-3">
          <div className="h-48 bg-slate-200 rounded" />
          <div className="h-48 bg-slate-200 rounded" />
        </div>
      )}

      {!actionsLoading && !hasActions && (
        /* Empty state */
        <div className="border rounded-lg p-10 text-center bg-slate-50">
          <Zap className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No PIA actions yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Actions become available once a PABO is granted. Once authorised, log each action
            here to track the escalation ladder and member participation.
          </p>
          <div className="flex justify-center gap-3 mt-4">
            <Button asChild variant="outline" size="sm">
              <Link href={`/campaigns/${campaignId}/bargaining/pabo`}>
                View PABO
              </Link>
            </Button>
            <Button size="sm" onClick={() => setNewDialogOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              New PIA action
            </Button>
          </div>
        </div>
      )}

      {!actionsLoading && hasActions && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-800">Action Ladder</h2>
            <PiaActionLadder campaignId={campaignId} />
          </div>
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-800">Participation</h2>
            <PiaParticipationDashboard campaignId={campaignId} />
          </div>
        </div>
      )}

      {/* New PIA action dialog */}
      <Dialog open={newDialogOpen} onOpenChange={(o) => { setNewDialogOpen(o); if (!o) resetForm() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New PIA Action</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Action Type</Label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Escalation Level</Label>
              <Select value={escalationLevel} onValueChange={setEscalationLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESCALATION_LEVELS.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notice Given At (optional)</Label>
              <Input
                type="datetime-local"
                value={noticeGivenAt}
                onChange={(e) => setNoticeGivenAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Action Starts At (optional)</Label>
              <Input
                type="datetime-local"
                value={actionStartsAt}
                onChange={(e) => setActionStartsAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any relevant notes about this action..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                // Creation wired up via usePiaActions mutation from Wave 4
                setNewDialogOpen(false)
                resetForm()
              }}
            >
              Create Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
