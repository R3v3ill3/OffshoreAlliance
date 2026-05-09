'use client'

import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { useGenerateDraft } from '@/lib/hooks/useGenerateDraft'
import { fetchApi, API_FETCH_TIMEOUT_LLM_MS } from '@/lib/api/fetch-api'
import { STAGE_NAMES } from '@/types/planner-types'
import type { CommsDraftRequest } from '@/types/planner-types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CallOutcomeEditor } from '@/components/phone/CallOutcomeEditor'
import { CallScriptEditor, createEmptyEditableSection } from '@/components/phone/CallScriptEditor'
import type { EditableSection } from '@/components/phone/CallScriptEditor'
import { cn } from '@/lib/utils/cn'
import { toast } from 'sonner'
import {
  Building2,
  Target,
  FileText,
  Phone,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CheckCircle,
  Loader2,
  Sparkles,
  PenLine,
  Users,
  Search,
  ChevronDown,
  ChevronsUpDown,
  PlayCircle,
  GitBranch,
  AlertCircle,
  ListChecks,
  MessageSquareQuote,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { CallCtaAmbitionsEditor } from '@/components/phone/setup/CallCtaAmbitionsEditor'
import { ObjectionsEditor } from '@/components/phone/setup/ObjectionsEditor'
import { IssueIdentificationEditor } from '@/components/phone/setup/IssueIdentificationEditor'
import type { CallCtaAmbition, SelectedObjection, ExpectedIssue, TopIssueForSeeding } from '@/components/phone/setup/types'

interface WorkerPreview {
  worker_id: number
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  occupation: string | null
  employer_name: string | null
  worksite_name: string | null
  membership_status?: string | null
  union_membership_type_name?: string | null
  non_oa_union_badge_initials?: string | null
  organising_role?: string | null
  cumulative_rating?: number | null
  last_activity_rating?: number | null
}

type SortCol = 'name' | 'phone' | 'occupation' | 'membership_status' | 'organising_role' | 'cumulative_rating' | 'last_activity_rating'
type SortDir = 'asc' | 'desc'

/** When a query is disabled, `data` is undefined; `?? []` in render would allocate a new array every render and break memo/effect deps (infinite updates — React #185). */
const EMPTY_WORKER_LIST: WorkerPreview[] = []
type WizardCampaignRow = { campaign_id: number; name: string; organiser_id: number | null }
const EMPTY_WIZARD_CAMPAIGNS: WizardCampaignRow[] = []
type EmployerRow = { employer_id: number; employer_name: string }
const EMPTY_EMPLOYERS: EmployerRow[] = []
type WorksiteRow = { worksite_id: number; worksite_name: string }
const EMPTY_WORKSITES: WorksiteRow[] = []
type WorkerRatingRow = { worker_id: number; cumulative_rating: number | null; last_activity_rating: number | null }
const EMPTY_WORKER_RATINGS: WorkerRatingRow[] = []

function membershipBadgesCampaign(w: WorkerPreview): ReactNode {
  const ms = w.membership_status
  if (!ms) return '—'
  if (ms === 'member_pending') {
    return (
      <Badge variant="outline" className="text-[10px] py-0">
        Member – pending
      </Badge>
    )
  }
  if (ms === 'non_member') {
    return (
      <Badge variant="secondary" className="text-[10px] py-0">
        Non-member
      </Badge>
    )
  }
  if (ms === 'member') {
    if (w.union_membership_type_name === 'non_oa_member') {
      const initials = w.non_oa_union_badge_initials?.trim()
      return (
        <span className="inline-flex flex-wrap items-center gap-1">
          <Badge variant="secondary" className="text-[10px] py-0">
            Other union
          </Badge>
          {initials ? (
            <Badge variant="outline" className="text-[10px] py-0 font-mono">
              {initials}
            </Badge>
          ) : null}
        </span>
      )
    }
    return (
      <Badge variant="default" className="text-[10px] py-0">
        Member
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-[10px] py-0">
      {ms}
    </Badge>
  )
}

const RATING_BANDS = [
  { key: 'unrated', label: 'Unrated', test: (v: number | null | undefined) => v == null },
  { key: 'low',    label: '< 2',     test: (v: number | null | undefined) => v != null && v < 2 },
  { key: 'mid',    label: '2–3',     test: (v: number | null | undefined) => v != null && v >= 2 && v < 3 },
  { key: 'high',   label: '3+',      test: (v: number | null | undefined) => v != null && v >= 3 },
]

/** Matches list-builder `membership_status` buckets for campaign workers. */
const CAMPAIGN_MEMBERSHIP_BUCKETS = [
  { key: 'member', label: 'Member' },
  { key: 'member_pending', label: 'Member – pending' },
  { key: 'non_member', label: 'Non-member' },
] as const

type SegmentVariable = 'membership_status' | 'organising_role' | 'occupation' | 'rating_band'

interface ScriptVariation {
  segmentKey: string
  segmentLabel: string
  scriptText: string
  scriptTitle: string
  savedScriptId: number | null
  isGenerating: boolean
  error: string | null
  listId: number | null
}

const STEPS = [
  { id: 1, title: 'Campaign Context', icon: Building2 },
  { id: 2, title: 'Tone & Audience', icon: Target },
  { id: 3, title: 'Create Script', icon: FileText },
  { id: 4, title: 'Script Variations', icon: GitBranch },
  { id: 5, title: 'CTA Ambitions & Objections', icon: ListChecks },
  { id: 6, title: 'Build List & Call', icon: Phone },
]

const TONE_OPTIONS = [
  { key: 'informative', label: 'Informative' },
  { key: 'urgency', label: 'Urgency' },
  { key: 'shared_responsibility', label: 'Shared Responsibility' },
  { key: 'success_story', label: 'Success Story' },
  { key: 'solidarity', label: 'Solidarity' },
  { key: 'fairness', label: 'Fairness' },
  { key: 'worker_voice', label: 'Worker Voice' },
  { key: 'job_security', label: 'Job Security' },
]

const AUDIENCE_OPTIONS = [
  { key: 'existing_members', label: 'Existing Members' },
  { key: 'lapsed_members', label: 'Lapsed Members' },
  { key: 'non_members_known', label: 'Non-Members (Known)' },
  { key: 'non_members_unknown', label: 'Non-Members (Unknown)' },
  { key: 'all_workers', label: 'All Workers' },
  { key: 'bargaining_reps', label: 'Bargaining Reps' },
  { key: 'hsrs', label: 'HSRs' },
  { key: 'delegates', label: 'Delegates' },
]

const INTENSITY_OPTIONS = [
  { key: 'low', label: 'Low — Informational' },
  { key: 'medium', label: 'Medium — Engaging' },
  { key: 'high', label: 'High — Mobilising' },
]

interface PhoneWizardState {
  campaignId: number | null
  stageNumber: number | null
  callPurpose: string
  campaignName: string
  employerName: string
  agreementName: string
  worksiteNames: string[]
  organiserName: string
  organiserPhone: string
  standaloneEmployerId: number | null
  standaloneWorksiteId: number | null
  tone: string[]
  audience: string[]
  engagementIntensity: string
  scriptText: string
  scriptTitle: string
  savedScriptId: number | null
  listName: string
  savedListId: number | null
  listPopulated: boolean
}

const INITIAL_STATE: PhoneWizardState = {
  campaignId: null,
  stageNumber: null,
  callPurpose: '',
  campaignName: '',
  employerName: '',
  agreementName: '',
  worksiteNames: [],
  organiserName: '',
  organiserPhone: '',
  standaloneEmployerId: null,
  standaloneWorksiteId: null,
  tone: [],
  audience: [],
  engagementIntensity: '',
  scriptText: '',
  scriptTitle: '',
  savedScriptId: null,
  listName: '',
  savedListId: null,
  listPopulated: false,
}

export function PhoneWizardSteps() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { user, profile } = useAuth()
  const [step, setStep] = useState(1)
  const [state, setState] = useState<PhoneWizardState>(INITIAL_STATE)
  const [isSavingScript, setIsSavingScript] = useState(false)
  /** Segmented script for step 3; null until AI generate or “write from scratch”. */
  const [wizardSections, setWizardSections] = useState<EditableSection[] | null>(null)

  const handleWizardSectionsChange = useCallback((sections: EditableSection[]) => {
    setWizardSections(sections)
    const joined = sections.map((s) => s.body_text).join('\n\n')
    setState((prev) => ({
      ...prev,
      scriptText: joined,
      savedScriptId: null,
    }))
  }, [])
  const [isCreatingList, setIsCreatingList] = useState(false)
  const [workerSearch, setWorkerSearch] = useState('')
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<number>>(new Set())
  const [workersInitialized, setWorkersInitialized] = useState(false)
  const [additionalWorkers, setAdditionalWorkers] = useState<WorkerPreview[]>([])
  const [workerSources, setWorkerSources] = useState<Record<number, string>>({})
  const [addSearch, setAddSearch] = useState('')
  const [addSearchDebounced, setAddSearchDebounced] = useState('')
  const [showIndividualAdd, setShowIndividualAdd] = useState(false)
  const [showBulkAdd, setShowBulkAdd] = useState(false)
  const [addFilterEmployerId, setAddFilterEmployerId] = useState<number | null>(null)
  const [addFilterWorksiteId, setAddFilterWorksiteId] = useState<number | null>(null)
  const [addFilterOccupation, setAddFilterOccupation] = useState('')

  // Sorting
  const [sortCol, setSortCol] = useState<SortCol | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Bulk select by value
  const [showBulkSelect, setShowBulkSelect] = useState(false)
  const [bulkSelectOccupation, setBulkSelectOccupation] = useState('')
  const [bulkSelectRole, setBulkSelectRole] = useState('')

  // Step 5: CTA ambitions, objections, issues
  const [ctaAmbitions, setCtaAmbitions] = useState<CallCtaAmbition[]>([])
  const [selectedObjections, setSelectedObjections] = useState<SelectedObjection[]>([])
  const [expectedIssues, setExpectedIssues] = useState<ExpectedIssue[]>([])
  const [showCtaCollapsible, setShowCtaCollapsible] = useState(false)
  const [isPersistingStep5, setIsPersistingStep5] = useState(false)

  // Script variations (step 4)
  const [useVariations, setUseVariations] = useState(false)
  const [segmentVariable, setSegmentVariable] = useState<SegmentVariable | null>(null)
  const [enabledSegments, setEnabledSegments] = useState<Set<string>>(new Set())
  const [variations, setVariations] = useState<ScriptVariation[]>([])
  const [savingVariationKey, setSavingVariationKey] = useState<string | null>(null)
  const [isCreatingSegmentLists, setIsCreatingSegmentLists] = useState(false)
  const [createBaseListForUnmatched, setCreateBaseListForUnmatched] = useState(false)

  // Step 6: choose between creating a new list or linking to an existing one.
  const [listMode, setListMode] = useState<'new' | 'existing'>('new')
  const [existingListId, setExistingListId] = useState<number | null>(null)
  const [existingLists, setExistingLists] = useState<Array<{ list_id: number; name: string; total_items: number; previously_linked?: boolean; is_current_for_script?: boolean }>>([])
  const [existingListsLoading, setExistingListsLoading] = useState(false)

  // Step 3: SOC seeding — pre-populate the script from a Structured
  // Organising Conversation that's been locked for this campaign (and
  // ideally this stage). The locked content of each SOC stage maps onto
  // a phone-script section_type so the organiser gets a structured
  // starting point instead of a blank or single-blob AI draft.
  const [selectedSocSessionId, setSelectedSocSessionId] = useState<number | null>(null)

  const generateDraft = useGenerateDraft()

  // Pre-fill from URL params: ?campaign_id=123.
  // When no campaign_id is provided, fall back to the standing campaign
  // so every script and call list is always associated with a campaign.
  useEffect(() => {
    async function prefillCampaign(campaignId: number) {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('campaign_id, name, campaign_stage_plans(stage_number, status)')
        .eq('campaign_id', campaignId)
        .single()
      if (!campaign) return
      const activeStage = (campaign.campaign_stage_plans as Array<{ stage_number: number; status: string }> | null)
        ?.find((s) => s.status === 'active')
      setState((prev) => ({
        ...prev,
        campaignId,
        campaignName: campaign.name,
        stageNumber: activeStage?.stage_number ?? null,
      }))
    }

    async function loadStandingCampaign() {
      const { data } = await supabase
        .from('campaigns')
        .select('campaign_id, name')
        .eq('is_standing', true)
        .single()
      if (data) {
        setState((prev) => ({
          ...prev,
          campaignId: data.campaign_id,
          campaignName: data.name,
        }))
      }
    }

    const campaignIdParam = searchParams.get('campaign_id')
    if (campaignIdParam) {
      const campaignId = parseInt(campaignIdParam, 10)
      if (Number.isFinite(campaignId)) void prefillCampaign(campaignId)
    } else {
      void loadStandingCampaign()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setAddSearchDebounced(addSearch.trim()), 400)
    return () => clearTimeout(t)
  }, [addSearch])

  // Reset list state when context changes
  useEffect(() => {
    setWorkersInitialized(false)
    setAdditionalWorkers([])
    setWorkerSources({})
    setAddSearch('')
    setAddSearchDebounced('')
    setAddFilterEmployerId(null)
    setAddFilterWorksiteId(null)
    setAddFilterOccupation('')
  }, [state.campaignId])

  // Campaign list
  const { data: campaignsData } = useQuery({
    queryKey: ['wizard-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('campaign_id, name, organiser_id')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as WizardCampaignRow[]
    },
    enabled: !!user,
  })
  const campaigns = campaignsData ?? EMPTY_WIZARD_CAMPAIGNS

  // Campaign context enrichment
  useQuery({
    queryKey: ['phone-wizard-campaign-context', state.campaignId],
    queryFn: async () => {
      if (!state.campaignId) return null
      const campaign = campaigns.find((c) => c.campaign_id === state.campaignId)
      if (!campaign) return null

      let agreementName = ''
      let employerName = ''
      const { data: timeline } = await supabase
        .from('campaign_timelines')
        .select('agreement_id')
        .eq('campaign_id', state.campaignId)
        .maybeSingle()
      if (timeline?.agreement_id) {
        const { data: agreement } = await supabase
          .from('agreements')
          .select('agreement_name, employer_id')
          .eq('agreement_id', timeline.agreement_id)
          .single()
        agreementName = agreement?.agreement_name ?? ''
        if (agreement?.employer_id) {
          const { data: employer } = await supabase
            .from('employers')
            .select('employer_name')
            .eq('employer_id', agreement.employer_id)
            .single()
          employerName = employer?.employer_name ?? ''
        }
      }

      let organiserName = ''
      let organiserPhone = ''
      if (campaign.organiser_id) {
        const { data: org } = await supabase
          .from('organisers')
          .select('organiser_name, phone')
          .eq('organiser_id', campaign.organiser_id)
          .single()
        organiserName = org?.organiser_name ?? ''
        organiserPhone = org?.phone ?? ''
      }

      const { data: wsLinks } = await supabase
        .from('campaign_worksites')
        .select('worksites(worksite_name)')
        .eq('campaign_id', state.campaignId)
      const worksiteNames = (wsLinks ?? [])
        .map((r: Record<string, unknown>) => (r.worksites as { worksite_name: string } | null)?.worksite_name)
        .filter(Boolean) as string[]

      setState((prev) => ({
        ...prev,
        campaignName: campaign.name,
        employerName,
        agreementName,
        worksiteNames,
        organiserName,
        organiserPhone,
      }))
      return null
    },
    enabled: !!state.campaignId && campaigns.length > 0,
  })

  // Employers for the "add workers" filter in step 6
  const { data: allEmployersData } = useQuery({
    queryKey: ['wizard-employers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employers')
        .select('employer_id, employer_name')
        .order('employer_name')
      if (error) throw error
      return (data ?? []) as EmployerRow[]
    },
    enabled: !!user && step >= 4,
  })
  const allEmployers = allEmployersData ?? EMPTY_EMPLOYERS

  // Worker list for step 4 — always fetched via the campaign's list-builder endpoint
  const { data: workerListData, isLoading: workersLoading } = useQuery({
    queryKey: ['phone-wizard-worker-list', state.campaignId],
    queryFn: async (): Promise<WorkerPreview[]> => {
      if (!state.campaignId) return []
      const res = await fetchApi(`/api/campaigns/${state.campaignId}/list-builder`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      return (json.data as WorkerPreview[]).map((row) => ({
        ...row,
        phone: row.phone ?? null,
        membership_status: row.membership_status ?? null,
        union_membership_type_name: row.union_membership_type_name ?? null,
        non_oa_union_badge_initials: row.non_oa_union_badge_initials ?? null,
        organising_role: row.organising_role ?? null,
      }))
    },
    enabled: step >= 4 && !!state.campaignId,
  })
  const workerList = workerListData ?? EMPTY_WORKER_LIST

  // Supplementary ratings query — campaign mode only
  const { data: workerRatingsData } = useQuery({
    queryKey: ['phone-wizard-ratings', state.campaignId],
    queryFn: async () => {
      const { data } = await supabase
        .from('campaign_worker_rating_summary')
        .select('worker_id, cumulative_rating, last_activity_rating')
        .eq('campaign_id', state.campaignId!)
      return (data ?? []) as WorkerRatingRow[]
    },
    enabled: step >= 4 && !!state.campaignId,
    staleTime: 60_000,
  })
  const workerRatings = workerRatingsData ?? EMPTY_WORKER_RATINGS

  const ratingsMap = useMemo(() => {
    const m = new Map<number, { cumulative_rating: number | null; last_activity_rating: number | null }>()
    for (const r of workerRatings) {
      m.set(r.worker_id, { cumulative_rating: r.cumulative_rating ?? null, last_activity_rating: r.last_activity_rating ?? null })
    }
    return m
  }, [workerRatings])

  const combinedWorkers = useMemo(() => {
    const map = new Map<number, WorkerPreview>()
    for (const w of workerList) map.set(w.worker_id, w)
    for (const w of additionalWorkers) {
      if (!map.has(w.worker_id)) map.set(w.worker_id, w)
    }
    return [...map.values()].map((w) => {
      const rating = ratingsMap.get(w.worker_id)
      return {
        ...w,
        cumulative_rating: rating?.cumulative_rating ?? w.cumulative_rating ?? null,
        last_activity_rating: rating?.last_activity_rating ?? w.last_activity_rating ?? null,
      }
    })
  }, [workerList, additionalWorkers, ratingsMap])

  // Auto-select workers with phone on first load
  useEffect(() => {
    if (step !== 4) return
    if (workersLoading) return
    if (combinedWorkers.length === 0) {
      setSelectedWorkerIds((prev) => (prev.size === 0 ? prev : new Set()))
      return
    }
    if (!workersInitialized) {
      const withPhone = combinedWorkers.filter((w) => w.phone)
      setSelectedWorkerIds(new Set(withPhone.map((w) => w.worker_id)))
      setWorkersInitialized(true)
    }
  }, [step, combinedWorkers, workersLoading, workersInitialized])

  const filteredWorkers = useMemo(() => {
    let list = combinedWorkers
    if (workerSearch.trim()) {
      const q = workerSearch.toLowerCase()
      list = list.filter((w) =>
        `${w.first_name} ${w.last_name}`.toLowerCase().includes(q) ||
        w.phone?.toLowerCase().includes(q) ||
        w.occupation?.toLowerCase().includes(q)
      )
    }
    if (sortCol) {
      list = [...list].sort((a, b) => {
        const mult = sortDir === 'asc' ? 1 : -1
        if (sortCol === 'cumulative_rating' || sortCol === 'last_activity_rating') {
          const av = a[sortCol] ?? null
          const bv = b[sortCol] ?? null
          if (av === null && bv === null) return 0
          if (av === null) return 1   // nulls last
          if (bv === null) return -1
          return mult * (av - bv)
        }
        if (sortCol === 'name') {
          const an = `${a.first_name} ${a.last_name}`
          const bn = `${b.first_name} ${b.last_name}`
          return mult * an.localeCompare(bn)
        }
        const av = (a[sortCol] as string | null | undefined) ?? null
        const bv = (b[sortCol] as string | null | undefined) ?? null
        if (av === null && bv === null) return 0
        if (av === null) return 1
        if (bv === null) return -1
        return mult * av.localeCompare(bv)
      })
    }
    return list
  }, [combinedWorkers, workerSearch, sortCol, sortDir])

  function handleSortClick(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <ChevronsUpDown className="inline h-3 w-3 ml-0.5 text-muted-foreground/50" />
    return sortDir === 'asc'
      ? <ChevronUp className="inline h-3 w-3 ml-0.5" />
      : <ChevronDown className="inline h-3 w-3 ml-0.5" />
  }

  // ── Segment variation helpers ──────────────────────────────────────────

  function getWorkersForSegment(
    workers: WorkerPreview[],
    variable: SegmentVariable,
    segmentKey: string,
  ): WorkerPreview[] {
    switch (variable) {
      case 'membership_status': return workers.filter((w) => w.membership_status === segmentKey)
      case 'organising_role':   return workers.filter((w) => w.organising_role === segmentKey)
      case 'occupation':        return workers.filter((w) => w.occupation === segmentKey)
      case 'rating_band': {
        const band = RATING_BANDS.find((b) => b.key === segmentKey)
        return band ? workers.filter((w) => band.test(w.cumulative_rating)) : []
      }
    }
  }

  const availableSegments = useMemo((): { key: string; label: string }[] => {
    if (!segmentVariable) return []
    switch (segmentVariable) {
      case 'membership_status':
        return CAMPAIGN_MEMBERSHIP_BUCKETS.map((b) => ({
          key: b.key,
          label: b.key === 'member' ? 'Members' : b.key === 'non_member' ? 'Non-members' : b.label,
        }))
      case 'rating_band':
        return RATING_BANDS.map((b) => ({ key: b.key, label: b.label }))
      case 'organising_role': {
        const roles = [...new Set(combinedWorkers.map((w) => w.organising_role).filter(Boolean))] as string[]
        return roles.sort().map((r) => ({ key: r, label: r }))
      }
      case 'occupation': {
        const occs = [...new Set(combinedWorkers.map((w) => w.occupation).filter(Boolean))] as string[]
        return occs.sort().map((o) => ({ key: o, label: o }))
      }
    }
  }, [segmentVariable, combinedWorkers])

  // When available segments change, reset enabledSegments to all
  useEffect(() => {
    const keys = availableSegments.map((s) => s.key)
    const sig = keys.slice().sort().join('|')
    setEnabledSegments((prev) => {
      const prevSig = [...prev].sort().join('|')
      if (prevSig === sig) return prev
      return new Set(keys)
    })
    setVariations((prev) => (prev.length === 0 ? prev : []))
  }, [availableSegments])

  const generatingCount = variations.filter((v) => v.isGenerating).length

  async function handleGenerateVariation(variation: ScriptVariation) {
    setVariations((prev) => prev.map((v) =>
      v.segmentKey === variation.segmentKey ? { ...v, isGenerating: true, error: null } : v
    ))
    try {
      const stageName = state.stageNumber
        ? STAGE_NAMES[state.stageNumber as keyof typeof STAGE_NAMES] || `Stage ${state.stageNumber}`
        : 'General'

      const body = {
        platform: 'phone_script' as const,
        campaign_id: state.campaignId || 0,
        plan_id: 0,
        stage_number: state.stageNumber || 1,
        stage_name: stageName,
        campaign_context: {
          employer_name: state.employerName || state.campaignName || 'Employer',
          agreement_name: state.agreementName || '',
          worksite_names: state.worksiteNames,
          sector: '',
          organiser_name: state.organiserName || undefined,
          organiser_phone: state.organiserPhone || undefined,
          staff_name: profile?.display_name || user?.email || undefined,
          staff_email: user?.email || undefined,
        },
        wtp_selections: {
          tone: state.tone,
          audience: state.audience,
          platforms: ['Phone'],
          engagement_intensity: state.engagementIntensity || undefined,
        },
        template_examples: wizardSections?.some((s) => s.body_text.trim())
          ? wizardSections.map((s, i) => ({
              title: s.title?.trim() || `Section ${i + 1}`,
              body_text: s.body_text,
            }))
          : undefined,
        custom_instructions: [
          state.callPurpose ? `Call purpose: ${state.callPurpose}` : '',
          `Generate a TARGETED VARIATION for: ${variation.segmentLabel} workers.`,
          `Keep the same overall structure and call purpose as the reference script (above). Adapt the opening, issues discussed, and ask to resonate specifically with ${variation.segmentLabel}. Do not produce a generic script — start from the reference template.`,
        ].filter(Boolean).join('\n'),
      }

      const res = await fetchApi('/api/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')

      setVariations((prev) => prev.map((v) =>
        v.segmentKey === variation.segmentKey
          ? { ...v, scriptText: data.body_text, isGenerating: false }
          : v
      ))
    } catch (err) {
      setVariations((prev) => prev.map((v) =>
        v.segmentKey === variation.segmentKey
          ? { ...v, isGenerating: false, error: err instanceof Error ? err.message : 'Generation failed' }
          : v
      ))
    }
  }

  async function handleGenerateAllVariations() {
    const enabled = availableSegments.filter((s) => enabledSegments.has(s.key))
    // Build or refresh variation objects for each enabled segment
    setVariations((prev) => {
      const existingMap = new Map(prev.map((v) => [v.segmentKey, v]))
      return enabled.map((seg) => existingMap.get(seg.key) ?? {
        segmentKey: seg.key,
        segmentLabel: seg.label,
        scriptText: '',
        scriptTitle: `${state.scriptTitle || 'Phone Script'} — ${seg.label}`,
        savedScriptId: null,
        isGenerating: false,
        error: null,
        listId: null,
      })
    })
    // Fire all in parallel
    await Promise.all(enabled.map((seg) => {
      const variation: ScriptVariation = {
        segmentKey: seg.key,
        segmentLabel: seg.label,
        scriptText: '',
        scriptTitle: `${state.scriptTitle || 'Phone Script'} — ${seg.label}`,
        savedScriptId: null,
        isGenerating: false,
        error: null,
        listId: null,
      }
      return handleGenerateVariation(variation)
    }))
  }

  async function handleSaveVariation(variation: ScriptVariation) {
    if (!variation.scriptText.trim()) return
    setSavingVariationKey(variation.segmentKey)
    try {
      const url = `/api/campaigns/${state.campaignId}/call-scripts`

      const res = await fetchApi(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: variation.scriptTitle || `${state.scriptTitle || 'Phone Script'} — ${variation.segmentLabel}`,
          call_objective: state.callPurpose || null,
          sections: [{
            sort_order: 0,
            section_type: 'custom',
            title: 'Script',
            body_text: variation.scriptText,
            talking_points: [],
            prompt_text: null,
            expected_outcomes: [],
            is_optional: false,
          }],
          base_script_id: state.savedScriptId || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save script')

      setVariations((prev) => prev.map((v) =>
        v.segmentKey === variation.segmentKey ? { ...v, savedScriptId: data.script_id } : v
      ))
      toast.success(`Saved: ${variation.segmentLabel}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save variation')
    } finally {
      setSavingVariationKey(null)
    }
  }

  async function handleCreateSegmentLists() {
    const dateStr = new Date().toLocaleDateString('en-AU')
    const savedVariations = variations.filter((v) => v.savedScriptId != null && enabledSegments.has(v.segmentKey))
    setIsCreatingSegmentLists(true)
    try {
      for (const variation of savedVariations) {
        const segWorkers = getWorkersForSegment(combinedWorkers, segmentVariable!, variation.segmentKey).filter((w) => w.phone)
        if (segWorkers.length === 0) continue

        const listUrl = `/api/campaigns/${state.campaignId}/call-lists`

        const listRes = await fetchApi(listUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `${variation.segmentLabel} — ${dateStr}`,
            script_id: variation.savedScriptId,
            priority_strategy: 'sequential',
          }),
        })
        const listData = await listRes.json()
        if (!listRes.ok) throw new Error(listData.error || `Failed to create list for ${variation.segmentLabel}`)

        const listId = listData.list_id
        const workerIds = segWorkers.map((w) => w.worker_id)

        const populateRes = await fetchApi(`/api/campaigns/${state.campaignId}/call-lists/${listId}/populate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters: {}, worker_ids: workerIds }),
        })
        const populateData = await populateRes.json()
        if (!populateRes.ok) throw new Error(populateData.error || 'Failed to populate list')

        setVariations((prev) => prev.map((v) =>
          v.segmentKey === variation.segmentKey ? { ...v, listId } : v
        ))
        toast.success(`Created: ${variation.segmentLabel} (${populateData.added} contacts)`)
      }

      // Optionally create a base-script list for unmatched workers
      if (createBaseListForUnmatched && segmentVariable) {
        const matchedIds = new Set(
          savedVariations.flatMap((v) =>
            getWorkersForSegment(combinedWorkers, segmentVariable, v.segmentKey).map((w) => w.worker_id)
          )
        )
        const unmatched = combinedWorkers.filter((w) => w.phone && !matchedIds.has(w.worker_id))
        if (unmatched.length > 0) {
          const listRes = await fetchApi(`/api/campaigns/${state.campaignId}/call-lists`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `General — ${dateStr}`,
              script_id: state.savedScriptId || null,
              priority_strategy: 'sequential',
            }),
          })
          const listData = await listRes.json()
          if (listRes.ok) {
            await fetchApi(`/api/campaigns/${state.campaignId}/call-lists/${listData.list_id}/populate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filters: {}, worker_ids: unmatched.map((w) => w.worker_id) }),
            })
            setState((prev) => ({ ...prev, savedListId: listData.list_id }))
            toast.success(`Created general list (${unmatched.length} contacts)`)
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create lists')
    } finally {
      setIsCreatingSegmentLists(false)
    }
  }

  // Add worker search
  const { data: addSearchResultsData, isFetching: addSearchLoading } = useQuery({
    queryKey: ['phone-wizard-add-worker-search', addSearchDebounced, state.campaignId],
    queryFn: async (): Promise<WorkerPreview[]> => {
      const q = addSearchDebounced
      if (q.length < 3) return []
      const safe = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%')
      const p = `%${safe}%`
      const { data: found, error } = await supabase
        .from('workers')
        .select('worker_id, first_name, last_name, phone, email, occupation, employers(employer_name), worksites(worksite_name)')
        .or(`first_name.ilike.${p},last_name.ilike.${p},email.ilike.${p}`)
        .limit(25)
      if (error) throw error
      const rows = (found ?? []).map((row) => mapWorkerRow(row as Record<string, unknown>))
      if (!state.campaignId) return rows
      const ids = rows.map((w) => w.worker_id)
      if (ids.length === 0) return []
      const { data: mem, error: memErr } = await supabase
        .from('campaign_worker_membership')
        .select('worker_id')
        .eq('campaign_id', state.campaignId)
        .in('worker_id', ids)
      if (memErr) throw memErr
      const allowed = new Set((mem ?? []).map((m) => m.worker_id))
      return rows.filter((w) => allowed.has(w.worker_id))
    },
    enabled: step === 6 && addSearchDebounced.length >= 3,
  })
  const addSearchResults = addSearchResultsData ?? EMPTY_WORKER_LIST

  // Add filter worksites
  const { data: addFilterWorksitesData } = useQuery({
    queryKey: ['phone-wizard-add-filter-worksites', addFilterEmployerId],
    queryFn: async () => {
      if (!addFilterEmployerId) return []
      const { data: ewrRows, error: ewrErr } = await supabase
        .from('employer_worksite_roles')
        .select('worksite_id')
        .eq('employer_id', addFilterEmployerId)
      if (ewrErr) throw ewrErr
      if (!ewrRows?.length) return []
      const { data, error } = await supabase
        .from('worksites')
        .select('worksite_id, worksite_name')
        .in('worksite_id', ewrRows.map((r) => r.worksite_id))
        .order('worksite_name')
      if (error) throw error
      return data ?? []
    },
    enabled: !!user && step === 6 && !!addFilterEmployerId,
  })
  const addFilterWorksites = addFilterWorksitesData ?? EMPTY_WORKSITES

  const combinedIdsKey = combinedWorkers
    .map((w) => w.worker_id)
    .sort((a, b) => a - b)
    .join(',')

  const bulkAddFiltersEnabled =
    step === 6 &&
    showBulkAdd &&
    (!!addFilterEmployerId || !!addFilterWorksiteId || addFilterOccupation.trim().length > 0)

  const { data: bulkNewCount = 0, isFetching: bulkCountLoading } = useQuery({
    queryKey: ['phone-wizard-bulk-new-count', addFilterEmployerId, addFilterWorksiteId, addFilterOccupation, state.campaignId, combinedIdsKey],
    queryFn: async () => {
      let q = supabase
        .from('workers')
        .select('worker_id, first_name, last_name, phone, email, occupation, employers(employer_name), worksites(worksite_name)')
        .limit(500)
      if (addFilterEmployerId) q = q.eq('employer_id', addFilterEmployerId)
      if (addFilterWorksiteId) q = q.eq('worksite_id', addFilterWorksiteId)
      if (addFilterOccupation.trim()) {
        const occ = addFilterOccupation.trim().replace(/%/g, '\\%')
        q = q.ilike('occupation', `%${occ}%`)
      }
      const { data, error } = await q
      if (error) throw error
      let rows = (data ?? []).map((row) => mapWorkerRow(row as Record<string, unknown>))
      if (state.campaignId) {
        const ids = rows.map((w) => w.worker_id)
        if (ids.length === 0) return 0
        const { data: mem, error: memErr } = await supabase
          .from('campaign_worker_membership')
          .select('worker_id')
          .eq('campaign_id', state.campaignId)
          .in('worker_id', ids)
        if (memErr) throw memErr
        const allowed = new Set((mem ?? []).map((m) => m.worker_id))
        rows = rows.filter((w) => allowed.has(w.worker_id))
      }
      const existing = new Set(combinedWorkers.map((w) => w.worker_id))
      return rows.filter((w) => !existing.has(w.worker_id)).length
    },
    enabled: bulkAddFiltersEnabled,
  })

  function mapWorkerRow(r: Record<string, unknown>): WorkerPreview {
    const emp = r.employers as { employer_name: string } | { employer_name: string }[] | null
    const ws = r.worksites as { worksite_name: string } | { worksite_name: string }[] | null
    return {
      worker_id: r.worker_id as number,
      first_name: r.first_name as string,
      last_name: r.last_name as string,
      phone: r.phone as string | null,
      email: r.email as string | null,
      occupation: r.occupation as string | null,
      employer_name: Array.isArray(emp) ? emp[0]?.employer_name ?? null : emp?.employer_name ?? null,
      worksite_name: Array.isArray(ws) ? ws[0]?.worksite_name ?? null : ws?.worksite_name ?? null,
      cumulative_rating: null,
      last_activity_rating: null,
    }
  }

  async function handleAddMatchingWorkers() {
    let q = supabase
      .from('workers')
      .select('worker_id, first_name, last_name, phone, email, occupation, employers(employer_name), worksites(worksite_name)')
      .limit(500)
    if (addFilterEmployerId) q = q.eq('employer_id', addFilterEmployerId)
    if (addFilterWorksiteId) q = q.eq('worksite_id', addFilterWorksiteId)
    if (addFilterOccupation.trim()) {
      const occ = addFilterOccupation.trim().replace(/%/g, '\\%')
      q = q.ilike('occupation', `%${occ}%`)
    }
    const { data, error } = await q
    if (error) { toast.error(error.message); return }
    let rows = (data ?? []).map((row) => mapWorkerRow(row as Record<string, unknown>))
    if (state.campaignId) {
      const ids = rows.map((w) => w.worker_id)
      if (ids.length === 0) { toast.info('No workers match these filters on this campaign.'); return }
      const { data: mem, error: memErr } = await supabase
        .from('campaign_worker_membership')
        .select('worker_id')
        .eq('campaign_id', state.campaignId)
        .in('worker_id', ids)
      if (memErr) { toast.error(memErr.message); return }
      const allowed = new Set((mem ?? []).map((m) => m.worker_id))
      rows = rows.filter((w) => allowed.has(w.worker_id))
    }
    const existing = new Set(combinedWorkers.map((w) => w.worker_id))
    const newRows = rows.filter((w) => !existing.has(w.worker_id))
    if (newRows.length === 0) { toast.info('No new workers to add.'); return }
    const empLabel = allEmployers.find((e) => e.employer_id === addFilterEmployerId)?.employer_name ?? 'Any employer'
    const wsLabel = addFilterWorksites.find((w) => w.worksite_id === addFilterWorksiteId)?.worksite_name ?? (addFilterWorksiteId ? 'Worksite' : 'All worksites')
    const sourceLabel = `Filter: ${empLabel} / ${wsLabel}`
    setAdditionalWorkers((prev) => [...prev, ...newRows])
    setWorkerSources((prev) => {
      const next = { ...prev }
      for (const w of newRows) next[w.worker_id] = sourceLabel
      return next
    })
    setSelectedWorkerIds((prev) => {
      const n = new Set(prev)
      for (const w of newRows) { if (w.phone) n.add(w.worker_id) }
      return n
    })
    toast.success(`Added ${newRows.length} worker${newRows.length === 1 ? '' : 's'}`)
  }

  function handleAddIndividualWorker(w: WorkerPreview) {
    if (combinedWorkers.some((x) => x.worker_id === w.worker_id)) {
      toast.info('Already on the list')
      return
    }
    if (state.campaignId) {
      void (async () => {
        const { data: mem, error } = await supabase
          .from('campaign_worker_membership')
          .select('worker_id')
          .eq('campaign_id', state.campaignId)
          .eq('worker_id', w.worker_id)
          .maybeSingle()
        if (error) { toast.error(error.message); return }
        if (!mem) { toast.error('This worker is not on the selected campaign.'); return }
        appendManualWorker(w)
      })()
      return
    }
    appendManualWorker(w)
  }

  function appendManualWorker(w: WorkerPreview) {
    setAdditionalWorkers((prev) => [...prev, w])
    setWorkerSources((prev) => ({ ...prev, [w.worker_id]: 'Added manually' }))
    setSelectedWorkerIds((prev) => {
      const n = new Set(prev)
      if (w.phone) n.add(w.worker_id)
      return n
    })
    toast.success('Worker added to list')
  }

  async function handleAIGenerate() {
    const stageName = state.stageNumber
      ? STAGE_NAMES[state.stageNumber as keyof typeof STAGE_NAMES] || `Stage ${state.stageNumber}`
      : 'General'

    const request: CommsDraftRequest = {
      campaign_id: state.campaignId || 0,
      plan_id: 0,
      stage_number: state.stageNumber || 1,
      stage_name: stageName,
      platform: 'phone_script',
      campaign_context: {
        employer_name: state.employerName || state.campaignName || 'Employer',
        agreement_name: state.agreementName || '',
        worksite_names: state.worksiteNames,
        sector: '',
        organiser_name: state.organiserName || undefined,
        organiser_phone: state.organiserPhone || undefined,
        staff_name: profile?.display_name || user?.email || undefined,
        staff_email: user?.email || undefined,
      },
      wtp_selections: {
        tone: state.tone,
        audience: state.audience,
        platforms: ['Phone'],
        engagement_intensity: state.engagementIntensity || undefined,
      },
      custom_instructions: state.callPurpose || undefined,
    }
    const result = await generateDraft.mutateAsync(request)
    const defaultTitle = state.campaignName
      ? `Phone Script — ${state.campaignName}`
      : state.employerName
        ? `Phone Script — ${state.employerName}`
        : 'Phone Script'
    setWizardSections([{
      _key: `ai-${Date.now()}`,
      sort_order: 0,
      section_type: 'custom',
      title: 'Script',
      body_text: result.body_text,
      talking_points: [],
      prompt_text: null,
      expected_outcomes: [],
      is_optional: false,
    }])
    setState((prev) => ({
      ...prev,
      scriptText: result.body_text,
      scriptTitle: prev.scriptTitle || defaultTitle,
      savedScriptId: null,
    }))
  }

  // ─── SOC seeding (Step 3) ───────────────────────────────────────────────
  //
  // Maps each of the 8 SOC stages (Introduction → Close) onto a
  // phone-script section_type so the seeded sections feel native to the
  // call flow rather than just dumping locked content into one blob.
  const SOC_STAGE_TO_SECTION_TYPE: Record<number, EditableSection['section_type']> = {
    1: 'opening',
    2: 'introduction',
    3: 'discovery',
    4: 'education',
    5: 'education',
    6: 'ask',
    7: 'objection_handling',
    8: 'close',
  }

  type SocSeedStageRow = {
    stage_number: number
    stage_name: string
    hope_frame: string | null
    locked_content: string
  }

  type SocSeedSession = {
    session_id: number
    title: string
    stage_number: number | null
    status: string
    updated_at: string
    soc_stage_content: SocSeedStageRow[]
  }

  const { data: socSeedSessions = [] } = useQuery<SocSeedSession[]>({
    queryKey: ['phone-wizard-soc-seed', state.campaignId, state.stageNumber],
    queryFn: async () => {
      if (!state.campaignId) return []
      let q = supabase
        .from('soc_sessions')
        .select(
          `session_id, title, stage_number, status, updated_at,
           soc_stage_content(stage_number, stage_name, hope_frame, locked_content)`
        )
        .eq('campaign_id', state.campaignId)
        .order('updated_at', { ascending: false })
      if (state.stageNumber) q = q.eq('stage_number', state.stageNumber)
      const { data, error } = await q
      if (error) throw error
      return ((data ?? []) as unknown as SocSeedSession[]).filter(
        (s) => Array.isArray(s.soc_stage_content) && s.soc_stage_content.length > 0
      )
    },
    enabled: !!state.campaignId,
  })

  function handleSeedFromSoc(sessionId: number) {
    const session = socSeedSessions.find((s) => s.session_id === sessionId)
    if (!session) return

    // Sort by stage number, with Hope frames in a stable order so all
    // three frames stack into a single Hope section.
    const HOPE_ORDER = ['opportunity', 'plan', 'dont_take_lolly']
    const stages = [...session.soc_stage_content].sort((a, b) => {
      if (a.stage_number !== b.stage_number) return a.stage_number - b.stage_number
      const ai = HOPE_ORDER.indexOf(a.hope_frame ?? '')
      const bi = HOPE_ORDER.indexOf(b.hope_frame ?? '')
      return ai - bi
    })

    // Group stage 5 (Hope) frames into a single section body.
    const grouped: Array<{ stage: number; title: string; body: string }> = []
    for (const s of stages) {
      const last = grouped[grouped.length - 1]
      if (s.stage_number === 5 && last?.stage === 5) {
        last.body += `\n\n— ${s.hope_frame ?? ''} —\n${s.locked_content}`
      } else {
        const title = s.stage_number === 5
          ? 'Hope'
          : s.stage_name + (s.hope_frame ? ` — ${s.hope_frame}` : '')
        grouped.push({ stage: s.stage_number, title, body: s.locked_content })
      }
    }

    const seeded: EditableSection[] = grouped.map((g, i) => ({
      _key: `soc-${sessionId}-${i}-${Date.now()}`,
      sort_order: i,
      section_type: SOC_STAGE_TO_SECTION_TYPE[g.stage] ?? 'custom',
      title: g.title,
      body_text: g.body,
      talking_points: [],
      prompt_text: null,
      expected_outcomes: [],
      is_optional: false,
    }))

    setWizardSections(seeded)
    setState((prev) => ({
      ...prev,
      scriptText: seeded.map((s) => s.body_text).join('\n\n'),
      scriptTitle: prev.scriptTitle || `Phone Script — ${session.title}`,
      savedScriptId: null,
    }))
    toast.success(`Seeded ${seeded.length} section${seeded.length !== 1 ? 's' : ''} from SOC`)
  }

  async function handleSaveScript() {
    if (!wizardSections?.some((s) => s.body_text.trim())) return
    setIsSavingScript(true)
    try {
      const sectionPayload = wizardSections.map((s, i) => ({
        sort_order: i,
        section_type: s.section_type || 'custom',
        title: s.title?.trim() || `Section ${i + 1}`,
        body_text: s.body_text || '',
        talking_points: s.talking_points || [],
        prompt_text: s.prompt_text ?? null,
        expected_outcomes: s.expected_outcomes || [],
        is_optional: s.is_optional || false,
      }))

      const res = await fetchApi(`/api/campaigns/${state.campaignId}/call-scripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: state.scriptTitle || 'Phone Script',
          call_objective: state.callPurpose || null,
          sections: sectionPayload,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save script')

      setState((prev) => ({ ...prev, savedScriptId: data.script_id }))
      toast.success('Script saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save script')
    } finally {
      setIsSavingScript(false)
    }
  }

  async function handleProceedFromStep5() {
    setIsPersistingStep5(true)
    try {
      // Persist CTA ambitions if we have a saved script
      if (state.savedScriptId && ctaAmbitions.length > 0) {
        for (const ambition of ctaAmbitions) {
          const { error } = await supabase.from('call_script_cta_ambitions').insert({
            script_id: state.savedScriptId,
            outcome_definition_id: ambition.outcome_definition_id ?? null,
            activity_id: ambition.activity_id ?? null,
            cta_label: ambition.cta_label,
            target_response: ambition.target_response ?? null,
            target_min_rating: ambition.target_min_rating ?? null,
            target_binary: ambition.target_binary ?? null,
            target_support_level: ambition.target_support_level ?? null,
            min_call_threshold_pct: ambition.min_call_threshold_pct ?? null,
            notes: ambition.notes ?? null,
          })
          if (error) throw error
        }
        toast.success(`${ctaAmbitions.length} CTA ambition${ctaAmbitions.length !== 1 ? 's' : ''} saved`)
      }

      // Seed top issues if campaign has no current situation analysis
      if (state.campaignId && expectedIssues.length > 0) {
        const seedPayload: TopIssueForSeeding[] = expectedIssues.map((i) => ({
          label: i.issue_label,
          heat: i.heat,
          notes: i.notes,
        }))
        const { error } = await supabase.rpc('seed_campaign_top_issues_from_call', {
          p_campaign_id: state.campaignId,
          p_issues: seedPayload,
        })
        if (error) console.warn('seed_campaign_top_issues_from_call:', error.message)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save setup data')
    } finally {
      setIsPersistingStep5(false)
      setStep(6)
    }
  }

  async function handleCreateListAndCall() {
    if (selectedWorkerIds.size === 0) {
      toast.error('Select at least one worker to call')
      return
    }

    const linkingToExisting =
      listMode === 'existing' && state.campaignId && existingListId != null

    setIsCreatingList(true)
    try {
      let listId: number

      if (linkingToExisting) {
        listId = existingListId!
        // Make sure the selected script is linked (as current wave) to the list.
        if (state.savedScriptId) {
          const linkRes = await fetchApi(
            `/api/campaigns/${state.campaignId}/call-lists/${listId}/link-script`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                script_id: state.savedScriptId,
                set_current: true,
              }),
            }
          )
          if (!linkRes.ok) {
            const err = await linkRes.json().catch(() => ({ error: 'Failed' }))
            throw new Error(err.error || 'Failed to link script to list')
          }
        }
      } else {
        const listName = state.listName.trim() || `Call list — ${new Date().toLocaleDateString('en-AU')}`

        // Create the call list
        const listRes = await fetchApi(`/api/campaigns/${state.campaignId}/call-lists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: listName,
            script_id: state.savedScriptId || null,
            priority_strategy: 'sequential',
          }),
        })
        const listData = await listRes.json()
        if (!listRes.ok) throw new Error(listData.error || 'Failed to create call list')
        listId = listData.list_id
      }

      setState((prev) => ({ ...prev, savedListId: listId }))

      // Lifecycle: mark the orchestration action as completed once both
      // script and list are linked, so ResumeBanner stops surfacing it.
      const actionIdParam = searchParams.get('action_id')
      const actionId = actionIdParam ? parseInt(actionIdParam, 10) : null
      if (actionId && Number.isFinite(actionId) && state.savedScriptId) {
        try {
          const { data: existingAction } = await supabase
            .from('phone_call_actions')
            .select('list_ids, script_id, status')
            .eq('action_id', actionId)
            .single()
          const prev: number[] = existingAction?.list_ids ?? []
          const merged = [...new Set([...prev, listId])]
          await supabase
            .from('phone_call_actions')
            .update({
              list_ids: merged,
              script_id: state.savedScriptId,
              status: 'completed',
            })
            .eq('action_id', actionId)
        } catch {
          // Non-fatal: do not block the wizard on lifecycle bookkeeping.
        }
      }

      // Populate the list (both modes — adds workers, skipping duplicates).
      const workerIds = [...selectedWorkerIds]
      const populateRes = await fetchApi(`/api/campaigns/${state.campaignId}/call-lists/${listId}/populate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: {}, worker_ids: workerIds }),
      })
      const populateData = await populateRes.json()
      if (!populateRes.ok) throw new Error(populateData.error || 'Failed to populate list')

      setState((prev) => ({ ...prev, listPopulated: true }))
      toast.success(
        linkingToExisting
          ? `Script linked and ${populateData.added} contacts added`
          : `Call list created with ${populateData.added} contacts`
      )

      // Navigate to calling session
      router.push(`/campaigns/${state.campaignId}/phone/call/${listId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create list')
    } finally {
      setIsCreatingList(false)
    }
  }

  // Fetch existing call lists in the campaign when the user reaches step 6
  // with a campaign selected. Include previously_linked flag for the active script.
  useEffect(() => {
    if (step !== 6) return
    if (!state.campaignId) return
    if (useVariations && segmentVariable) return
    let cancelled = false
    setExistingListsLoading(true)
    const qs = state.savedScriptId ? `?script_id=${state.savedScriptId}` : ''
    fetchApi(`/api/campaigns/${state.campaignId}/call-lists${qs}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return
        setExistingLists(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!cancelled) setExistingLists([])
      })
      .finally(() => {
        if (!cancelled) setExistingListsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [step, state.campaignId, state.savedScriptId, useVariations, segmentVariable])

  const canProceed: Record<number, boolean> = {
    1: true,
    2: state.tone.length > 0 && state.audience.length > 0,
    3: wizardSections != null && wizardSections.some((s) => s.body_text.trim().length > 0),
    4: true,
    5: true,
    6: true,
  }

  const stageName = state.stageNumber
    ? STAGE_NAMES[state.stageNumber as keyof typeof STAGE_NAMES] || `Stage ${state.stageNumber}`
    : 'General'

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Phone Wizard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create a call script, build a call list, and run through your calls step by step
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/campaigns')}>
          Cancel
        </Button>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between">
          {STEPS.map((s) => {
            const Icon = s.icon
            const done = step > s.id
            const current = step === s.id
            return (
              <div key={s.id} className="flex items-center gap-2">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold',
                  done ? 'bg-green-100 text-green-700' :
                  current ? 'bg-blue-600 text-white' :
                  'bg-slate-100 text-slate-400'
                )}>
                  {done ? <CheckCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className={cn(
                  'text-sm font-medium hidden sm:inline',
                  current ? 'text-blue-600' : done ? 'text-green-700' : 'text-slate-400'
                )}>
                  {s.title}
                </span>
              </div>
            )
          })}
        </div>
        <Progress value={((step - 1) / (STEPS.length - 1)) * 100} className="h-1" />
      </div>

      {/* ── Step 1: Campaign Context ── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Campaign Context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Campaign</Label>
              <Select
                value={state.campaignId?.toString() ?? ''}
                onValueChange={(v) => setState((prev) => ({ ...prev, campaignId: Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select campaign…" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.campaign_id} value={c.campaign_id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Linking to a campaign automatically fills in employer, agreement, and worksite context.
              </p>
            </div>

            {state.campaignId && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {state.employerName && (
                  <div>
                    <span className="text-muted-foreground">Employer:</span>{' '}
                    <span className="font-medium">{state.employerName}</span>
                  </div>
                )}
                {state.agreementName && (
                  <div>
                    <span className="text-muted-foreground">Agreement:</span>{' '}
                    <span className="font-medium">{state.agreementName}</span>
                  </div>
                )}
                {state.organiserName && (
                  <div>
                    <span className="text-muted-foreground">Organiser:</span>{' '}
                    <span className="font-medium">{state.organiserName}</span>
                  </div>
                )}
                {state.worksiteNames.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Worksites:</span>{' '}
                    <span className="font-medium">{state.worksiteNames.join(', ')}</span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <Label>Campaign Stage</Label>
              <Select
                value={state.stageNumber?.toString() ?? '0'}
                onValueChange={(v) => setState((prev) => ({ ...prev, stageNumber: v === '0' ? null : Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">General / not stage-specific</SelectItem>
                  {Object.entries(STAGE_NAMES).map(([n, name]) => (
                    <SelectItem key={n} value={n}>
                      Stage {n}: {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Call Purpose (optional)</Label>
              <Textarea
                value={state.callPurpose}
                onChange={(e) => setState((prev) => ({ ...prev, callPurpose: e.target.value }))}
                placeholder="What is the goal of these calls? e.g., Invite workers to an organising meeting, follow up on bargaining update..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Tone & Audience ── */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Tone & Audience</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Narrative Tone (select all that apply)</Label>
              <div className="flex flex-wrap gap-2">
                {TONE_OPTIONS.map((t) => {
                  const selected = state.tone.includes(t.key)
                  return (
                    <Badge
                      key={t.key}
                      variant={selected ? 'default' : 'outline'}
                      className="cursor-pointer text-sm py-1 px-3"
                      onClick={() => setState((prev) => ({
                        ...prev,
                        tone: selected
                          ? prev.tone.filter((x) => x !== t.key)
                          : [...prev.tone, t.key],
                      }))}
                    >
                      {t.label}
                    </Badge>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Target Audience (select all that apply)</Label>
              <div className="flex flex-wrap gap-2">
                {AUDIENCE_OPTIONS.map((a) => {
                  const selected = state.audience.includes(a.key)
                  return (
                    <Badge
                      key={a.key}
                      variant={selected ? 'default' : 'outline'}
                      className="cursor-pointer text-sm py-1 px-3"
                      onClick={() => setState((prev) => ({
                        ...prev,
                        audience: selected
                          ? prev.audience.filter((x) => x !== a.key)
                          : [...prev.audience, a.key],
                      }))}
                    >
                      {a.label}
                    </Badge>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Engagement Intensity</Label>
              <div className="flex flex-wrap gap-2">
                {INTENSITY_OPTIONS.map((i) => (
                  <Badge
                    key={i.key}
                    variant={state.engagementIntensity === i.key ? 'default' : 'outline'}
                    className="cursor-pointer text-sm py-1 px-3"
                    onClick={() => setState((prev) => ({ ...prev, engagementIntensity: i.key }))}
                  >
                    {i.label}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Create Script ── */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Create Phone Script</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {wizardSections == null && socSeedSessions.length > 0 && (
              <div className="rounded-lg border border-purple-200 bg-purple-50/60 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-purple-900">
                  <MessageSquareQuote className="h-4 w-4" />
                  Seed from Structured Organising Conversation
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {socSeedSessions.length} session{socSeedSessions.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <p className="text-xs text-purple-900/80">
                  Found locked SOC content for this campaign
                  {state.stageNumber ? ` at stage ${state.stageNumber}` : ''}. Pre-populate the
                  script&apos;s opening, discovery, ask, objections and close sections from a SOC
                  in one click — you can still edit each section afterwards.
                </p>
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedSocSessionId?.toString() ?? ''}
                    onValueChange={(v) => setSelectedSocSessionId(v ? parseInt(v, 10) : null)}
                  >
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="Choose SOC session…" />
                    </SelectTrigger>
                    <SelectContent>
                      {socSeedSessions.map((s) => (
                        <SelectItem key={s.session_id} value={String(s.session_id)}>
                          {s.title}
                          {s.stage_number ? ` — Stage ${s.stage_number}` : ''} ({s.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => selectedSocSessionId && handleSeedFromSoc(selectedSocSessionId)}
                    disabled={!selectedSocSessionId}
                  >
                    Seed sections
                  </Button>
                  <Button asChild size="sm" variant="ghost" className="text-xs">
                    <a
                      href={`/campaigns/soc-wizard?cid=${state.campaignId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open SOC →
                    </a>
                  </Button>
                </div>
              </div>
            )}

            {wizardSections == null && (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={() => void handleAIGenerate()}
                  disabled={generateDraft.isPending}
                >
                  {generateDraft.isPending ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <Sparkles className="h-6 w-6" />
                  )}
                  <span>{generateDraft.isPending ? 'Generating...' : 'AI Generate Script'}</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={() => {
                    const first = createEmptyEditableSection(0)
                    setWizardSections([first])
                    setState((prev) => ({
                      ...prev,
                      scriptText: '',
                      savedScriptId: null,
                    }))
                  }}
                >
                  <PenLine className="h-6 w-6" />
                  <span>Write from Scratch</span>
                </Button>
              </div>
            )}

            {wizardSections != null && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Script Title</Label>
                  <Button
                    variant="ghost" size="sm" className="text-xs"
                    onClick={() => {
                      setWizardSections(null)
                      setState((prev) => ({ ...prev, scriptText: '', savedScriptId: null }))
                    }}
                  >
                    Start Over
                  </Button>
                </div>
                <Input
                  value={state.scriptTitle}
                  onChange={(e) => setState((prev) => ({ ...prev, scriptTitle: e.target.value }))}
                  placeholder={`Phone Script — ${stageName}`}
                />

                <div>
                  <Label className="mb-1.5 block">Script sections</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Add sections to match your call flow (opening, ask, close). Use {'{{first_name}}'}, {'{{employer_name}}'}, etc. for personalisation.
                  </p>
                  <CallScriptEditor
                    sections={wizardSections}
                    onChange={handleWizardSectionsChange}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => void handleSaveScript()}
                    disabled={isSavingScript || !wizardSections.some((s) => s.body_text.trim())}
                  >
                    {isSavingScript ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    {state.savedScriptId ? 'Script Saved' : 'Save Script'}
                  </Button>
                  {state.savedScriptId && (
                    <Badge variant="outline" className="py-1.5 px-3 text-muted-foreground">
                      Script #{state.savedScriptId}
                    </Badge>
                  )}
                  {!state.savedScriptId && (
                    <p className="text-xs text-amber-600">
                      Save the script to attach it to the call list.
                    </p>
                  )}
                </div>

                {/* Outcome editor — after script save (campaign + standalone) */}
                {state.savedScriptId && (
                  <div className="mt-4 border-t pt-4">
                    <CallOutcomeEditor
                      campaignId={state.campaignId}
                      scriptId={state.savedScriptId}
                      scriptTitle={state.scriptTitle}
                    />
                  </div>
                )}

                {/* CTA Ambitions collapsible — gentle reminder in step 3 */}
                {state.savedScriptId && (
                  <div className="mt-4 border-t pt-4">
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setShowCtaCollapsible((v) => !v)}
                    >
                      <ListChecks className="h-3.5 w-3.5" />
                      CTA Ambitions
                      {ctaAmbitions.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] ml-1">{ctaAmbitions.length}</Badge>
                      )}
                      {showCtaCollapsible ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
                    </button>
                    {showCtaCollapsible && (
                      <div className="mt-3">
                        <CallCtaAmbitionsEditor
                          scriptId={state.savedScriptId}
                          campaignId={state.campaignId ?? 0}
                          value={ctaAmbitions}
                          onChange={setCtaAmbitions}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 4: Script Variations ── */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-blue-500" />
              Script Variations
              <Badge variant="secondary" className="text-xs font-normal">Optional</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Base script status */}
            {!state.savedScriptId ? (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Go back to step 3 and click "Save Script" before generating variations. The base script must be saved first.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>Base script: "{state.scriptTitle || 'Phone Script'}" (#{state.savedScriptId})</span>
              </div>
            )}

            {/* Skip / generate toggle */}
            <div className="space-y-2">
              <button
                type="button"
                className={cn(
                  'w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                  !useVariations ? 'border-blue-200 bg-blue-50' : 'border-border hover:bg-muted/30'
                )}
                onClick={() => setUseVariations(false)}
              >
                <div className={cn('mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0', !useVariations ? 'border-blue-600' : 'border-muted-foreground')}>
                  {!useVariations && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                </div>
                <div>
                  <p className="text-sm font-medium">Use the same base script for all workers</p>
                  <p className="text-xs text-muted-foreground">One call list, one script — simpler workflow</p>
                </div>
              </button>

              <button
                type="button"
                className={cn(
                  'w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                  useVariations ? 'border-blue-200 bg-blue-50' : 'border-border hover:bg-muted/30'
                )}
                onClick={() => setUseVariations(true)}
              >
                <div className={cn('mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0', useVariations ? 'border-blue-600' : 'border-muted-foreground')}>
                  {useVariations && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                </div>
                <div>
                  <p className="text-sm font-medium">Generate targeted script variations by audience segment</p>
                  <p className="text-xs text-muted-foreground">
                    AI adapts the base script for each group — a separate call list is created per segment
                  </p>
                </div>
              </button>
            </div>

            {/* Variations config */}
            {useVariations && (
              <div className="space-y-5 border rounded-lg p-4 bg-muted/10">
                {/* Segment variable picker */}
                <div className="space-y-1.5">
                  <Label>Segment workers by</Label>
                  <Select
                    value={segmentVariable ?? '__none__'}
                    onValueChange={(v) => {
                      setSegmentVariable(v === '__none__' ? null : v as SegmentVariable)
                      setVariations([])
                    }}
                  >
                    <SelectTrigger className="w-72">
                      <SelectValue placeholder="Choose a variable…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="membership_status">Membership Status</SelectItem>
                      <SelectItem value="organising_role">Member Role</SelectItem>
                      <SelectItem value="occupation">Occupation</SelectItem>
                      <SelectItem value="rating_band">Activity Rating Band</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    One segmentation variable per run — the wizard adapts the script for each value found.
                  </p>
                </div>

                {/* Segment checkboxes */}
                {segmentVariable && (
                  <div className="space-y-2">
                    <Label>Segments to include</Label>
                    {workersLoading && (segmentVariable === 'occupation' || segmentVariable === 'organising_role') ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading workers to derive segments…
                      </div>
                    ) : availableSegments.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {segmentVariable === 'occupation'
                          ? 'No occupation data found for these workers. Workers must be loaded first.'
                          : segmentVariable === 'organising_role'
                            ? 'No member roles found in this worker pool.'
                            : 'No values found.'}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {availableSegments.map((seg) => {
                          const count = getWorkersForSegment(combinedWorkers, segmentVariable, seg.key).filter((w) => w.phone).length
                          const enabled = enabledSegments.has(seg.key)
                          return (
                            <button
                              key={seg.key}
                              type="button"
                              onClick={() => setEnabledSegments((prev) => {
                                const n = new Set(prev)
                                if (n.has(seg.key)) n.delete(seg.key)
                                else n.add(seg.key)
                                return n
                              })}
                              className={cn(
                                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
                                enabled
                                  ? 'bg-blue-100 border-blue-300 text-blue-800'
                                  : 'bg-muted/30 border-muted text-muted-foreground line-through'
                              )}
                            >
                              {enabled && <CheckCircle className="h-3 w-3 text-blue-600" />}
                              {seg.label}
                              <span className="text-[10px] opacity-70">({count})</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Unmatched workers note */}
                {segmentVariable && enabledSegments.size > 0 && combinedWorkers.length > 0 && (() => {
                  const matchedIds = new Set(
                    [...enabledSegments].flatMap((k) =>
                      getWorkersForSegment(combinedWorkers, segmentVariable, k).map((w) => w.worker_id)
                    )
                  )
                  const unmatched = combinedWorkers.filter((w) => w.phone && !matchedIds.has(w.worker_id)).length
                  if (unmatched === 0) return null
                  return (
                    <p className="text-xs text-muted-foreground p-2 rounded bg-amber-50 border border-amber-200 text-amber-700">
                      {unmatched} worker{unmatched !== 1 ? 's' : ''} with phone do not match any selected segment.
                      You can create a base-script list for them in step 6.
                    </p>
                  )
                })()}

                {/* Generate All button */}
                {segmentVariable && enabledSegments.size > 0 && (
                  <Button
                    onClick={() => void handleGenerateAllVariations()}
                    disabled={!state.savedScriptId || generatingCount > 0}
                  >
                    {generatingCount > 0 ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating {generatingCount} variation{generatingCount !== 1 ? 's' : ''}…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate All Variations ({enabledSegments.size})
                      </>
                    )}
                  </Button>
                )}

                {/* Per-variation cards */}
                {variations.filter((v) => enabledSegments.has(v.segmentKey)).map((variation) => (
                  <Card key={variation.segmentKey} className="border-l-4 border-l-blue-400">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-blue-500 shrink-0" />
                        {variation.segmentLabel}
                        {variation.savedScriptId && (
                          <Badge variant="outline" className="text-green-700 border-green-300 text-[10px]">
                            Script #{variation.savedScriptId} ✓
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {variation.isGenerating ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Generating script for {variation.segmentLabel}…
                        </div>
                      ) : variation.error ? (
                        <div className="flex items-start gap-2 p-2 rounded bg-red-50 border border-red-200 text-xs text-red-700">
                          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span className="flex-1">{variation.error}</span>
                          <Button
                            size="sm" variant="outline" className="h-6 text-xs shrink-0"
                            onClick={() => void handleGenerateVariation(variation)}
                          >
                            Retry
                          </Button>
                        </div>
                      ) : variation.scriptText ? (
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Title</Label>
                            <Input
                              value={variation.scriptTitle}
                              onChange={(e) => {
                                const title = e.target.value
                                setVariations((prev) => prev.map((v) =>
                                  v.segmentKey === variation.segmentKey ? { ...v, scriptTitle: title, savedScriptId: null } : v
                                ))
                              }}
                              className="h-7 text-xs"
                            />
                          </div>
                          <Textarea
                            value={variation.scriptText}
                            onChange={(e) => {
                              const text = e.target.value
                              setVariations((prev) => prev.map((v) =>
                                v.segmentKey === variation.segmentKey ? { ...v, scriptText: text, savedScriptId: null } : v
                              ))
                            }}
                            rows={10}
                            className="font-mono text-xs"
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => void handleSaveVariation(variation)}
                              disabled={!!variation.savedScriptId || savingVariationKey === variation.segmentKey || !variation.scriptText.trim()}
                            >
                              {savingVariationKey === variation.segmentKey ? (
                                <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Saving…</>
                              ) : variation.savedScriptId ? (
                                <><CheckCircle className="h-3.5 w-3.5 mr-1" />Saved</>
                              ) : (
                                'Save Script'
                              )}
                            </Button>
                            <Button
                              size="sm" variant="outline"
                              onClick={() => void handleGenerateVariation(variation)}
                              disabled={generatingCount > 0}
                            >
                              <Sparkles className="h-3.5 w-3.5 mr-1" />
                              Regenerate
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground py-2">
                          Not yet generated. Click "Generate All Variations" above.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 5: CTA Ambitions & Objections ── */}
      {step === 5 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-blue-500" />
                CTA Ambitions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CallCtaAmbitionsEditor
                scriptId={state.savedScriptId}
                campaignId={state.campaignId ?? 0}
                value={ctaAmbitions}
                onChange={setCtaAmbitions}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Objections
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ObjectionsEditor
                campaignId={state.campaignId ?? 0}
                value={selectedObjections}
                onChange={setSelectedObjections}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Issue Identification
              </CardTitle>
            </CardHeader>
            <CardContent>
              <IssueIdentificationEditor
                campaignId={state.campaignId ?? 0}
                value={expectedIssues}
                onChange={setExpectedIssues}
                onSeedRequest={(_issues) => {
                  // Seeding happens on Next click via handleProceedFromStep5
                }}
              />
            </CardContent>
          </Card>

        </div>
      )}

      {/* ── Step 6: Build List & Call ── */}
      {step === 6 && (
        <Card>
          <CardHeader>
            <CardTitle>Build Call List & Start Calling</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* ── Variations mode: segment lists panel ── */}
            {useVariations && segmentVariable && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-blue-500" />
                  <p className="text-sm font-medium">Create a separate call list for each script variation</p>
                </div>

                {/* Per-segment rows */}
                <div className="space-y-2">
                  {variations
                    .filter((v) => enabledSegments.has(v.segmentKey))
                    .map((variation) => {
                      const segWorkers = getWorkersForSegment(combinedWorkers, segmentVariable, variation.segmentKey).filter((w) => w.phone)
                      return (
                        <div key={variation.segmentKey} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/10">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{variation.segmentLabel}</p>
                            <p className="text-xs text-muted-foreground">
                              {segWorkers.length} worker{segWorkers.length !== 1 ? 's' : ''} with phone
                              {variation.savedScriptId
                                ? ` · Script #${variation.savedScriptId}`
                                : ' · No script saved — go back to step 4 and save this variation'}
                            </p>
                          </div>
                          {variation.listId ? (
                            <Button
                              size="sm"
                              onClick={() => {
                                router.push(`/campaigns/${state.campaignId}/phone/call/${variation.listId}`)
                              }}
                            >
                              <PlayCircle className="h-3.5 w-3.5 mr-1" />
                              Start Calling
                            </Button>
                          ) : (
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {variation.savedScriptId ? `${segWorkers.length} ready` : 'No script'}
                            </Badge>
                          )}
                        </div>
                      )
                    })}
                </div>

                {/* Unmatched workers toggle */}
                {(() => {
                  const matchedIds = new Set(
                    variations
                      .filter((v) => enabledSegments.has(v.segmentKey))
                      .flatMap((v) => getWorkersForSegment(combinedWorkers, segmentVariable, v.segmentKey).map((w) => w.worker_id))
                  )
                  const unmatchedCount = combinedWorkers.filter((w) => w.phone && !matchedIds.has(w.worker_id)).length
                  if (unmatchedCount === 0) return null
                  return (
                    <div className="space-y-2 p-3 rounded-lg border border-dashed">
                      <p className="text-xs text-muted-foreground">
                        {unmatchedCount} worker{unmatchedCount !== 1 ? 's' : ''} with phone do not match any segment.
                      </p>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={createBaseListForUnmatched}
                          onChange={(e) => setCreateBaseListForUnmatched(e.target.checked)}
                        />
                        <span className="text-sm">
                          Create a general list for these {unmatchedCount} workers using the base script
                          {state.savedScriptId ? ` (#${state.savedScriptId})` : ''}
                        </span>
                      </label>
                      {createBaseListForUnmatched && state.savedListId && (
                        <Button
                          size="sm"
                          onClick={() => {
                            router.push(`/campaigns/${state.campaignId}/phone/call/${state.savedListId}`)
                          }}
                        >
                          <PlayCircle className="h-3.5 w-3.5 mr-1" />
                          Start Calling (General)
                        </Button>
                      )}
                    </div>
                  )
                })()}

                {/* Create All Lists button */}
                {variations.some((v) => enabledSegments.has(v.segmentKey) && v.savedScriptId) && (
                  <Button
                    onClick={() => void handleCreateSegmentLists()}
                    disabled={isCreatingSegmentLists}
                    size="lg"
                    className="w-full"
                  >
                    {isCreatingSegmentLists ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating segment lists…</>
                    ) : (
                      <><GitBranch className="h-4 w-4 mr-2" />Create All Segment Lists</>
                    )}
                  </Button>
                )}

                {!variations.some((v) => enabledSegments.has(v.segmentKey) && v.savedScriptId) && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                    Go back to step 4 and save at least one variation script before creating lists.
                  </div>
                )}

                <div className="border-t pt-4">
                  <p className="text-xs text-muted-foreground font-medium mb-2">
                    Or switch to a single call list (base script mode):
                  </p>
                </div>
              </div>
            )}

            {/* ── Single list mode (base script) or fallback within variations mode ── */}
            {(!useVariations || !segmentVariable) && state.campaignId && (
              <div className="space-y-2">
                <Label className="text-xs">Where should these calls go?</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setListMode('new')}
                    className={cn(
                      'flex-1 text-left p-2.5 rounded-lg border text-xs transition-colors',
                      listMode === 'new'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    )}
                  >
                    <p className="font-medium text-sm">Create new list</p>
                    <p className="text-muted-foreground">A fresh call list populated with the selected workers.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setListMode('existing')}
                    className={cn(
                      'flex-1 text-left p-2.5 rounded-lg border text-xs transition-colors',
                      listMode === 'existing'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    )}
                  >
                    <p className="font-medium text-sm">Link to existing list</p>
                    <p className="text-muted-foreground">Attach this script to a list that already exists; the workers you&apos;ve selected will be added to it.</p>
                  </button>
                </div>
              </div>
            )}

            {(!useVariations || !segmentVariable) && listMode === 'existing' && state.campaignId && (
              <div className="space-y-1">
                <Label>Existing Call List</Label>
                {existingListsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading existing lists…
                  </div>
                ) : existingLists.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No existing lists in this campaign yet. Create a new list instead.</p>
                ) : (
                  <Select
                    value={existingListId != null ? String(existingListId) : ''}
                    onValueChange={(v) => setExistingListId(Number(v))}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Pick an existing list…" />
                    </SelectTrigger>
                    <SelectContent>
                      {existingLists.map((l) => (
                        <SelectItem key={l.list_id} value={String(l.list_id)}>
                          <span className="flex items-center gap-2">
                            <span>{l.name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              ({l.total_items} contacts)
                            </span>
                            {l.is_current_for_script ? (
                              <Badge variant="default" className="text-[9px] px-1 bg-primary/15 text-primary border-primary/30">
                                Current script
                              </Badge>
                            ) : l.previously_linked ? (
                              <Badge variant="secondary" className="text-[9px] px-1">
                                Previously linked
                              </Badge>
                            ) : null}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {(!useVariations || !segmentVariable) && (listMode === 'new' || !state.campaignId) && (
              <div className="space-y-1">
                <Label>Call List Name</Label>
                <Input
                  value={state.listName}
                  onChange={(e) => setState((prev) => ({ ...prev, listName: e.target.value }))}
                  placeholder={`Call list — ${new Date().toLocaleDateString('en-AU')}`}
                />
              </div>
            )}

            {(!useVariations || !segmentVariable) && (state.campaignId || state.standaloneEmployerId) && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={workerSearch}
                      onChange={(e) => setWorkerSearch(e.target.value)}
                      placeholder="Search by name, phone, or occupation..."
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {selectedWorkerIds.size} of {combinedWorkers.length} selected
                  </Badge>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm" variant="outline" className="text-xs h-7"
                    onClick={() => {
                      const withPhone = filteredWorkers.filter((w) => w.phone)
                      setSelectedWorkerIds(new Set(withPhone.map((w) => w.worker_id)))
                    }}
                  >Select All</Button>
                  <Button
                    size="sm" variant="outline" className="text-xs h-7"
                    onClick={() => setSelectedWorkerIds(new Set())}
                  >Deselect All</Button>
                  <Button
                    size="sm" variant="outline" className="text-xs h-7"
                    onClick={() => setShowBulkSelect((v) => !v)}
                  >
                    {showBulkSelect ? 'Hide filters' : 'Select by…'}
                  </Button>
                </div>

                {/* Bulk select by value */}
                {showBulkSelect && (
                  <div className="rounded-md border bg-muted/10 p-3 space-y-3">
                    <p className="text-xs font-medium text-muted-foreground">Select / deselect workers in the current view by value</p>

                    {/* Occupation */}
                    {(() => {
                      const occupations = [...new Set(filteredWorkers.map((w) => w.occupation).filter(Boolean) as string[])].sort()
                      return occupations.length > 0 ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs w-20 shrink-0 text-muted-foreground">Occupation</span>
                          <Select value={bulkSelectOccupation} onValueChange={setBulkSelectOccupation}>
                            <SelectTrigger className="h-7 text-xs w-44">
                              <SelectValue placeholder="Pick occupation…" />
                            </SelectTrigger>
                            <SelectContent>
                              {occupations.map((o) => (
                                <SelectItem key={o} value={o}>{o}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!bulkSelectOccupation}
                            onClick={() => setSelectedWorkerIds((prev) => {
                              const n = new Set(prev)
                              filteredWorkers.filter((w) => w.phone && w.occupation === bulkSelectOccupation).forEach((w) => n.add(w.worker_id))
                              return n
                            })}>Select</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!bulkSelectOccupation}
                            onClick={() => setSelectedWorkerIds((prev) => {
                              const n = new Set(prev)
                              filteredWorkers.filter((w) => w.occupation === bulkSelectOccupation).forEach((w) => n.delete(w.worker_id))
                              return n
                            })}>Deselect</Button>
                        </div>
                      ) : null
                    })()}

                    {/* Status — campaign only */}
                    {state.campaignId && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs w-20 shrink-0 text-muted-foreground">Status</span>
                        {CAMPAIGN_MEMBERSHIP_BUCKETS.map(({ key: val, label }) => {
                          const count = filteredWorkers.filter((w) => w.membership_status === val).length
                          return (
                            <div key={val} className="flex items-center gap-1">
                              <Badge variant="outline" className="text-[10px] py-0.5">{label} ({count})</Badge>
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5" disabled={count === 0}
                                onClick={() => setSelectedWorkerIds((prev) => {
                                  const n = new Set(prev)
                                  filteredWorkers.filter((w) => w.phone && w.membership_status === val).forEach((w) => n.add(w.worker_id))
                                  return n
                                })}>+</Button>
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5" disabled={count === 0}
                                onClick={() => setSelectedWorkerIds((prev) => {
                                  const n = new Set(prev)
                                  filteredWorkers.filter((w) => w.membership_status === val).forEach((w) => n.delete(w.worker_id))
                                  return n
                                })}>−</Button>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Role — campaign only */}
                    {state.campaignId && (() => {
                      const roles = [...new Set(filteredWorkers.map((w) => w.organising_role).filter(Boolean) as string[])].sort()
                      return roles.length > 0 ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs w-20 shrink-0 text-muted-foreground">Role</span>
                          <Select value={bulkSelectRole} onValueChange={setBulkSelectRole}>
                            <SelectTrigger className="h-7 text-xs w-44">
                              <SelectValue placeholder="Pick role…" />
                            </SelectTrigger>
                            <SelectContent>
                              {roles.map((r) => (
                                <SelectItem key={r} value={r}>{r}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!bulkSelectRole}
                            onClick={() => setSelectedWorkerIds((prev) => {
                              const n = new Set(prev)
                              filteredWorkers.filter((w) => w.phone && w.organising_role === bulkSelectRole).forEach((w) => n.add(w.worker_id))
                              return n
                            })}>Select</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!bulkSelectRole}
                            onClick={() => setSelectedWorkerIds((prev) => {
                              const n = new Set(prev)
                              filteredWorkers.filter((w) => w.organising_role === bulkSelectRole).forEach((w) => n.delete(w.worker_id))
                              return n
                            })}>Deselect</Button>
                        </div>
                      ) : null
                    })()}

                    {/* Rating band — campaign only */}
                    {state.campaignId && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs w-20 shrink-0 text-muted-foreground">Rating</span>
                        {RATING_BANDS.map((band) => {
                          const count = filteredWorkers.filter((w) => band.test(w.cumulative_rating)).length
                          return (
                            <div key={band.key} className="flex items-center gap-1">
                              <Badge variant="outline" className="text-[10px] py-0.5">{band.label} ({count})</Badge>
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5" disabled={count === 0}
                                onClick={() => setSelectedWorkerIds((prev) => {
                                  const n = new Set(prev)
                                  filteredWorkers.filter((w) => w.phone && band.test(w.cumulative_rating)).forEach((w) => n.add(w.worker_id))
                                  return n
                                })}>+</Button>
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5" disabled={count === 0}
                                onClick={() => setSelectedWorkerIds((prev) => {
                                  const n = new Set(prev)
                                  filteredWorkers.filter((w) => band.test(w.cumulative_rating)).forEach((w) => n.delete(w.worker_id))
                                  return n
                                })}>−</Button>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Last activity band — campaign only */}
                    {state.campaignId && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs w-20 shrink-0 text-muted-foreground">Last activity</span>
                        {RATING_BANDS.map((band) => {
                          const count = filteredWorkers.filter((w) => band.test(w.last_activity_rating)).length
                          return (
                            <div key={band.key} className="flex items-center gap-1">
                              <Badge variant="outline" className="text-[10px] py-0.5">{band.label} ({count})</Badge>
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5" disabled={count === 0}
                                onClick={() => setSelectedWorkerIds((prev) => {
                                  const n = new Set(prev)
                                  filteredWorkers.filter((w) => w.phone && band.test(w.last_activity_rating)).forEach((w) => n.add(w.worker_id))
                                  return n
                                })}>+</Button>
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5" disabled={count === 0}
                                onClick={() => setSelectedWorkerIds((prev) => {
                                  const n = new Set(prev)
                                  filteredWorkers.filter((w) => band.test(w.last_activity_rating)).forEach((w) => n.delete(w.worker_id))
                                  return n
                                })}>−</Button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {workersLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredWorkers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No workers found.</p>
                ) : (
                  <div className="border rounded-md max-h-72 overflow-auto">
                    <table className="w-full text-xs min-w-max">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="w-8 p-2" />
                          <th className="text-left p-2 font-medium cursor-pointer whitespace-nowrap select-none"
                              onClick={() => handleSortClick('name')}>
                            Name <SortIcon col="name" />
                          </th>
                          <th className="text-left p-2 font-medium cursor-pointer whitespace-nowrap select-none"
                              onClick={() => handleSortClick('phone')}>
                            Phone <SortIcon col="phone" />
                          </th>
                          <th className="text-left p-2 font-medium cursor-pointer whitespace-nowrap select-none"
                              onClick={() => handleSortClick('occupation')}>
                            Occupation <SortIcon col="occupation" />
                          </th>
                          {state.campaignId && (
                            <>
                              <th className="text-left p-2 font-medium cursor-pointer whitespace-nowrap select-none"
                                  onClick={() => handleSortClick('membership_status')}>
                                Status <SortIcon col="membership_status" />
                              </th>
                              <th className="text-left p-2 font-medium cursor-pointer whitespace-nowrap select-none"
                                  onClick={() => handleSortClick('organising_role')}>
                                Role <SortIcon col="organising_role" />
                              </th>
                              <th className="text-left p-2 font-medium cursor-pointer whitespace-nowrap select-none"
                                  onClick={() => handleSortClick('cumulative_rating')}>
                                Rating <SortIcon col="cumulative_rating" />
                              </th>
                              <th className="text-left p-2 font-medium cursor-pointer whitespace-nowrap select-none"
                                  onClick={() => handleSortClick('last_activity_rating')}>
                                Last <SortIcon col="last_activity_rating" />
                              </th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredWorkers.map((w) => {
                          const checked = selectedWorkerIds.has(w.worker_id)
                          const sourceLabel = workerSources[w.worker_id]
                          return (
                            <tr key={w.worker_id} className={`border-t ${!w.phone ? 'opacity-50' : ''}`}>
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={!w.phone}
                                  onChange={() => {
                                    const next = new Set(selectedWorkerIds)
                                    if (checked) next.delete(w.worker_id)
                                    else next.add(w.worker_id)
                                    setSelectedWorkerIds(next)
                                  }}
                                />
                              </td>
                              <td className="p-2 whitespace-nowrap">
                                {w.first_name} {w.last_name}
                                {sourceLabel && (
                                  <span className="block text-muted-foreground text-[10px]">{sourceLabel}</span>
                                )}
                              </td>
                              <td className="p-2 text-muted-foreground whitespace-nowrap">{w.phone || 'No phone'}</td>
                              <td className="p-2 text-muted-foreground">{w.occupation || '—'}</td>
                              {state.campaignId && (
                                <>
                                  <td className="p-2 whitespace-nowrap">{membershipBadgesCampaign(w)}</td>
                                  <td className="p-2 text-muted-foreground whitespace-nowrap">{w.organising_role || '—'}</td>
                                  <td className="p-2 text-center">
                                    {w.cumulative_rating != null
                                      ? <span className="font-mono">{w.cumulative_rating.toFixed(1)}</span>
                                      : <span className="text-muted-foreground">—</span>}
                                  </td>
                                  <td className="p-2 text-center">
                                    {w.last_activity_rating != null
                                      ? <span className="font-mono">{w.last_activity_rating.toFixed(1)}</span>
                                      : <span className="text-muted-foreground">—</span>}
                                  </td>
                                </>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Individual search add */}
                <div className="rounded-md border bg-muted/10">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
                    onClick={() => setShowIndividualAdd((v) => !v)}
                  >
                    <span>Add workers (search)</span>
                    {showIndividualAdd ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  </button>
                  {showIndividualAdd && (
                    <div className="space-y-2 border-t px-3 py-3">
                      <p className="text-xs text-muted-foreground">
                        Search by first name, last name, or email (at least 3 characters).
                        {state.campaignId ? ' Only workers on this campaign can be added.' : ''}
                      </p>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={addSearch}
                          onChange={(e) => setAddSearch(e.target.value)}
                          placeholder="Search workers..."
                          className="pl-8 h-8 text-sm"
                        />
                      </div>
                      {addSearchDebounced.length > 0 && addSearchDebounced.length < 3 && (
                        <p className="text-xs text-muted-foreground">Type at least 3 characters to search.</p>
                      )}
                      {addSearchLoading && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Searching…
                        </div>
                      )}
                      {!addSearchLoading && addSearchDebounced.length >= 3 && addSearchResults.length === 0 && (
                        <p className="text-xs text-muted-foreground">No matches.</p>
                      )}
                      {addSearchResults.length > 0 && (
                        <ul className="max-h-48 space-y-1 overflow-auto rounded border bg-background p-1">
                          {addSearchResults.map((w) => {
                            const onList = combinedWorkers.some((x) => x.worker_id === w.worker_id)
                            return (
                              <li key={w.worker_id} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50">
                                <span>
                                  {w.first_name} {w.last_name}
                                  <span className="text-muted-foreground block">{w.phone || 'No phone'}</span>
                                </span>
                                {onList ? (
                                  <Badge variant="secondary" className="shrink-0 text-[10px]">Already added</Badge>
                                ) : (
                                  <Button
                                    type="button" size="sm" className="h-7 shrink-0 text-xs"
                                    onClick={() => handleAddIndividualWorker(w)}
                                  >
                                    Add
                                  </Button>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* Bulk add */}
                <div className="rounded-md border bg-muted/10">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
                    onClick={() => setShowBulkAdd((v) => !v)}
                  >
                    <span>Add by filter (bulk)</span>
                    {showBulkAdd ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  </button>
                  {showBulkAdd && (
                    <div className="space-y-3 border-t px-3 py-3">
                      <p className="text-xs text-muted-foreground">
                        Filter by employer, worksite, and/or occupation (AND logic).
                        {state.campaignId ? ' Results limited to workers on this campaign.' : ''}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Employer</Label>
                          <Select
                            value={addFilterEmployerId?.toString() ?? '__any__'}
                            onValueChange={(v) => {
                              setAddFilterEmployerId(v === '__any__' ? null : Number(v))
                              setAddFilterWorksiteId(null)
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Any employer" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__any__">Any employer</SelectItem>
                              {allEmployers.map((e) => (
                                <SelectItem key={e.employer_id} value={e.employer_id.toString()}>
                                  {e.employer_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Worksite</Label>
                          <Select
                            value={addFilterWorksiteId?.toString() ?? '__any__'}
                            onValueChange={(v) => setAddFilterWorksiteId(v === '__any__' ? null : Number(v))}
                            disabled={!addFilterEmployerId}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder={addFilterEmployerId ? 'Any worksite' : 'Pick employer first'} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__any__">Any worksite</SelectItem>
                              {addFilterWorksites.map((ws) => (
                                <SelectItem key={ws.worksite_id} value={ws.worksite_id.toString()}>
                                  {ws.worksite_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Occupation contains</Label>
                          <Input
                            value={addFilterOccupation}
                            onChange={(e) => setAddFilterOccupation(e.target.value)}
                            placeholder="e.g. Rigger"
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button" size="sm" className="text-xs h-8"
                          disabled={!bulkAddFiltersEnabled || bulkCountLoading || bulkNewCount === 0}
                          onClick={() => void handleAddMatchingWorkers()}
                        >
                          Add matching workers
                        </Button>
                        {bulkAddFiltersEnabled && (
                          <Badge variant="outline" className="text-[10px]">
                            {bulkNewCount} new
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(!useVariations || !segmentVariable) && !state.campaignId && !state.standaloneEmployerId && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                Go back to Step 1 and select a campaign or employer to build the call list.
              </div>
            )}

            {/* Create list & call button — single list mode only */}
            {(!useVariations || !segmentVariable) && (state.campaignId || state.standaloneEmployerId) && (
              <Button
                onClick={() => void handleCreateListAndCall()}
                disabled={
                  isCreatingList
                  || selectedWorkerIds.size === 0
                  || (listMode === 'existing' && state.campaignId != null && existingListId == null)
                }
                size="lg"
                className="w-full"
              >
                {isCreatingList ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <PlayCircle className="h-4 w-4 mr-2" />
                )}
                {isCreatingList
                  ? (listMode === 'existing' ? 'Linking and populating list...' : 'Creating list...')
                  : (listMode === 'existing' && state.campaignId != null
                      ? `Link Script & Add ${selectedWorkerIds.size} Workers → Call`
                      : `Create List & Start Calling (${selectedWorkerIds.size} workers)`)}
              </Button>
            )}

            {(!useVariations || !segmentVariable) && state.savedScriptId && (
              <p className="text-xs text-muted-foreground text-center">
                Script #{state.savedScriptId} will be attached to the call list.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        {step < 6 && (
          <Button
            onClick={step === 5 ? () => void handleProceedFromStep5() : () => setStep(step + 1)}
            disabled={!canProceed[step] || (step === 5 && isPersistingStep5)}
          >
            {step === 5 && isPersistingStep5 ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : null}
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  )
}
