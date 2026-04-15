'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { useGenerateDraft } from '@/lib/hooks/useGenerateDraft'
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
} from 'lucide-react'

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
  organising_role?: string | null
  cumulative_rating?: number | null
  last_activity_rating?: number | null
}

type SortCol = 'name' | 'phone' | 'occupation' | 'membership_status' | 'organising_role' | 'cumulative_rating' | 'last_activity_rating'
type SortDir = 'asc' | 'desc'

const RATING_BANDS = [
  { key: 'unrated', label: 'Unrated', test: (v: number | null | undefined) => v == null },
  { key: 'low',    label: '< 2',     test: (v: number | null | undefined) => v != null && v < 2 },
  { key: 'mid',    label: '2–3',     test: (v: number | null | undefined) => v != null && v >= 2 && v < 3 },
  { key: 'high',   label: '3+',      test: (v: number | null | undefined) => v != null && v >= 3 },
]

const STEPS = [
  { id: 1, title: 'Campaign Context', icon: Building2 },
  { id: 2, title: 'Tone & Audience', icon: Target },
  { id: 3, title: 'Create Script', icon: FileText },
  { id: 4, title: 'Build List & Call', icon: Phone },
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

  const generateDraft = useGenerateDraft()

  // Pre-fill from URL params: ?campaign_id=123
  useEffect(() => {
    const campaignIdParam = searchParams.get('campaign_id')
    if (!campaignIdParam) return
    const campaignId = parseInt(campaignIdParam, 10)
    if (!Number.isFinite(campaignId)) return

    async function prefill() {
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
    prefill()
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
  }, [state.campaignId, state.standaloneEmployerId, state.standaloneWorksiteId])

  // Campaign list
  const { data: campaigns = [] } = useQuery({
    queryKey: ['wizard-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('campaign_id, name, organiser_id')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!user,
  })

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

  // Employers for standalone mode
  const { data: allEmployers = [] } = useQuery({
    queryKey: ['wizard-employers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employers')
        .select('employer_id, employer_name')
        .order('employer_name')
      if (error) throw error
      return data ?? []
    },
    enabled: !!user && (!state.campaignId || step === 4),
  })

  // Worksites for standalone employer selection
  const { data: allWorksites = [] } = useQuery({
    queryKey: ['wizard-worksites', state.standaloneEmployerId],
    queryFn: async () => {
      let query = supabase
        .from('worksites')
        .select('worksite_id, worksite_name')
        .order('worksite_name')
      if (state.standaloneEmployerId) {
        const { data: ewrRows } = await supabase
          .from('employer_worksite_roles')
          .select('worksite_id')
          .eq('employer_id', state.standaloneEmployerId)
        if (ewrRows?.length) {
          query = query.in('worksite_id', ewrRows.map((r) => r.worksite_id))
        }
      }
      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
    enabled: !!user && !state.campaignId,
  })

  // Worker list for step 4
  const { data: workerList = [], isLoading: workersLoading } = useQuery({
    queryKey: ['phone-wizard-worker-list', state.campaignId, state.standaloneEmployerId, state.standaloneWorksiteId],
    queryFn: async (): Promise<WorkerPreview[]> => {
      if (state.campaignId) {
        const res = await fetch(`/api/campaigns/${state.campaignId}/list-builder`)
        const json = await res.json()
        if (!json.success) throw new Error(json.error)
        return (json.data as WorkerPreview[]).map((row) => ({
          ...row,
          phone: row.phone ?? null,
          membership_status: row.membership_status ?? null,
          organising_role: row.organising_role ?? null,
        }))
      }
      if (state.standaloneEmployerId) {
        let q = supabase
          .from('workers')
          .select('worker_id, first_name, last_name, phone, email, occupation, employers(employer_name), worksites(worksite_name)')
          .eq('employer_id', state.standaloneEmployerId)
        if (state.standaloneWorksiteId) {
          q = q.eq('worksite_id', state.standaloneWorksiteId)
        }
        const { data, error } = await q
        if (error) throw error
        return (data ?? []).map((r: Record<string, unknown>) => {
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
          }
        })
      }
      return []
    },
    enabled: step === 4 && (!!state.campaignId || !!state.standaloneEmployerId),
  })

  // Supplementary ratings query — campaign mode only
  const { data: workerRatings = [] } = useQuery({
    queryKey: ['phone-wizard-ratings', state.campaignId],
    queryFn: async () => {
      const { data } = await supabase
        .from('campaign_worker_rating_summary')
        .select('worker_id, cumulative_rating, last_activity_rating')
        .eq('campaign_id', state.campaignId!)
      return (data ?? []) as { worker_id: number; cumulative_rating: number | null; last_activity_rating: number | null }[]
    },
    enabled: step === 4 && !!state.campaignId,
    staleTime: 60_000,
  })

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
      setSelectedWorkerIds(new Set())
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

  // Add worker search
  const { data: addSearchResults = [], isFetching: addSearchLoading } = useQuery({
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
    enabled: step === 4 && addSearchDebounced.length >= 3,
  })

  // Add filter worksites
  const { data: addFilterWorksites = [] } = useQuery({
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
    enabled: !!user && step === 4 && !!addFilterEmployerId,
  })

  const combinedIdsKey = combinedWorkers
    .map((w) => w.worker_id)
    .sort((a, b) => a - b)
    .join(',')

  const bulkAddFiltersEnabled =
    step === 4 &&
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
    setState((prev) => ({
      ...prev,
      scriptText: result.body_text,
      scriptTitle: prev.scriptTitle || defaultTitle,
    }))
  }

  async function handleSaveScript() {
    if (!state.scriptText.trim()) return
    setIsSavingScript(true)
    try {
      const url = state.campaignId
        ? `/api/campaigns/${state.campaignId}/call-scripts`
        : '/api/phone-wizard/scripts'

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: state.scriptTitle || 'Phone Script',
          call_objective: state.callPurpose || null,
          sections: [],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save script')

      // Save raw script text as a single 'custom' section so it's accessible during calling
      if (data.script_id && state.scriptText.trim()) {
        await fetch(
          state.campaignId
            ? `/api/campaigns/${state.campaignId}/call-scripts/${data.script_id}/structure`
            : '/api/phone-wizard/scripts',
          state.campaignId
            ? {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  script_id: data.script_id,
                  raw_script: state.scriptText,
                }),
              }
            : {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ script_id: data.script_id }),
              }
        ).catch(() => null)

        // Insert the raw text as a single section directly
        await supabase.from('call_script_sections').insert({
          script_id: data.script_id,
          sort_order: 0,
          section_type: 'custom',
          title: 'Script',
          body_text: state.scriptText,
          talking_points: [],
          expected_outcomes: [],
          is_optional: false,
        }).then(({ error }) => {
          if (error) console.warn('Could not save script section:', error.message)
        })
      }

      setState((prev) => ({ ...prev, savedScriptId: data.script_id }))
      toast.success('Script saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save script')
    } finally {
      setIsSavingScript(false)
    }
  }

  async function handleCreateListAndCall() {
    if (selectedWorkerIds.size === 0) {
      toast.error('Select at least one worker to call')
      return
    }
    setIsCreatingList(true)
    try {
      const listName = state.listName.trim() || `Call list — ${new Date().toLocaleDateString('en-AU')}`
      const url = state.campaignId
        ? `/api/campaigns/${state.campaignId}/call-lists`
        : '/api/phone-wizard/call-lists'

      // Create the call list
      const listRes = await fetch(url, {
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

      const listId = listData.list_id
      setState((prev) => ({ ...prev, savedListId: listId }))

      // Populate the list
      const workerIds = [...selectedWorkerIds]
      const populateUrl = state.campaignId
        ? `/api/campaigns/${state.campaignId}/call-lists/${listId}/populate`
        : `/api/phone-wizard/call-lists/${listId}/populate`

      const populateRes = await fetch(populateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: state.campaignId
          ? JSON.stringify({ filters: {}, worker_ids: workerIds })
          : JSON.stringify({ worker_ids: workerIds }),
      })
      const populateData = await populateRes.json()
      if (!populateRes.ok) throw new Error(populateData.error || 'Failed to populate list')

      setState((prev) => ({ ...prev, listPopulated: true }))
      toast.success(`Call list created with ${populateData.added} contacts`)

      // Navigate to calling session
      if (state.campaignId) {
        router.push(`/campaigns/${state.campaignId}/phone/call/${listId}`)
      } else {
        router.push(`/campaigns/phone-wizard/call/${listId}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create list')
    } finally {
      setIsCreatingList(false)
    }
  }

  const canProceed: Record<number, boolean> = {
    1: true,
    2: state.tone.length > 0 && state.audience.length > 0,
    3: state.scriptText.trim().length > 0,
    4: true,
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
              <Label>Campaign (optional)</Label>
              <Select
                value={state.campaignId?.toString() ?? '__none__'}
                onValueChange={(v) => setState((prev) => ({
                  ...prev,
                  campaignId: v === '__none__' ? null : Number(v),
                  ...(v === '__none__' ? {
                    campaignName: '', employerName: '', agreementName: '',
                    worksiteNames: [], organiserName: '', organiserPhone: '',
                  } : {}),
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No campaign — standalone calls" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No campaign — standalone calls</SelectItem>
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

            {!state.campaignId && (
              <div className="space-y-3 p-3 rounded-lg border bg-muted/20">
                <p className="text-sm font-medium">Target Universe</p>
                <div className="space-y-1">
                  <Label className="text-xs">Employer</Label>
                  <Select
                    value={state.standaloneEmployerId?.toString() ?? ''}
                    onValueChange={(v) => {
                      const eid = v ? Number(v) : null
                      const emp = allEmployers.find((e) => e.employer_id === eid)
                      setState((prev) => ({
                        ...prev,
                        standaloneEmployerId: eid,
                        employerName: emp?.employer_name ?? '',
                        standaloneWorksiteId: null,
                        worksiteNames: [],
                      }))
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select employer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allEmployers.map((e) => (
                        <SelectItem key={e.employer_id} value={e.employer_id.toString()}>
                          {e.employer_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Worksite (optional)</Label>
                  <Select
                    value={state.standaloneWorksiteId?.toString() ?? '__all__'}
                    onValueChange={(v) => {
                      const wid = v === '__all__' ? null : Number(v)
                      const ws = allWorksites.find((w) => w.worksite_id === wid)
                      setState((prev) => ({
                        ...prev,
                        standaloneWorksiteId: wid,
                        worksiteNames: ws ? [ws.worksite_name] : [],
                      }))
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All worksites" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All worksites</SelectItem>
                      {allWorksites.map((w) => (
                        <SelectItem key={w.worksite_id} value={w.worksite_id.toString()}>
                          {w.worksite_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
            {!state.scriptText && (
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
                  onClick={() => setState((prev) => ({ ...prev, scriptText: ' ' }))}
                >
                  <PenLine className="h-6 w-6" />
                  <span>Write from Scratch</span>
                </Button>
              </div>
            )}

            {state.scriptText && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Script Title</Label>
                  <Button
                    variant="ghost" size="sm" className="text-xs"
                    onClick={() => setState((prev) => ({ ...prev, scriptText: '', savedScriptId: null }))}
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
                  <Label className="mb-1.5 block">Script</Label>
                  <Textarea
                    value={state.scriptText.trim() === '' ? '' : state.scriptText}
                    onChange={(e) => setState((prev) => ({ ...prev, scriptText: e.target.value, savedScriptId: null }))}
                    rows={16}
                    className="font-mono text-sm"
                    placeholder="Write your call script here. Use {{first_name}}, {{employer_name}}, {{agreement_name}} etc. for personalisation..."
                  />
                  <p className="text-xs text-muted-foreground text-right mt-1">
                    {state.scriptText.trim().length} characters
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => void handleSaveScript()}
                    disabled={isSavingScript || !state.scriptText.trim()}
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
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 4: Build List & Call ── */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Build Call List & Start Calling</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Call List Name</Label>
              <Input
                value={state.listName}
                onChange={(e) => setState((prev) => ({ ...prev, listName: e.target.value }))}
                placeholder={`Call list — ${new Date().toLocaleDateString('en-AU')}`}
              />
            </div>

            {(state.campaignId || state.standaloneEmployerId) && (
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
                        {['member', 'non_member'].map((val) => {
                          const label = val === 'member' ? 'Member' : 'Non-member'
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
                                  <td className="p-2 whitespace-nowrap">
                                    {w.membership_status === 'member' ? (
                                      <Badge variant="default" className="text-[10px] py-0">Member</Badge>
                                    ) : w.membership_status ? (
                                      <Badge variant="secondary" className="text-[10px] py-0">Non-member</Badge>
                                    ) : '—'}
                                  </td>
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

            {!state.campaignId && !state.standaloneEmployerId && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                Go back to Step 1 and select a campaign or employer to build the call list.
              </div>
            )}

            {/* Create list & call button */}
            {(state.campaignId || state.standaloneEmployerId) && (
              <Button
                onClick={() => void handleCreateListAndCall()}
                disabled={isCreatingList || selectedWorkerIds.size === 0}
                size="lg"
                className="w-full"
              >
                {isCreatingList ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <PlayCircle className="h-4 w-4 mr-2" />
                )}
                {isCreatingList
                  ? 'Creating list...'
                  : `Create List & Start Calling (${selectedWorkerIds.size} workers)`}
              </Button>
            )}

            {state.savedScriptId && (
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
        {step < 4 && (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed[step]}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  )
}
