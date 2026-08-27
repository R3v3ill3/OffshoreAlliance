'use client'

/**
 * Campaign-optional member card for the SMS chat surfaces (Phase 10,
 * docs/SMS_MODULE_PHASE10_PLAN.md WI-7).
 *
 * Why not reuse WorkerDetailSheet: it is wall-chart-typed (takes a
 * WallChartWorker and a required campaignId), and its provider loads
 * the campaign's ENTIRE member set to find one row. Neither works for a
 * triage thread with no worker match, nor for a standalone chat running
 * on a hidden is_sms_episode campaign.
 *
 * So: Details is written here and always available; the campaign-scoped
 * tabs are the wall chart's own components, rendered only when a real
 * campaign is attached. Nothing is forked.
 *
 * Writes go through PATCH /api/workers/[workerId] rather than the
 * client Supabase call DetailsTab uses — one audited, permission-checked
 * path for a surface where an organiser is working thirty people.
 */
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ChevronDown,
  ExternalLink,
  Loader2,
  Save,
  TriangleAlert,
} from 'lucide-react'
import { fetchApi } from '@/lib/api/fetch-api'
import { createClient } from '@/lib/supabase/client'
import { useAuthAwareMutation } from '@/lib/hooks/useAuthAwareMutation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toDisplay } from '@/lib/phone/normalise-phone'
import {
  RatingsTab,
  UnitsTab,
} from '@/components/campaigns/wall-chart/worker-detail-sheet'
import { WorkerRelationshipsTab } from '@/components/campaigns/wall-chart/worker-relationships-tab'
import { WorkerDevelopmentTab } from '@/components/campaigns/activists/worker-development-tab'
import type {
  WallChartOU,
  WallChartOUAssignment,
  WallChartRoleType,
} from '@/components/campaigns/wall-chart/types'

const NONE = '__none__'

export interface WorkerChatCardProps {
  workerId: number
  /**
   * Effective campaign for the campaign-scoped sections. NULL — or an
   * episode campaign — collapses them to a single hint.
   */
  campaignId: number | null
  /** True when campaignId is a hidden is_sms_episode campaign. */
  campaignIsEpisode?: boolean
  canWrite: boolean
  density?: 'compact' | 'full'
  /** The open thread's routing number, for the phone-change warning. */
  conversationPhoneE164?: string | null
  conversationId?: number | null
  onSaved?: () => void
}

interface WorkerPayload {
  worker_id: number
  first_name: string
  last_name: string
  preferred_name: string | null
  email: string | null
  phone: string | null
  phone_e164: string | null
  occupation: string | null
  canonical_occupation_id: number | null
  employer_id: number | null
  worksite_id: number | null
  member_role_type_id: number | null
  union_membership_type_id: number | null
  non_oa_union_option_id: number | null
  is_hsr: boolean | null
  is_bargaining_rep: boolean | null
  sms_opt_out: boolean
  employer: { employer_id: number; employer_name: string } | null
  worksite: { worksite_id: number; worksite_name: string } | null
}

interface FormState {
  first_name: string
  last_name: string
  preferred_name: string
  email: string
  phone: string
  canonical_occupation_id: number | null
  employer_id: number | null
  worksite_id: number | null
  member_role_type_id: number | null
  union_membership_type_id: number | null
  non_oa_union_option_id: number | null
  is_hsr: boolean
  is_bargaining_rep: boolean
}

function formFrom(worker: WorkerPayload): FormState {
  return {
    first_name: worker.first_name ?? '',
    last_name: worker.last_name ?? '',
    preferred_name: worker.preferred_name ?? '',
    email: worker.email ?? '',
    phone: worker.phone ?? '',
    canonical_occupation_id: worker.canonical_occupation_id,
    employer_id: worker.employer_id,
    worksite_id: worker.worksite_id,
    member_role_type_id: worker.member_role_type_id,
    union_membership_type_id: worker.union_membership_type_id,
    non_oa_union_option_id: worker.non_oa_union_option_id,
    is_hsr: !!worker.is_hsr,
    is_bargaining_rep: !!worker.is_bargaining_rep,
  }
}

function diffForm(next: FormState, base: FormState): Partial<FormState> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(next) as (keyof FormState)[]) {
    if (next[key] !== base[key]) out[key] = next[key]
  }
  return out as Partial<FormState>
}

/** Collapsible section. Details starts open; the rest are opt-in. */
function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t pt-2 first:border-t-0 first:pt-0">
      <button
        type="button"
        className="flex w-full items-center justify-between py-1 text-left text-xs font-medium"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {title}
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  )
}

export function WorkerChatCard({
  workerId,
  campaignId,
  campaignIsEpisode = false,
  canWrite,
  density = 'compact',
  conversationPhoneE164 = null,
  conversationId = null,
  onSaved,
}: WorkerChatCardProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const compact = density === 'compact'
  // Campaign sections need a real campaign — an episode campaign has no
  // units, assessments or activist register to speak of.
  const realCampaignId = campaignIsEpisode ? null : campaignId

  const { data: worker, isLoading } = useQuery({
    queryKey: ['worker-chat-card', workerId],
    queryFn: async () => {
      const res = await fetchApi(`/api/workers/${workerId}`)
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || 'Failed to load member')
      }
      const json = (await res.json()) as { worker: WorkerPayload }
      return json.worker
    },
    staleTime: 30_000,
  })

  const base = useMemo(() => (worker ? formFrom(worker) : null), [worker])

  // Re-seed when the card switches member, or when a save returns fresh
  // server values. This is React's "adjust state during render" pattern
  // rather than an effect: an effect here would commit a render with
  // stale fields and then immediately re-render, and setState in an
  // effect body is exactly the cascading-render case the lint rule
  // guards. Local edits on the SAME member survive, because `base` only
  // changes identity when the query data does.
  const [form, setForm] = useState<FormState | null>(base)
  const [seededFrom, setSeededFrom] = useState<FormState | null>(base)
  if (base !== seededFrom) {
    setSeededFrom(base)
    setForm(base)
  }

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))

  const dirty = useMemo(
    () => (form && base ? Object.keys(diffForm(form, base)).length > 0 : false),
    [form, base],
  )

  const { data: employers = [] } = useQuery({
    queryKey: ['worker-card-employers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employers')
        .select('employer_id, employer_name')
        .order('employer_name')
      if (error) throw error
      return (data ?? []) as { employer_id: number; employer_name: string }[]
    },
    enabled: canWrite,
    staleTime: 300_000,
  })

  const { data: worksites = [] } = useQuery({
    queryKey: ['worker-card-worksites', form?.employer_id],
    queryFn: async () => {
      if (form?.employer_id != null) {
        const { data: roles, error: roleErr } = await supabase
          .from('employer_worksite_roles')
          .select('worksite_id')
          .eq('employer_id', form.employer_id)
          .eq('is_current', true)
        if (roleErr) throw roleErr
        const ids = [...new Set((roles ?? []).map((r) => r.worksite_id as number))]
        if (ids.length > 0) {
          const { data, error } = await supabase
            .from('worksites')
            .select('worksite_id, worksite_name')
            .in('worksite_id', ids)
            .order('worksite_name')
          if (error) throw error
          return (data ?? []) as { worksite_id: number; worksite_name: string }[]
        }
      }
      const { data, error } = await supabase
        .from('worksites')
        .select('worksite_id, worksite_name')
        .order('worksite_name')
      if (error) throw error
      return (data ?? []) as { worksite_id: number; worksite_name: string }[]
    },
    enabled: canWrite,
    staleTime: 300_000,
  })

  const { data: occupations = [] } = useQuery({
    queryKey: ['worker-card-occupations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('occupations')
        .select('occupation_id, canonical_name')
        .order('canonical_name')
      if (error) throw error
      return (data ?? []) as { occupation_id: number; canonical_name: string }[]
    },
    enabled: canWrite,
    staleTime: 300_000,
  })

  const { data: roleTypes = [] } = useQuery({
    queryKey: ['member_role_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('member_role_types')
        .select('role_type_id, role_name, display_name')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as WallChartRoleType[]
    },
    staleTime: 300_000,
  })

  const { data: membershipTypes = [] } = useQuery({
    queryKey: ['union-membership-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('union_membership_types')
        .select('union_membership_type_id, display_name, type_name')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as {
        union_membership_type_id: number
        display_name: string | null
        type_name: string
      }[]
    },
    enabled: canWrite,
    staleTime: 300_000,
  })

  const { data: nonOaUnions = [] } = useQuery({
    queryKey: ['non-oa-union-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('non_oa_union_options')
        .select('non_oa_union_option_id, badge_initials, display_name')
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as {
        non_oa_union_option_id: number
        badge_initials: string | null
        display_name: string
      }[]
    },
    enabled: canWrite,
    staleTime: 300_000,
  })

  // Units section inputs — scoped to this ONE worker, unlike
  // CampaignWorkerDetailProvider which loads the whole member set.
  const { data: ous = [] } = useQuery({
    queryKey: ['campaign-ous', String(realCampaignId)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_organising_units')
        .select('*')
        .eq('campaign_id', realCampaignId as number)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as WallChartOU[]
    },
    enabled: realCampaignId != null,
  })

  const ouIds = useMemo(() => ous.map((o) => o.ou_id), [ous])

  const { data: ouAssign = [] } = useQuery({
    queryKey: ['worker-card-ou', workerId, ouIds.join(',')],
    queryFn: async () => {
      if (ouIds.length === 0) return [] as WallChartOUAssignment[]
      const { data, error } = await supabase
        .from('campaign_worker_ou')
        .select('ou_id, worker_id, is_primary')
        .eq('worker_id', workerId)
        .in('ou_id', ouIds)
      if (error) throw error
      return (data ?? []) as WallChartOUAssignment[]
    },
    enabled: realCampaignId != null && ouIds.length > 0,
  })

  const save = useAuthAwareMutation({
    mutationFn: async (changes: Partial<FormState>) => {
      const res = await fetchApi(`/api/workers/${workerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...changes,
          preferred_name: 'preferred_name' in changes
            ? changes.preferred_name?.trim() || null
            : undefined,
          email: 'email' in changes ? changes.email?.trim() || null : undefined,
          phone: 'phone' in changes ? changes.phone?.trim() || null : undefined,
          campaign_id: campaignId,
          sms_conversation_id: conversationId,
        }),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || 'Failed to save member')
      }
      return (await res.json()) as {
        worker: WorkerPayload
        phone_e164_changed: boolean
      }
    },
    onSuccess: (result) => {
      toast.success('Member updated')
      if (result.phone_e164_changed && conversationPhoneE164) {
        // The thread keeps its own routing key by design — a
        // conversation belongs to the number it was sent to.
        toast.warning(
          `New mobile saved. This thread stays on ${toDisplay(conversationPhoneE164)}; new messages will use the new number.`,
          { duration: 10_000 },
        )
      }
      // Same invalidation set as the wall chart's DetailsTab, so an edit
      // made from chat shows up there without a reload.
      for (const key of [
        ['worker-chat-card', workerId],
        ['campaign-members-full', String(campaignId)],
        ['campaign-members', String(campaignId)],
        ['campaign-rating-summary', String(campaignId)],
        ['campaign-list-stats-members', campaignId],
        ['campaign-list-builder-workers', campaignId],
        ['worker', String(workerId)],
        ['workers'],
        ['sms-conversation', conversationId],
        ['sms-p2p-board'],
      ]) {
        queryClient.invalidateQueries({ queryKey: key })
      }
      onSaved?.()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (isLoading || !worker || !form) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const displayName =
    `${form.preferred_name || form.first_name} ${form.last_name}`.trim()
  const phoneDiverges =
    !!conversationPhoneE164 &&
    !!worker.phone_e164 &&
    conversationPhoneE164 !== worker.phone_e164

  return (
    <div className="space-y-2 text-sm">
      {/* Identity summary — always visible, never collapsed. */}
      <div>
        <p className="font-semibold leading-tight">{displayName}</p>
        <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
          <p>{worker.phone_e164 ? toDisplay(worker.phone_e164) : 'No mobile'}</p>
          {worker.employer && <p>{worker.employer.employer_name}</p>}
          {worker.worksite && <p>{worker.worksite.worksite_name}</p>}
        </div>
      </div>

      {phoneDiverges && (
        <p className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          This thread runs on {toDisplay(conversationPhoneE164)}, which is not
          the member&rsquo;s current mobile.
        </p>
      )}

      <Section title="Details" defaultOpen>
        <div className="space-y-2">
          <div className={compact ? 'space-y-2' : 'grid grid-cols-2 gap-2'}>
            <div className="space-y-1">
              <Label className="text-[11px]">First name</Label>
              <Input
                className="h-8 text-xs"
                value={form.first_name}
                disabled={!canWrite}
                onChange={(e) => setField('first_name', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Last name</Label>
              <Input
                className="h-8 text-xs"
                value={form.last_name}
                disabled={!canWrite}
                onChange={(e) => setField('last_name', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Preferred name</Label>
            <Input
              className="h-8 text-xs"
              value={form.preferred_name}
              disabled={!canWrite}
              placeholder="Used in merge fields"
              onChange={(e) => setField('preferred_name', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Mobile</Label>
            <Input
              className="h-8 text-xs"
              value={form.phone}
              disabled={!canWrite}
              placeholder="04xx xxx xxx"
              onChange={(e) => setField('phone', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Email</Label>
            <Input
              className="h-8 text-xs"
              value={form.email}
              disabled={!canWrite}
              onChange={(e) => setField('email', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Employer</Label>
            <Select
              value={form.employer_id != null ? String(form.employer_id) : NONE}
              disabled={!canWrite}
              onValueChange={(v) => {
                setField('employer_id', v === NONE ? null : Number(v))
                // Worksite belongs to the employer — a changed employer
                // invalidates it rather than silently keeping a mismatch.
                setField('worksite_id', null)
              }}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="No employer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No employer</SelectItem>
                {employers.map((e) => (
                  <SelectItem key={e.employer_id} value={String(e.employer_id)}>
                    {e.employer_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Worksite</Label>
            <Select
              value={form.worksite_id != null ? String(form.worksite_id) : NONE}
              disabled={!canWrite}
              onValueChange={(v) =>
                setField('worksite_id', v === NONE ? null : Number(v))
              }
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="No worksite" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No worksite</SelectItem>
                {worksites.map((w) => (
                  <SelectItem key={w.worksite_id} value={String(w.worksite_id)}>
                    {w.worksite_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Occupation</Label>
            <Select
              value={
                form.canonical_occupation_id != null
                  ? String(form.canonical_occupation_id)
                  : NONE
              }
              disabled={!canWrite}
              onValueChange={(v) =>
                setField('canonical_occupation_id', v === NONE ? null : Number(v))
              }
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="No occupation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No occupation</SelectItem>
                {occupations.map((o) => (
                  <SelectItem key={o.occupation_id} value={String(o.occupation_id)}>
                    {o.canonical_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Membership</Label>
            <Select
              value={
                form.union_membership_type_id != null
                  ? String(form.union_membership_type_id)
                  : NONE
              }
              disabled={!canWrite}
              onValueChange={(v) =>
                setField(
                  'union_membership_type_id',
                  v === NONE ? null : Number(v),
                )
              }
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="Not recorded" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not recorded</SelectItem>
                {membershipTypes.map((t) => (
                  <SelectItem
                    key={t.union_membership_type_id}
                    value={String(t.union_membership_type_id)}
                  >
                    {t.display_name || t.type_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Other union</Label>
            <Select
              value={
                form.non_oa_union_option_id != null
                  ? String(form.non_oa_union_option_id)
                  : NONE
              }
              disabled={!canWrite}
              onValueChange={(v) =>
                setField('non_oa_union_option_id', v === NONE ? null : Number(v))
              }
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {nonOaUnions.map((u) => (
                  <SelectItem
                    key={u.non_oa_union_option_id}
                    value={String(u.non_oa_union_option_id)}
                  >
                    {u.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]">Role</Label>
            <Select
              value={
                form.member_role_type_id != null
                  ? String(form.member_role_type_id)
                  : NONE
              }
              disabled={!canWrite}
              onValueChange={(v) =>
                setField('member_role_type_id', v === NONE ? null : Number(v))
              }
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue placeholder="No role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No role</SelectItem>
                {roleTypes.map((r) => (
                  <SelectItem key={r.role_type_id} value={String(r.role_type_id)}>
                    {r.display_name || r.role_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-[11px]">HSR</Label>
            <Switch
              checked={form.is_hsr}
              disabled={!canWrite}
              onCheckedChange={(v) => setField('is_hsr', v)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Bargaining rep</Label>
            <Switch
              checked={form.is_bargaining_rep}
              disabled={!canWrite}
              onCheckedChange={(v) => setField('is_bargaining_rep', v)}
            />
          </div>

          {canWrite && dirty && base && (
            <Button
              size="sm"
              className="h-8 w-full text-xs"
              disabled={save.isPending}
              onClick={() => save.mutate(diffForm(form, base))}
            >
              {save.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Save className="mr-1 h-3 w-3" />
              )}
              Save changes
            </Button>
          )}
        </div>
      </Section>

      <WorkerNotes workerId={workerId} campaignId={campaignId} canWrite={canWrite} />

      {realCampaignId == null ? (
        <div className="rounded-md border border-dashed p-2 text-[11px] text-muted-foreground">
          {campaignIsEpisode
            ? 'Standalone chat — units, relationships, development and ratings live on a real campaign.'
            : 'Attach this conversation to a campaign to see units, relationships, development and ratings.'}
        </div>
      ) : (
        <>
          <Section title="Activity &amp; ratings">
            <RatingsTab
              campaignId={String(realCampaignId)}
              workerId={workerId}
              workerName={displayName}
              canWrite={canWrite}
            />
          </Section>

          <Section title="Units">
            <UnitsTab
              campaignId={String(realCampaignId)}
              workerId={workerId}
              ous={ous}
              assignedOuIds={ouAssign.map((a) => a.ou_id).sort((a, b) => a - b)}
              primaryOuId={ouAssign.find((a) => a.is_primary)?.ou_id ?? null}
              canWrite={canWrite}
            />
          </Section>

          <Section title="Relationships">
            <WorkerRelationshipsTab
              workerId={workerId}
              campaignId={String(realCampaignId)}
              workerName={displayName}
              canWrite={canWrite}
              currentRoleTypeId={form.member_role_type_id}
              roleTypes={roleTypes}
            />
          </Section>

          <Section title="Development">
            <WorkerDevelopmentTab
              campaignId={String(realCampaignId)}
              workerId={workerId}
              canWrite={canWrite}
            />
          </Section>

          <a
            href={`/campaigns/${realCampaignId}?tab=wallchart&worker=${workerId}`}
            className="flex items-center gap-1 border-t pt-2 text-[11px] text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Open full member record
          </a>
        </>
      )}
    </div>
  )
}

/**
 * Worker notes — org-wide (campaign_id nullable), so this section works
 * on a triage or standalone thread as well as a campaign one.
 */
function WorkerNotes({
  workerId,
  campaignId,
  canWrite,
}: {
  workerId: number
  campaignId: number | null
  canWrite: boolean
}) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [text, setText] = useState('')

  const { data: notes = [] } = useQuery({
    queryKey: ['worker-notes', workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_notes')
        .select('note_id, note_text, flag_for_follow_up, created_at')
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as {
        note_id: number
        note_text: string
        flag_for_follow_up: boolean | null
        created_at: string
      }[]
    },
  })

  const addNote = useAuthAwareMutation({
    mutationFn: async () => {
      const body = text.trim()
      if (!body) throw new Error('Note text is required')
      const { error } = await supabase.from('worker_notes').insert({
        worker_id: workerId,
        campaign_id: campaignId,
        note_text: body,
        flag_for_follow_up: false,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setText('')
      queryClient.invalidateQueries({ queryKey: ['worker-notes', workerId] })
      toast.success('Note added')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Section title="Member notes" defaultOpen>
      <div className="space-y-1.5">
        {notes.length === 0 && (
          <p className="text-[11px] text-muted-foreground">No notes yet.</p>
        )}
        {notes.map((n) => (
          <p
            key={n.note_id}
            className="rounded-md border bg-muted/30 px-2 py-1 text-[11px] whitespace-pre-wrap"
          >
            {n.note_text}
          </p>
        ))}
        {canWrite && (
          <>
            <Textarea
              rows={2}
              className="resize-none text-xs"
              placeholder="Add a note about this member…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-full text-xs"
              disabled={!text.trim() || addNote.isPending}
              onClick={() => addNote.mutate()}
            >
              {addNote.isPending && (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              )}
              Add note
            </Button>
          </>
        )}
      </div>
    </Section>
  )
}
