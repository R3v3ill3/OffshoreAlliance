'use client'

/**
 * Email recipient list builder.
 *
 * Slim parallel of /campaigns/[id]/phone/lists/new/page.tsx — three steps
 * (Details → Filters → Confirm). No priority ordering, no script attach
 * step. Filters target workers with email rather than phone.
 *
 * Entry points:
 *   • /email/setup/order → list_first  → arrives here with ?draft_id=…
 *     The campaign_comms_drafts shell already exists; on Confirm we
 *     INSERT email_lists, POST .../populate, UPDATE draft.email_list_id,
 *     and route to /email/wizard.
 *   • Resume from EmailResumeBanner when entry_branch in
 *     ('ai_list_first','paste_list_first') and email_list_id IS NULL.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { fetchApi } from '@/lib/api/fetch-api'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Filter,
  ListChecks,
  Loader2,
  Mail,
  Upload,
  Users,
} from 'lucide-react'
import { OccupationMultiSelect } from '@/components/phone/OccupationMultiSelect'

type WizardStep = 'details' | 'filters' | 'confirm'

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'details', label: 'List Details' },
  { key: 'filters', label: 'Build List' },
  { key: 'confirm', label: 'Confirm' },
]

interface FilterState {
  membership: string
  employer_id: string
  worksite_id: string
  roles: string[]
  occupations: string[]
}

const DEFAULT_FILTERS: FilterState = {
  membership: 'all',
  employer_id: '',
  worksite_id: '',
  roles: [],
  occupations: [],
}

export default function NewEmailListPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const campaignId = params.id as string

  const draftId = useMemo(() => {
    const raw = searchParams.get('draft_id')
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }, [searchParams])

  const entryBranch = searchParams.get('entry_branch') || undefined
  const pathway = searchParams.get('pathway') || undefined
  const backHref = searchParams.get('returnTo')
    ? decodeURIComponent(searchParams.get('returnTo')!)
    : `/campaigns/${campaignId}/email/setup/order`

  // Existing-list picker mode toggle (parallel to phone). Only meaningful
  // when we have a draft_id in scope.
  const [listMode, setListMode] = useState<'new' | 'existing'>('new')
  const [pickedListId, setPickedListId] = useState<number | null>(null)
  const [isAttachingExisting, setIsAttachingExisting] = useState(false)

  const [step, setStep] = useState<WizardStep>('details')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)

  const [createdListId, setCreatedListId] = useState<number | null>(null)
  const [populateResult, setPopulateResult] = useState<{
    added: number
    skipped_no_email?: number
  } | null>(null)
  const [previewCount, setPreviewCount] = useState<{ total: number; withEmail: number } | null>(
    null,
  )
  const [previewLoading, setPreviewLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // Existing email lists for this campaign
  const { data: existingLists = [] } = useQuery({
    queryKey: ['campaign-existing-email-lists', campaignId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('email_lists')
        .select('list_id, name, description, status, total_items, created_at')
        .eq('campaign_id', parseInt(campaignId))
        .in('status', ['draft', 'active', 'paused'])
        .order('created_at', { ascending: false })
      return (data ?? []) as Array<{
        list_id: number
        name: string
        description: string | null
        status: string
        total_items: number | null
        created_at: string
      }>
    },
    enabled: !!campaignId,
  })

  // Campaign-scoped employers
  const { data: employers = [] } = useQuery({
    queryKey: ['campaign-employers', campaignId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('campaign_worker_membership')
        .select(
          'workers!inner(employer_id, employers!inner(employer_id, employer_name))',
        )
        .eq('campaign_id', parseInt(campaignId))
      if (!data) return []
      const seen = new Set<number>()
      const result: { employer_id: number; employer_name: string }[] = []
      for (const row of data) {
        const w = row.workers as unknown as {
          employer_id: number | null
          employers: { employer_id: number; employer_name: string } | null
        }
        if (w?.employers && w.employer_id && !seen.has(w.employer_id)) {
          seen.add(w.employer_id)
          result.push({
            employer_id: w.employers.employer_id,
            employer_name: w.employers.employer_name,
          })
        }
      }
      return result.sort((a, b) => a.employer_name.localeCompare(b.employer_name))
    },
    enabled: !!campaignId,
  })

  // Campaign-scoped worksites
  const { data: worksites = [] } = useQuery({
    queryKey: ['campaign-worksites', campaignId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('campaign_worker_membership')
        .select(
          'workers!inner(worksite_id, worksites!inner(worksite_id, worksite_name))',
        )
        .eq('campaign_id', parseInt(campaignId))
      if (!data) return []
      const seen = new Set<number>()
      const result: { worksite_id: number; worksite_name: string }[] = []
      for (const row of data) {
        const w = row.workers as unknown as {
          worksite_id: number | null
          worksites: { worksite_id: number; worksite_name: string } | null
        }
        if (w?.worksites && w.worksite_id && !seen.has(w.worksite_id)) {
          seen.add(w.worksite_id)
          result.push({
            worksite_id: w.worksites.worksite_id,
            worksite_name: w.worksites.worksite_name,
          })
        }
      }
      return result.sort((a, b) => a.worksite_name.localeCompare(b.worksite_name))
    },
    enabled: !!campaignId,
  })

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

  // Live preview — same /list-builder endpoint, count workers with email.
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
      if (filters.occupations.length > 0)
        url.searchParams.set('occupation', filters.occupations.join(','))

      const res = await fetchApi(url.toString())
      const json = await res.json()
      if (json.success) {
        const workers = json.data as Array<{ email: string | null }>
        setPreviewCount({
          total: workers.length,
          withEmail: workers.filter((w) => w.email && w.email.trim() !== '').length,
        })
      }
    } catch {
      setPreviewCount(null)
    } finally {
      setPreviewLoading(false)
    }
  }, [
    campaignId,
    filters.membership,
    filters.employer_id,
    filters.worksite_id,
    filters.roles,
    filters.occupations,
  ])

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

  async function handleAttachExistingList() {
    if (!pickedListId || !draftId) {
      toast.error('Pick a list to attach.')
      return
    }
    setIsAttachingExisting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('campaign_comms_drafts')
        .update({ email_list_id: pickedListId })
        .eq('draft_id', draftId)
      if (error) throw error

      // Back-link the list to this draft (1:1).
      await supabase
        .from('email_lists')
        .update({ draft_id: draftId })
        .eq('list_id', pickedListId)

      toast.success('Existing list attached')

      const here = encodeURIComponent(window.location.pathname + window.location.search)
      const qs = new URLSearchParams({ draft_id: String(draftId) })
      if (entryBranch) qs.set('entry_branch', entryBranch)
      if (pathway) qs.set('pathway', pathway)
      qs.set('returnTo', here)
      router.push(`/campaigns/${campaignId}/email/wizard?${qs.toString()}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to attach existing list')
    } finally {
      setIsAttachingExisting(false)
    }
  }

  async function handleCreate() {
    if (!draftId) {
      toast.error('Missing draft context — open the email setup wizard again.')
      return
    }
    if (!user) {
      toast.error('You must be signed in.')
      return
    }
    setIsCreating(true)
    try {
      const supabase = createClient()

      const sourceFilters = {
        membership: filters.membership !== 'all' ? filters.membership : undefined,
        employer_id: filters.employer_id || undefined,
        worksite_id: filters.worksite_id || undefined,
        roles: filters.roles.length > 0 ? filters.roles : undefined,
        occupations: filters.occupations.length > 0 ? filters.occupations : undefined,
      }

      const { data: list, error: insertErr } = await supabase
        .from('email_lists')
        .insert({
          campaign_id: Number(campaignId),
          draft_id: draftId,
          name,
          description: description || null,
          status: 'draft',
          source_filters: sourceFilters,
          created_by: user.id,
        })
        .select('list_id')
        .single()
      if (insertErr) throw insertErr
      const listId = list!.list_id
      setCreatedListId(listId)

      const populateRes = await fetchApi(
        `/api/campaigns/${campaignId}/email-lists/${listId}/populate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters: sourceFilters }),
        },
      )
      if (populateRes.ok) {
        const result = await populateRes.json()
        setPopulateResult(result)
        toast.success(`Email list created with ${result.added} recipients`)
      } else {
        toast.success('Email list created (no contacts matched filters)')
      }

      const { error: linkErr } = await supabase
        .from('campaign_comms_drafts')
        .update({ email_list_id: listId })
        .eq('draft_id', draftId)
      if (linkErr) throw linkErr

      setStep('confirm')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create list')
    } finally {
      setIsCreating(false)
    }
  }

  function handleContinueToWizard() {
    if (!draftId) return
    const here = encodeURIComponent(window.location.pathname + window.location.search)
    const qs = new URLSearchParams({ draft_id: String(draftId) })
    if (entryBranch) qs.set('entry_branch', entryBranch)
    if (pathway) qs.set('pathway', pathway)
    qs.set('returnTo', here)
    router.push(`/campaigns/${campaignId}/email/wizard?${qs.toString()}`)
  }

  function handleHeaderBack() {
    if (listMode === 'new' && stepIndex > 0) {
      goBack()
      return
    }
    router.push(backHref)
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={handleHeaderBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">
            {listMode === 'existing' ? 'Attach an email list' : 'Create email recipient list'}
          </h2>
          {listMode === 'new' && (
            <p className="text-sm text-muted-foreground">
              Step {stepIndex + 1} of {STEPS.length}: {STEPS[stepIndex].label}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/campaigns/${campaignId}/email/import`}>
            <Upload className="h-4 w-4 mr-1" />
            Import recipients
          </Link>
        </Button>
      </div>

      {draftId != null && (
        <div className="inline-flex rounded-md border bg-background p-0.5">
          <Button
            type="button"
            size="sm"
            variant={listMode === 'new' ? 'default' : 'ghost'}
            className="h-8 px-3 text-xs"
            onClick={() => setListMode('new')}
            aria-pressed={listMode === 'new'}
          >
            Build new list
          </Button>
          <Button
            type="button"
            size="sm"
            variant={listMode === 'existing' ? 'default' : 'ghost'}
            className="h-8 px-3 text-xs"
            onClick={() => setListMode('existing')}
            aria-pressed={listMode === 'existing'}
          >
            Use existing list
          </Button>
        </div>
      )}

      {draftId != null && listMode === 'existing' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              Pick an existing email list
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {existingLists.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No draft, active, or paused email lists exist for this campaign yet.
                Switch to &ldquo;Build new list&rdquo; to create one.
              </p>
            ) : (
              <>
                <div className="space-y-1">
                  <Label>Email list</Label>
                  <Select
                    value={pickedListId != null ? String(pickedListId) : ''}
                    onValueChange={(v) => setPickedListId(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an email list…" />
                    </SelectTrigger>
                    <SelectContent>
                      {existingLists.map((l) => (
                        <SelectItem key={l.list_id} value={String(l.list_id)}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate max-w-[260px]">{l.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {l.status}
                            </Badge>
                            {l.total_items != null && (
                              <span className="text-xs text-muted-foreground">
                                {l.total_items} recipients
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => router.push(backHref)}
                    disabled={isAttachingExisting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAttachExistingList}
                    disabled={!pickedListId || isAttachingExisting}
                  >
                    {isAttachingExisting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Attaching…
                      </>
                    ) : (
                      'Attach list and continue'
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {listMode === 'new' && (
        <>
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center flex-1">
                <div
                  className={`flex-1 h-1 rounded-full ${
                    i <= stepIndex ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              </div>
            ))}
          </div>
          <Progress value={progress} className="h-1.5 -mt-4" />

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
                    placeholder="e.g. Stage 1 Email — Non-members"
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
                <p className="text-xs text-muted-foreground">
                  Recipients are sent in the order they appear (sequential). You can edit
                  the order in the wizard before pushing to Action Network.
                </p>
                <div className="flex justify-end">
                  <Button onClick={goNext} disabled={!name.trim()}>
                    Next
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 'filters' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Build the list
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="text-sm text-muted-foreground">
                  Only workers with email addresses will be added. Use filters to narrow
                  the list.
                </p>

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
                      onChange={(values) =>
                        setFilters((f) => ({ ...f, occupations: values }))
                      }
                      compact
                      placeholder="Any occupation"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Employer</Label>
                    <Select
                      value={filters.employer_id || '__all__'}
                      onValueChange={(v) =>
                        setFilters((f) => ({
                          ...f,
                          employer_id: v === '__all__' ? '' : v,
                          worksite_id: '',
                        }))
                      }
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
                      onValueChange={(v) =>
                        setFilters((f) => ({ ...f, worksite_id: v === '__all__' ? '' : v }))
                      }
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

                {roleTypes.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Organising Role (select multiple)</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {roleTypes.map((r) => (
                        <button
                          key={r.role_name}
                          onClick={() =>
                            setFilters((f) => ({
                              ...f,
                              roles: f.roles.includes(r.role_name)
                                ? f.roles.filter((x) => x !== r.role_name)
                                : [...f.roles, r.role_name],
                            }))
                          }
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

                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border text-sm">
                  {previewLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : previewCount ? (
                    <>
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>
                        <strong>{previewCount.total}</strong> workers match
                        {' · '}
                        <strong className="text-green-700">{previewCount.withEmail}</strong>{' '}
                        have email addresses
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      Calculating list size…
                    </span>
                  )}
                </div>

                <div className="flex justify-between">
                  <Button variant="outline" onClick={goBack}>
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Back
                  </Button>
                  <Button onClick={handleCreate} disabled={isCreating}>
                    {isCreating ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : null}
                    Create email list
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 'confirm' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Email list created
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  <p>
                    <strong>Name:</strong> {name}
                  </p>
                  {populateResult && (
                    <>
                      <p>
                        <strong>Recipients added:</strong> {populateResult.added}
                      </p>
                      {populateResult.skipped_no_email !== undefined &&
                        populateResult.skipped_no_email > 0 && (
                          <p className="text-muted-foreground text-xs">
                            {populateResult.skipped_no_email} workers skipped (no email on
                            record)
                          </p>
                        )}
                    </>
                  )}
                </div>
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  <strong>Next step:</strong> Draft the email body and review recipients
                  before pushing to Action Network.
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleContinueToWizard}>
                    <Mail className="h-4 w-4 mr-1" />
                    Continue to email
                  </Button>
                  {createdListId && (
                    <Button
                      variant="outline"
                      onClick={() => router.push(`/campaigns/${campaignId}`)}
                    >
                      Back to campaign
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
