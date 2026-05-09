'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useCallScripts } from '@/lib/hooks/useCallScripts'
import { useCreateCallList } from '@/lib/hooks/useCallList'
import { createClient } from '@/lib/supabase/client'
import { fetchApi } from '@/lib/api/fetch-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  ArrowLeft, ArrowRight, Phone, Users, ListChecks,
  Loader2, CheckCircle, ChevronUp, ChevronDown, GripVertical,
  Filter, ArrowUpDown,
} from 'lucide-react'
import { PRIORITY_STRATEGIES } from '@/lib/phone/disposition-types'
import { toast } from 'sonner'
import type { CallListPriorityStrategy } from '@/types/planner-types'
import type { AudienceDescriptor } from '@/lib/phone/audience-descriptor'
import { OccupationMultiSelect } from '@/components/phone/OccupationMultiSelect'

type WizardStep = 'details' | 'filters' | 'priority' | 'script' | 'confirm'

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'details', label: 'List Details' },
  { key: 'filters', label: 'Build List' },
  { key: 'priority', label: 'Call Order' },
  { key: 'script', label: 'Attach Script' },
  { key: 'confirm', label: 'Confirm' },
]

const RATING_BUCKET_CONFIG: Record<string, { label: string; className: string }> = {
  '1': { label: 'Rating 1', className: 'bg-red-100 text-red-700 border-red-200' },
  '2': { label: 'Rating 2', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  '3': { label: 'Rating 3', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  '4': { label: 'Rating 4', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  '5': { label: 'Rating 5', className: 'bg-green-100 text-green-700 border-green-200' },
  unrated: { label: 'Unrated', className: 'bg-slate-100 text-slate-600 border-slate-200' },
}

const ALL_RATING_BUCKETS = ['1', '2', '3', '4', '5', 'unrated']

const BINARY_RATING_BUCKET_CONFIG: Record<string, { label: string; className: string }> = {
  true: { label: 'Yes', className: 'bg-green-100 text-green-700 border-green-200' },
  false: { label: 'No', className: 'bg-red-100 text-red-700 border-red-200' },
  unassessed: { label: 'Un-assessed', className: 'bg-slate-100 text-slate-600 border-slate-200' },
}

const ALL_BINARY_RATING_BUCKETS = ['true', 'false', 'unassessed']

const ALL_ASSESSMENT_RATINGS = ['1', '2', '3', '4', '5', 'unassessed']

interface FilterState {
  membership: string
  employer_id: string
  worksite_id: string
  roles: string[]
  occupations: string[]
  assessment_id: string
  assessment_ratings: string[]
  rating_min: string
  rating_max: string
  include_unrated: boolean
}

interface PriorityOrderState {
  by: 'sequential' | 'assessment_rating' | 'rating'
  assessmentRatingOrder: string[]
  ratingOrder: string[]
}

const DEFAULT_FILTERS: FilterState = {
  membership: 'all',
  employer_id: '',
  worksite_id: '',
  roles: [],
  occupations: [],
  assessment_id: '',
  assessment_ratings: [],
  rating_min: '',
  rating_max: '',
  include_unrated: true,
}

const DEFAULT_PRIORITY: PriorityOrderState = {
  by: 'sequential',
  assessmentRatingOrder: [...ALL_ASSESSMENT_RATINGS],
  ratingOrder: [...ALL_RATING_BUCKETS],
}

export default function NewCallListPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const campaignId = params.id as string
  const backHref = searchParams.get('returnTo')
    ? decodeURIComponent(searchParams.get('returnTo')!)
    : `/campaigns/${campaignId}/phone`
  const preselectedScriptId = searchParams.get('script_id')
    ? parseInt(searchParams.get('script_id')!, 10)
    : null
  const actionId = searchParams.get('action_id')
    ? parseInt(searchParams.get('action_id')!, 10)
    : null

  const [step, setStep] = useState<WizardStep>('details')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [priorityStrategy, setPriorityStrategy] = useState<CallListPriorityStrategy>('sequential')
  const [selectedScriptId, setSelectedScriptId] = useState<number | null>(preselectedScriptId)
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [priority, setPriority] = useState<PriorityOrderState>(DEFAULT_PRIORITY)
  const [createdListId, setCreatedListId] = useState<number | null>(null)
  const [populateResult, setPopulateResult] = useState<{ added: number; skipped_no_phone?: number } | null>(null)
  const [previewCount, setPreviewCount] = useState<{ total: number; withPhone: number } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const { data: scripts } = useCallScripts(campaignId)
  const createList = useCreateCallList(campaignId)

  // E5: When a script_id is passed in the URL, pre-populate filters from its audience_descriptor.
  useEffect(() => {
    if (!preselectedScriptId) return
    let cancelled = false
    async function prefill() {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('call_scripts')
          .select('audience_descriptor')
          .eq('script_id', preselectedScriptId!)
          .single()
        if (cancelled) return
        const descriptor = data?.audience_descriptor as AudienceDescriptor | null
        if (!descriptor?.filters) return
        const f = descriptor.filters
        setFilters((prev) => ({
          ...prev,
          membership: (f.membership as string) || prev.membership,
          employer_id: f.employer_id ? String(f.employer_id) : prev.employer_id,
          worksite_id: f.worksite_id ? String(f.worksite_id) : prev.worksite_id,
          roles: f.roles?.length ? f.roles : prev.roles,
        }))
      } catch {
        // non-fatal — best-effort pre-fill
      }
    }
    void prefill()
    return () => { cancelled = true }
  }, [preselectedScriptId])

  // Fetch campaign-scoped employers
  const { data: employers = [] } = useQuery({
    queryKey: ['campaign-employers', campaignId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('campaign_worker_membership')
        .select('workers!inner(employer_id, employers!inner(employer_id, employer_name))')
        .eq('campaign_id', parseInt(campaignId))
      if (!data) return []
      const seen = new Set<number>()
      const result: { employer_id: number; employer_name: string }[] = []
      for (const row of data) {
        const w = row.workers as unknown as { employer_id: number | null; employers: { employer_id: number; employer_name: string } | null }
        if (w?.employers && w.employer_id && !seen.has(w.employer_id)) {
          seen.add(w.employer_id)
          result.push({ employer_id: w.employers.employer_id, employer_name: w.employers.employer_name })
        }
      }
      return result.sort((a, b) => a.employer_name.localeCompare(b.employer_name))
    },
    enabled: !!campaignId,
  })

  // Fetch campaign-scoped worksites
  const { data: worksites = [] } = useQuery({
    queryKey: ['campaign-worksites', campaignId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('campaign_worker_membership')
        .select('workers!inner(worksite_id, worksites!inner(worksite_id, worksite_name))')
        .eq('campaign_id', parseInt(campaignId))
      if (!data) return []
      const seen = new Set<number>()
      const result: { worksite_id: number; worksite_name: string }[] = []
      for (const row of data) {
        const w = row.workers as unknown as { worksite_id: number | null; worksites: { worksite_id: number; worksite_name: string } | null }
        if (w?.worksites && w.worksite_id && !seen.has(w.worksite_id)) {
          seen.add(w.worksite_id)
          result.push({ worksite_id: w.worksites.worksite_id, worksite_name: w.worksites.worksite_name })
        }
      }
      return result.sort((a, b) => a.worksite_name.localeCompare(b.worksite_name))
    },
    enabled: !!campaignId,
  })

  // Fetch member role types for role filter
  const { data: roleTypes = [] } = useQuery({
    queryKey: ['member-role-types'],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('member_role_types')
        .select('role_name, display_name')
        .order('display_name')
      return data ?? []
    },
  })

  // Fetch campaign assessments for the Specific Assessment filter
  const { data: assessments = [] } = useQuery({
    queryKey: ['campaign-assessments-for-list-builder', campaignId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('campaign_activities')
        .select('activity_id, title, is_binary')
        .eq('campaign_id', parseInt(campaignId))
        .eq('activity_kind', 'assessment')
        .order('title')
      return (data ?? []) as Array<{ activity_id: number; title: string; is_binary: boolean | null }>
    },
    enabled: !!campaignId,
  })

  const selectedAssessment = assessments.find(
    (a) => String(a.activity_id) === filters.assessment_id
  )
  const assessmentRatingBuckets = selectedAssessment?.is_binary
    ? ALL_BINARY_RATING_BUCKETS
    : ALL_ASSESSMENT_RATINGS
  const assessmentRatingConfig: Record<string, { label: string; className: string }> =
    selectedAssessment?.is_binary
      ? BINARY_RATING_BUCKET_CONFIG
      : {
          ...RATING_BUCKET_CONFIG,
          unassessed: { label: 'Un-assessed', className: 'bg-slate-100 text-slate-600 border-slate-200' },
        }

  // Live contact count preview (debounced on filter changes)
  const fetchPreview = useCallback(async () => {
    setPreviewLoading(true)
    try {
      const url = new URL(`${window.location.origin}/api/campaigns/${campaignId}/list-builder`)
      if (filters.membership && filters.membership !== 'all') {
        url.searchParams.set('membership', filters.membership)
      }
      if (filters.employer_id) url.searchParams.set('employer_id', filters.employer_id)
      if (filters.worksite_id) url.searchParams.set('worksite_id', filters.worksite_id)
      if (filters.roles.length > 0) url.searchParams.set('roles', filters.roles.join(','))
      if (filters.occupations.length > 0) url.searchParams.set('occupation', filters.occupations.join(','))

      const res = await fetchApi(url.toString())
      const json = await res.json()
      if (json.success) {
        const workers = json.data as Array<{ phone: string | null }>
        setPreviewCount({
          total: workers.length,
          withPhone: workers.filter((w) => w.phone && w.phone.trim() !== '').length,
        })
      }
    } catch {
      setPreviewCount(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [campaignId, filters.membership, filters.employer_id, filters.worksite_id, filters.roles, filters.occupations])

  useEffect(() => {
    if (step !== 'filters') return
    const t = setTimeout(fetchPreview, 500)
    return () => clearTimeout(t)
  }, [step, fetchPreview])

  const stepIndex = STEPS.findIndex((s) => s.key === step)
  const progress = ((stepIndex + 1) / STEPS.length) * 100

  const goNext = () => {
    const idx = stepIndex + 1
    if (idx < STEPS.length) setStep(STEPS[idx].key)
  }
  const goBack = () => {
    const idx = stepIndex - 1
    if (idx >= 0) setStep(STEPS[idx].key)
  }

  function moveAssessmentRating(index: number, direction: 'up' | 'down') {
    const order = [...priority.assessmentRatingOrder]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= order.length) return
    ;[order[index], order[targetIndex]] = [order[targetIndex], order[index]]
    setPriority((prev) => ({ ...prev, assessmentRatingOrder: order }))
  }

  function moveRatingBucket(index: number, direction: 'up' | 'down') {
    const order = [...priority.ratingOrder]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= order.length) return
    ;[order[index], order[targetIndex]] = [order[targetIndex], order[index]]
    setPriority((prev) => ({ ...prev, ratingOrder: order }))
  }

  const handleCreate = async () => {
    try {
      // priority_strategy must be one of the valid DB enum values.
      // Custom ordering (support_level, rating) is stored in source_filters by the populate route
      // and applied via priority_score on each call_list_item. The 'priority_score' strategy
      // tells the calling module to order contacts by their computed score.
      const strategyValue = priority.by !== 'sequential' ? 'priority_score' : priorityStrategy

      const list = await createList.mutateAsync({
        name,
        description: description || undefined,
        script_id: selectedScriptId,
        priority_strategy: strategyValue as CallListPriorityStrategy,
      })
      setCreatedListId(list.list_id)

      const populateBody = {
        filters: {
          membership: filters.membership !== 'all' ? filters.membership : undefined,
          employer_id: filters.employer_id || undefined,
          worksite_id: filters.worksite_id || undefined,
          roles: filters.roles.length > 0 ? filters.roles.join(',') : undefined,
          occupation: filters.occupations.length > 0 ? filters.occupations : undefined,
          assessment_id: filters.assessment_id ? Number(filters.assessment_id) : undefined,
          assessment_ratings:
            filters.assessment_id && filters.assessment_ratings.length > 0
              ? filters.assessment_ratings
              : undefined,
          rating_min: filters.rating_min ? parseFloat(filters.rating_min) : undefined,
          rating_max: filters.rating_max ? parseFloat(filters.rating_max) : undefined,
          include_unrated: filters.include_unrated,
        },
        priority_order: priority.by !== 'sequential'
          ? {
              by: priority.by,
              order:
                priority.by === 'assessment_rating'
                  ? priority.assessmentRatingOrder
                  : priority.ratingOrder,
              assessment_id:
                priority.by === 'assessment_rating' && filters.assessment_id
                  ? Number(filters.assessment_id)
                  : undefined,
            }
          : undefined,
      }

      const populateRes = await fetchApi(`/api/calls/lists/${list.list_id}/populate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(populateBody),
      })

      if (populateRes.ok) {
        const result = await populateRes.json()
        setPopulateResult(result)
        toast.success(`Call list created with ${result.added} contacts`)
      } else {
        toast.success('Call list created (no contacts matched filters)')
      }

      // F2: When created via the orchestrator, update the action with the script + list and
      // mark it completed (matches wizard behaviour at PhoneWizardSteps handleCreateListAndCall).
      if (actionId) {
        try {
          const supabase = createClient()

          // Write to the new join table (F1) as well as legacy array (backward compat)
          await supabase
            .from('phone_call_action_lists')
            .upsert({ action_id: actionId, list_id: list.list_id, position: 0 }, { onConflict: 'action_id,list_id' })

          await supabase
            .from('phone_call_actions')
            .update({
              list_ids: [list.list_id],
              script_id: selectedScriptId ?? undefined,
              status: selectedScriptId ? 'completed' : 'in_progress',
            })
            .eq('action_id', actionId)
        } catch {
          // Non-fatal: action linking failure should not block the user
        }
      }

      setStep('confirm')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create list')
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Create Call List</h2>
          <p className="text-sm text-muted-foreground">
            Step {stepIndex + 1} of {STEPS.length}: {STEPS[stepIndex].label}
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center flex-1">
            <div className={`flex-1 h-1 rounded-full ${i <= stepIndex ? 'bg-primary' : 'bg-muted'}`} />
          </div>
        ))}
      </div>
      <Progress value={progress} className="h-1.5 -mt-4" />

      {/* Step: Details */}
      {step === 'details' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              List Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>List Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Stage 1 Phone Outreach — Non-members"
              />
            </div>
            <div className="space-y-1">
              <Label>Description (optional)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of who is on this list and why..."
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <Label>Base Priority Strategy</Label>
              <Select
                value={priorityStrategy}
                onValueChange={(v) => setPriorityStrategy(v as CallListPriorityStrategy)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_STRATEGIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <div>
                        <span className="font-medium">{s.label}</span>
                        <span className="text-muted-foreground text-xs ml-2">{s.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end">
              <Button onClick={goNext} disabled={!name.trim()}>
                Next
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Filters */}
      {step === 'filters' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Build the List
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Only workers with phone numbers will be added. Use filters to narrow the list.
            </p>

            {/* Standard filters */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Membership</Label>
                <Select
                  value={filters.membership}
                  onValueChange={(v) => setFilters((f) => ({ ...f, membership: v }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="member">Members</SelectItem>
                    <SelectItem value="member_pending">Member – pending</SelectItem>
                    <SelectItem value="non_member">Non-members</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Occupation</Label>
                <OccupationMultiSelect
                  campaignId={campaignId}
                  selected={filters.occupations}
                  onChange={(values) => setFilters((f) => ({ ...f, occupations: values }))}
                  compact
                  placeholder="Any occupation"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Employer</Label>
                <Select
                  value={filters.employer_id || '__all__'}
                  onValueChange={(v) => setFilters((f) => ({ ...f, employer_id: v === '__all__' ? '' : v, worksite_id: '' }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All employers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All employers</SelectItem>
                    {employers.map((e) => (
                      <SelectItem key={e.employer_id} value={String(e.employer_id)}>
                        {e.employer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Worksite</Label>
                <Select
                  value={filters.worksite_id || '__all__'}
                  onValueChange={(v) => setFilters((f) => ({ ...f, worksite_id: v === '__all__' ? '' : v }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All worksites" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All worksites</SelectItem>
                    {worksites.map((w) => (
                      <SelectItem key={w.worksite_id} value={String(w.worksite_id)}>
                        {w.worksite_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Role filter */}
            {roleTypes.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Organising Role (select multiple)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {roleTypes.map((r) => (
                    <button
                      key={r.role_name}
                      onClick={() => setFilters((f) => ({
                        ...f,
                        roles: f.roles.includes(r.role_name)
                          ? f.roles.filter((x) => x !== r.role_name)
                          : [...f.roles, r.role_name],
                      }))}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        filters.roles.includes(r.role_name)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border hover:bg-muted'
                      }`}
                    >
                      {r.display_name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Specific Assessment filter */}
            <div className="space-y-1.5">
              <Label className="text-xs">Specific Assessment</Label>
              <Select
                value={filters.assessment_id || '__none__'}
                onValueChange={(v) => setFilters((f) => ({
                  ...f,
                  assessment_id: v === '__none__' ? '' : v,
                  assessment_ratings: [],
                }))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Choose an assessment…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (skip assessment filter)</SelectItem>
                  {assessments.map((a) => (
                    <SelectItem key={a.activity_id} value={String(a.activity_id)}>
                      {a.title}
                      {a.is_binary ? ' (yes/no)' : ''}
                    </SelectItem>
                  ))}
                  {assessments.length === 0 && (
                    <div className="py-2 px-3 text-xs text-muted-foreground">
                      No assessments defined for this campaign yet.
                    </div>
                  )}
                </SelectContent>
              </Select>

              {filters.assessment_id && (
                <div className="space-y-1.5 pt-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Include workers with these ratings for &ldquo;{selectedAssessment?.title}&rdquo;
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {assessmentRatingBuckets.map((r) => {
                      const cfg = assessmentRatingConfig[r] || { label: r, className: '' }
                      const selected = filters.assessment_ratings.includes(r)
                      return (
                        <button
                          key={r}
                          onClick={() => setFilters((f) => ({
                            ...f,
                            assessment_ratings: selected
                              ? f.assessment_ratings.filter((x) => x !== r)
                              : [...f.assessment_ratings, r],
                          }))}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors font-medium ${
                            selected ? cfg.className : 'bg-background border-border hover:bg-muted text-foreground'
                          }`}
                        >
                          {cfg.label}
                        </button>
                      )
                    })}
                  </div>
                  {filters.assessment_ratings.length > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      Note: assessment filters are applied when the list is populated, not reflected in the preview count below.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Activity rating filter */}
            <div className="space-y-1.5">
              <Label className="text-xs">Activity Rating Range (cumulative score)</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Minimum</Label>
                  <Input
                    type="number"
                    min="1"
                    max="5"
                    value={filters.rating_min}
                    onChange={(e) => setFilters((f) => ({ ...f, rating_min: e.target.value }))}
                    placeholder="e.g. 1"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Maximum</Label>
                  <Input
                    type="number"
                    min="1"
                    max="5"
                    value={filters.rating_max}
                    onChange={(e) => setFilters((f) => ({ ...f, rating_max: e.target.value }))}
                    placeholder="e.g. 3"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input
                  id="include-unrated"
                  type="checkbox"
                  checked={filters.include_unrated}
                  onChange={(e) => setFilters((f) => ({ ...f, include_unrated: e.target.checked }))}
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                />
                <label htmlFor="include-unrated" className="text-xs text-muted-foreground cursor-pointer">
                  Include workers with no activity rating recorded
                </label>
              </div>
              {(filters.rating_min || filters.rating_max) && (
                <p className="text-[10px] text-muted-foreground">
                  Note: rating filters are applied when the list is populated, not reflected in the preview count below.
                </p>
              )}
            </div>

            {/* Live contact count */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border text-sm">
              {previewLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : previewCount ? (
                <>
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>
                    <strong>{previewCount.total}</strong> workers match
                    {' · '}
                    <strong className="text-green-700">{previewCount.withPhone}</strong> have phone numbers
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground text-xs">Calculating list size…</span>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={goNext}>
                Next
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Priority Ordering */}
      {step === 'priority' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowUpDown className="h-5 w-5" />
              Call Order
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Choose how contacts are ordered in the call queue.
            </p>

            <div className="space-y-2">
              {[
                { value: 'sequential', label: 'Sequential', desc: 'Call workers in the order they appear in the campaign list', disabled: false },
                {
                  value: 'assessment_rating',
                  label: 'By Specific Assessment Rating',
                  desc: selectedAssessment
                    ? `Order by rating on "${selectedAssessment.title}" — drag to set the call order`
                    : 'Pick a Specific Assessment in the Build List step first to enable this option',
                  disabled: !filters.assessment_id,
                },
                { value: 'rating', label: 'By Cumulative Activity Rating', desc: 'Set a custom call order by cumulative rating bucket — use the controls below to reorder', disabled: false },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    if (option.disabled) return
                    setPriority((prev) => ({ ...prev, by: option.value as PriorityOrderState['by'] }))
                  }}
                  disabled={option.disabled}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    option.disabled
                      ? 'border-border bg-muted/20 opacity-60 cursor-not-allowed'
                      : priority.by === option.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{option.desc}</p>
                </button>
              ))}
            </div>

            {/* Assessment rating ordering */}
            {priority.by === 'assessment_rating' && selectedAssessment && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-700">
                  Drag order for &ldquo;{selectedAssessment.title}&rdquo; ratings (top = called first)
                </p>
                <div className="space-y-1.5">
                  {(priority.assessmentRatingOrder.length === assessmentRatingBuckets.length
                    ? priority.assessmentRatingOrder
                    : assessmentRatingBuckets
                  ).map((rating, index) => {
                    const config = assessmentRatingConfig[rating] || { label: rating, className: '' }
                    return (
                      <div
                        key={rating}
                        className="flex items-center gap-2 p-2.5 rounded-lg border bg-background"
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs font-medium text-muted-foreground w-4">{index + 1}.</span>
                        <Badge variant="secondary" className={`text-xs ${config.className} flex-1`}>
                          {config.label}
                        </Badge>
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => moveAssessmentRating(index, 'up')}
                            disabled={index === 0}
                            className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30"
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => moveAssessmentRating(index, 'down')}
                            disabled={index === priority.assessmentRatingOrder.length - 1}
                            className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Workers are sorted into these rating buckets for the selected assessment first, then by individual score.
                </p>
              </div>
            )}

            {/* Rating bucket ordering */}
            {priority.by === 'rating' && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-700">Call order (top = called first)</p>
                <div className="space-y-1.5">
                  {priority.ratingOrder.map((bucket, index) => {
                    const config = RATING_BUCKET_CONFIG[bucket]
                    return (
                      <div
                        key={bucket}
                        className="flex items-center gap-2 p-2.5 rounded-lg border bg-background"
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs font-medium text-muted-foreground w-4">{index + 1}.</span>
                        <Badge variant="secondary" className={`text-xs ${config.className} flex-1`}>
                          {config.label}
                        </Badge>
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => moveRatingBucket(index, 'up')}
                            disabled={index === 0}
                            className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30"
                          >
                            <ChevronUp className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => moveRatingBucket(index, 'down')}
                            disabled={index === priority.ratingOrder.length - 1}
                            className="h-4 w-4 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Workers are sorted into these rating buckets first, then by individual score within each bucket.
                  Cumulative ratings are rounded to the nearest whole number for grouping.
                </p>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={goNext}>
                Next
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Attach Script */}
      {step === 'script' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Attach Script
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Attach a structured phone script to guide callers through the conversation.
            </p>
            {preselectedScriptId && selectedScriptId === preselectedScriptId && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary">
                <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
                Script pre-selected from editor. You can change it below.
              </div>
            )}
            {scripts && scripts.length > 0 ? (
              <div className="space-y-2">
                {scripts.map((s) => (
                  <div
                    key={s.script_id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedScriptId === s.script_id
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedScriptId(
                      selectedScriptId === s.script_id ? null : s.script_id
                    )}
                  >
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.call_script_sections?.length || 0} sections
                        {s.call_objective && ` — ${s.call_objective.slice(0, 60)}...`}
                      </p>
                    </div>
                    <Badge variant={s.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                      {s.status}
                    </Badge>
                    {selectedScriptId === s.script_id && (
                      <CheckCircle className="h-4 w-4 text-primary" />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No scripts available. You can create one from a phone script draft in the Capacities step.
              </p>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={handleCreate} disabled={createList.isPending}>
                {createList.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : null}
                Create Call List
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Call List Created
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <p><strong>Name:</strong> {name}</p>
              <p><strong>Priority:</strong> {
                priority.by === 'assessment_rating'
                  ? `Assessment rating order${selectedAssessment ? ` (${selectedAssessment.title})` : ''}: ${priority.assessmentRatingOrder.map((r) => assessmentRatingConfig[r]?.label ?? r).join(' → ')}`
                  : priority.by === 'rating'
                    ? `Cumulative rating order: ${priority.ratingOrder.map((b) => RATING_BUCKET_CONFIG[b]?.label).join(' → ')}`
                    : PRIORITY_STRATEGIES.find((s) => s.value === priorityStrategy)?.label
              }</p>
              {populateResult && (
                <>
                  <p><strong>Contacts added:</strong> {populateResult.added}</p>
                  {populateResult.skipped_no_phone !== undefined && populateResult.skipped_no_phone > 0 && (
                    <p className="text-muted-foreground text-xs">
                      {populateResult.skipped_no_phone} workers skipped (no phone number on record)
                    </p>
                  )}
                </>
              )}
            </div>
            {actionId && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                <strong>Next step:</strong> Create a phone script so callers have a guide to follow.
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {actionId && (
                <Button
                  onClick={() =>
                    router.push(
                      `/campaigns/phone-wizard?campaign_id=${campaignId}&action_id=${actionId}`
                    )
                  }
                >
                  <Phone className="h-4 w-4 mr-1" />
                  Create Script Now
                </Button>
              )}
              {createdListId && (
                <Button variant={actionId ? 'outline' : 'default'} onClick={() => router.push(`/campaigns/${campaignId}/phone/call/${createdListId}`)}>
                  <Phone className="h-4 w-4 mr-1" />
                  Start Calling
                </Button>
              )}
              <Button variant="outline" onClick={() => router.push(`/campaigns/${campaignId}/phone`)}>
                View All Lists
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
