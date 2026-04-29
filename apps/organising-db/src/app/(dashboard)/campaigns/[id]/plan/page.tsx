'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  useCampaign,
  useUpdateCampaignOrganiser,
  useCampaignOrganisers,
  useAddCampaignOrganiser,
  useUpdateCampaignTeamMember,
  useRemoveCampaignOrganiser,
} from '@/lib/hooks/usePlannerCampaigns'
import { useLeadOrganisers, useAllOrganisers } from '@/lib/hooks/usePlannerOptions'
import { CampaignStageDatesEditor } from '@/components/campaigns/planning/CampaignStageDatesEditor'
import { useAllGates, useCampaignAmbitionsByStage } from '@/lib/hooks/useGateAssessment'
import { evaluateAmbitions } from '@/lib/utils/ambition-gate-logic'
import { CampaignTimeline } from '@/components/campaigns/planning/CampaignTimeline'
import { StageTimelineGantt } from '@/components/campaigns/planning/StageTimelineGantt'
import { CampaignRevisionHistory } from '@/components/campaigns/planning/CampaignRevisionHistory'
import { SituationAnalysisCard } from '@/components/campaigns/planning/SituationAnalysisCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { STAGE_NAMES } from '@/types/planner-types'
import { cn } from '@/lib/utils/cn'
import { ChevronRight, Shield, CheckCircle, Pencil, X, Check, UserPlus, Trash2, Users } from 'lucide-react'

const CAMPAIGN_ROLE_LABELS: Record<string, string> = {
  lead: 'Lead',
  organiser: 'Organiser',
  coordinator: 'Coordinator',
  industrial_officer: 'Industrial Officer',
  specialist: 'Specialist',
}

const CAMPAIGN_ROLES = Object.entries(CAMPAIGN_ROLE_LABELS)

interface PageProps {
  params: Promise<{ id: string }>
}

export default function CampaignPlanPage({ params }: PageProps) {
  const { id } = use(params)
  const campaignId = parseInt(id)

  const { data: campaign, isLoading } = useCampaign(campaignId)
  const { data: gates } = useAllGates(campaignId)
  const { data: ambitionsByStage } = useCampaignAmbitionsByStage(campaignId)
  const { data: leadOrganisers } = useLeadOrganisers()
  const { data: allOrganisers } = useAllOrganisers()
  const { data: teamMembers } = useCampaignOrganisers(campaignId)
  const updateOrganiser = useUpdateCampaignOrganiser()
  const addTeamMember = useAddCampaignOrganiser()
  const updateTeamMember = useUpdateCampaignTeamMember()
  const removeTeamMember = useRemoveCampaignOrganiser()

  const [editingOrganiser, setEditingOrganiser] = useState(false)
  const [pendingOrganiserId, setPendingOrganiserId] = useState<number | undefined>()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addOrganiserId, setAddOrganiserId] = useState('')
  const [addRole, setAddRole] = useState('organiser')
  const [addReportsTo, setAddReportsTo] = useState('')
  const [editMemberId, setEditMemberId] = useState<number | null>(null)
  const [editRole, setEditRole] = useState('organiser')
  const [editReportsTo, setEditReportsTo] = useState('')

  function openEditMember(member: { id: number; campaign_role: string; reports_to_organiser: { organiser_id: number } | null }) {
    setEditMemberId(member.id)
    setEditRole(member.campaign_role)
    setEditReportsTo(member.reports_to_organiser?.organiser_id.toString() ?? '')
  }

  function resetAddDialog() {
    setAddOrganiserId('')
    setAddRole('organiser')
    setAddReportsTo('')
  }

  async function handleAddMember() {
    if (!addOrganiserId) return
    try {
      await addTeamMember.mutateAsync({
        campaign_id: campaignId,
        organiser_id: parseInt(addOrganiserId, 10),
        campaign_role: addRole,
        reports_to_organiser_id: addReportsTo ? parseInt(addReportsTo, 10) : null,
      })
      toast.success('Team member added')
      setAddDialogOpen(false)
      resetAddDialog()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add team member')
    }
  }

  async function handleUpdateMember() {
    if (!editMemberId) return
    try {
      await updateTeamMember.mutateAsync({
        campaign_id: campaignId,
        id: editMemberId,
        campaign_role: editRole,
        reports_to_organiser_id: editReportsTo ? parseInt(editReportsTo, 10) : null,
      })
      toast.success('Team member updated')
      setEditMemberId(null)
    } catch {
      toast.error('Failed to update team member')
    }
  }

  async function handleRemoveMember(rowId: number, name: string) {
    if (!confirm(`Remove ${name} from this campaign team?`)) return
    try {
      await removeTeamMember.mutateAsync({ campaign_id: campaignId, row_id: rowId })
      toast.success('Team member removed')
    } catch {
      toast.error('Failed to remove team member')
    }
  }

  const teamOrganiserIds = new Set(teamMembers?.map((m) => m.organiser?.organiser_id) ?? [])

  const gatesForTimeline = (gates || []).map((g: Record<string, unknown>) => {
    const gn = g.gate_number as number
    const rows = ambitionsByStage?.[gn]
    return {
      ...g,
      ambitionEvaluation:
        rows && rows.length > 0 ? evaluateAmbitions(rows as Parameters<typeof evaluateAmbitions>[0]) : undefined,
    }
  })

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4 max-w-4xl mx-auto">
          <div className="h-8 bg-slate-200 rounded w-64" />
          <div className="h-48 bg-slate-200 rounded" />
          <div className="grid grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-200 rounded" />)}
          </div>
        </div>
      </div>
    )
  }

  if (!campaign) {
    return <div className="p-6 text-center text-slate-500">Campaign not found</div>
  }

  const timeline = (campaign as any).campaign_timelines
  const stagePlans = (campaign as any).campaign_stage_plans || []
  const sortedStages = [...stagePlans].sort((a: { stage_number: number }, b: { stage_number: number }) => a.stage_number - b.stage_number)

  const activeStage = sortedStages.find((s: { status: string }) => s.status === 'active')
  const completedStages = sortedStages.filter((s: { status: string }) => s.status === 'completed').length

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/campaigns" className="hover:text-foreground">Campaigns</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/campaigns/${campaignId}`} className="hover:text-foreground">{campaign.name}</Link>
        <ChevronRight className="h-3 w-3" />
        <span>Campaign Plan</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{campaign.name}</h1>
          {campaign.description && (
            <p className="text-muted-foreground mt-1">{campaign.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge
              className={cn(
                campaign.status === 'active' ? 'bg-blue-100 text-blue-700' :
                campaign.status === 'completed' ? 'bg-green-100 text-green-700' :
                'bg-slate-100 text-slate-600'
              )}
              variant="secondary"
            >
              {campaign.status}
            </Badge>

            {editingOrganiser ? (
              <div className="flex items-center gap-2">
                <Select
                  value={pendingOrganiserId?.toString() ?? (campaign as any).organiser_id?.toString() ?? ''}
                  onValueChange={(v) => setPendingOrganiserId(parseInt(v))}
                >
                  <SelectTrigger className="h-7 text-sm w-48">
                    <SelectValue placeholder="Select organiser..." />
                  </SelectTrigger>
                  <SelectContent>
                    {leadOrganisers?.map((o) => (
                      <SelectItem key={o.organiser_id} value={o.organiser_id.toString()}>
                        {o.organiser_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                  disabled={updateOrganiser.isPending}
                  onClick={async () => {
                    const oid = pendingOrganiserId ?? (campaign as any).organiser_id
                    if (!oid) return
                    try {
                      await updateOrganiser.mutateAsync({ campaign_id: campaignId, organiser_id: oid })
                      toast.success('Organiser updated')
                      setEditingOrganiser(false)
                      setPendingOrganiserId(undefined)
                    } catch {
                      toast.error('Failed to update organiser')
                    }
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-slate-500 hover:text-slate-700"
                  onClick={() => { setEditingOrganiser(false); setPendingOrganiserId(undefined) }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setEditingOrganiser(true)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground group"
              >
                <span>
                  Lead:{' '}
                  <span className="font-medium">
                    {(campaign as any).organisers?.organiser_name ?? 'Unassigned'}
                  </span>
                </span>
                <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
              </button>
            )}
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href={`/campaigns/${campaignId}/plan/stage/${activeStage?.stage_number || 1}`}>
            Continue Planning
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{activeStage?.stage_number || '-'}</p>
            <p className="text-sm text-muted-foreground mt-1">Current Stage</p>
            {activeStage && (
              <p className="text-xs font-medium mt-1">{STAGE_NAMES[activeStage.stage_number as keyof typeof STAGE_NAMES]}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-green-600">{completedStages}</p>
            <p className="text-sm text-muted-foreground mt-1">Stages Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-3xl font-bold text-slate-600">
              {gates?.filter((g) => g.gate_assessments?.some((a: { outcome: string }) => a.outcome === 'passed' || a.outcome === 'override_approved')).length || 0}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Gates Passed</p>
          </CardContent>
        </Card>
      </div>

      <SituationAnalysisCard campaignId={campaignId} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignTimeline
            stages={sortedStages}
            gates={gatesForTimeline as any}
            campaignId={campaignId}
            paboDate={timeline?.pabo_available_date}
            expiryDate={timeline?.agreement_expiry_date}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stage Gantt</CardTitle>
          <p className="text-sm text-muted-foreground">
            Date-aligned bars surface stage overlaps. Hard active gates lock the
            adjoining boundary at the database level — overlap there is
            rejected. Soft / inactive gates allow overlap for non-linear
            planning.
          </p>
        </CardHeader>
        <CardContent>
          <StageTimelineGantt
            campaignId={campaignId}
            stages={sortedStages}
            gates={(gates ?? []) as { gate_number: number; enforcement_type: string | null; is_active: boolean | null }[]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stage planned dates</CardTitle>
          <p className="text-sm text-muted-foreground">
            Changing dates updates ambition target dates automatically when those
            targets have not been overridden on the stage plan.
          </p>
        </CardHeader>
        <CardContent>
          <CampaignStageDatesEditor
            campaignId={campaignId}
            stages={sortedStages as Array<{
              plan_id: number
              stage_number: number
              planned_start_date: string | null
              planned_end_date: string | null
              status?: string | null
            }>}
          />
        </CardContent>
      </Card>

      <CampaignRevisionHistory campaignId={campaignId} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-base">Campaign Team</CardTitle>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={() => { resetAddDialog(); setAddDialogOpen(true) }}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add member
          </Button>
        </CardHeader>
        <CardContent>
          {!teamMembers || teamMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No team members yet. Add organisers using the button above.
            </p>
          ) : (
            <div className="divide-y">
              {teamMembers.map((member) => {
                const name = member.organiser?.organiser_name ?? 'Unknown'
                const workRole = member.organiser?.user_profiles?.[0]?.work_role
                const reportsToName = member.reports_to_organiser?.organiser_name
                return (
                  <div key={member.id} className="flex items-center justify-between py-2.5 gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{name}</span>
                        <Badge variant="secondary" className="text-xs capitalize">
                          {CAMPAIGN_ROLE_LABELS[member.campaign_role] ?? member.campaign_role}
                        </Badge>
                        {workRole && (
                          <span className="text-xs text-muted-foreground">
                            ({workRole.replace(/_/g, ' ')})
                          </span>
                        )}
                      </div>
                      {reportsToName && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Reports to: <span className="font-medium">{reportsToName}</span>
                          <span className="italic"> (campaign)</span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-slate-400 hover:text-slate-700"
                        onClick={() => openEditMember(member)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-slate-400 hover:text-red-600"
                        onClick={() => handleRemoveMember(member.id, name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={addDialogOpen} onOpenChange={(o) => { setAddDialogOpen(o); if (!o) resetAddDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Organiser</Label>
              <Select value={addOrganiserId} onValueChange={setAddOrganiserId}>
                <SelectTrigger><SelectValue placeholder="Select organiser..." /></SelectTrigger>
                <SelectContent>
                  {allOrganisers
                    ?.filter((o) => !teamOrganiserIds.has(o.organiser_id))
                    .map((o) => {
                      const profile = (o.user_profiles as Array<{ work_role: string | null }> | null)?.[0]
                      return (
                        <SelectItem key={o.organiser_id} value={o.organiser_id.toString()}>
                          {o.organiser_name}
                          {profile?.work_role && ` (${profile.work_role.replace(/_/g, ' ')})`}
                        </SelectItem>
                      )
                    })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Campaign Role</Label>
              <Select value={addRole} onValueChange={setAddRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_ROLES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reports to (campaign-specific, optional)</Label>
              <Select value={addReportsTo} onValueChange={setAddReportsTo}>
                <SelectTrigger><SelectValue placeholder="— Use global default —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Use global default —</SelectItem>
                  {allOrganisers?.map((o) => (
                    <SelectItem key={o.organiser_id} value={o.organiser_id.toString()}>
                      {o.organiser_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddMember} disabled={!addOrganiserId || addTeamMember.isPending}>
              {addTeamMember.isPending ? 'Adding...' : 'Add to Team'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editMemberId !== null} onOpenChange={(o) => { if (!o) setEditMemberId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Campaign Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_ROLES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reports to (campaign-specific, optional)</Label>
              <Select value={editReportsTo} onValueChange={setEditReportsTo}>
                <SelectTrigger><SelectValue placeholder="— Use global default —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Use global default —</SelectItem>
                  {allOrganisers?.map((o) => (
                    <SelectItem key={o.organiser_id} value={o.organiser_id.toString()}>
                      {o.organiser_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMemberId(null)}>Cancel</Button>
            <Button onClick={handleUpdateMember} disabled={updateTeamMember.isPending}>
              {updateTeamMember.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div>
        <h2 className="text-lg font-semibold mb-3">Stage Plans</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sortedStages.map((stage: { stage_number: number; stage_name: string; status: string }) => {
            const gate = gates?.find((g) => g.gate_number === stage.stage_number)
            return (
              <Link key={stage.stage_number} href={`/campaigns/${campaignId}/plan/stage/${stage.stage_number}`}>
                <Card className={cn(
                  'hover:border-blue-300 transition-colors cursor-pointer',
                  stage.status === 'active' && 'border-blue-200 bg-blue-50/50'
                )}>
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                        stage.status === 'active' ? 'bg-blue-600 text-white' :
                        stage.status === 'completed' ? 'bg-green-500 text-white' :
                        stage.status === 'blocked' ? 'bg-red-500 text-white' :
                        'bg-slate-200 text-slate-500'
                      )}>
                        {stage.status === 'completed' ? <CheckCircle className="h-4 w-4" /> : stage.stage_number}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{stage.stage_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className={cn(
                            'text-xs',
                            stage.status === 'active' ? 'bg-blue-100 text-blue-700' :
                            stage.status === 'completed' ? 'bg-green-100 text-green-700' :
                            stage.status === 'blocked' ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-600'
                          )}>
                            {stage.status}
                          </Badge>
                          {gate && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Shield className="h-3 w-3" />
                              Gate {gate.gate_number}
                            </div>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
