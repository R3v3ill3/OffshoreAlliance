'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/supabase/auth-context'
import { useGenerateDraft } from '@/lib/hooks/useGenerateDraft'
import { useWtpCategories } from '@/lib/hooks/usePlannerOptions'
import { TemplatePicker } from '@/components/campaigns/planning/TemplatePicker'
import type { TemplateRow } from '@/lib/hooks/useTemplateLibrary'
import type { PreparedTag } from '@/components/campaigns/campaign-send-panel'
import {
  RECIPIENT_VARIABLES,
  CAMPAIGN_CONTEXT_VARIABLES,
  resolveTemplateVariables,
  translateToActionNetwork,
} from '@/lib/comms/template-variables'
import { STAGE_NAMES } from '@/types/planner-types'
import type { CommsDraftRequest } from '@/types/planner-types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
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
  Mail,
  Send,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Loader2,
  Sparkles,
  FileText,
  PenLine,
  Variable,
  Users,
  Search,
  AlertCircle,
  XCircle,
  ChevronDown,
} from 'lucide-react'

interface WorkerPreview {
  worker_id: number
  first_name: string
  last_name: string
  email: string | null
  occupation: string | null
  employer_name: string | null
  worksite_name: string | null
  membership_status?: string | null
  oa_leader_role?: string | null
}

function formatCampaignListSource(w: WorkerPreview): string {
  const parts: string[] = []
  if (w.membership_status === 'member') parts.push('Member')
  else if (w.membership_status === 'non_member') parts.push('Non-member')
  if (w.oa_leader_role && w.oa_leader_role !== 'none') {
    const r = w.oa_leader_role
    parts.push(r.charAt(0).toUpperCase() + r.slice(1))
  }
  return parts.length > 0 ? parts.join(', ') : 'Campaign'
}

function formatStandaloneListSource(w: WorkerPreview): string {
  const bits = [
    w.employer_name ? `Employer: ${w.employer_name}` : null,
    w.worksite_name ? `Worksite: ${w.worksite_name}` : null,
  ].filter(Boolean) as string[]
  return bits.length > 0 ? bits.join(' · ') : 'Employer list'
}

const STEPS = [
  { id: 1, title: 'Campaign Context', icon: Building2 },
  { id: 2, title: 'Tone & Audience', icon: Target },
  { id: 3, title: 'Create Email', icon: Mail },
  { id: 4, title: 'List & Send', icon: Send },
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

interface WizardState {
  campaignId: number | null
  stageNumber: number | null
  emailPurpose: string
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
  subject: string
  bodyText: string
  bodyHtml: string | null
  sourceTemplateId: number | null
  draftId: number | null
  preparedTag: PreparedTag | null
  externalMessageId: string | null
}

const INITIAL_STATE: WizardState = {
  campaignId: null,
  stageNumber: null,
  emailPurpose: '',
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
  subject: '',
  bodyText: '',
  bodyHtml: null,
  sourceTemplateId: null,
  draftId: null,
  preparedTag: null,
  externalMessageId: null,
}

export function EmailWizardSteps() {
  const router = useRouter()
  const supabase = createClient()
  const { user, profile } = useAuth()
  const [step, setStep] = useState(1)
  const [state, setState] = useState<WizardState>(INITIAL_STATE)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [isCustomising, setIsCustomising] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [isPushingList, setIsPushingList] = useState(false)
  const [isPushingToAN, setIsPushingToAN] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const generateDraft = useGenerateDraft()
  const [workerSearch, setWorkerSearch] = useState('')
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<number>>(new Set())
  const [workersInitialized, setWorkersInitialized] = useState(false)
  const [pushResults, setPushResults] = useState<Array<{ worker_id: number; name: string; status: string; detail?: string }> | null>(null)
  const [additionalWorkers, setAdditionalWorkers] = useState<WorkerPreview[]>([])
  const [workerSources, setWorkerSources] = useState<Record<number, string>>({})
  const [addSearch, setAddSearch] = useState('')
  const [addSearchDebounced, setAddSearchDebounced] = useState('')
  const [showIndividualAdd, setShowIndividualAdd] = useState(false)
  const [showBulkAdd, setShowBulkAdd] = useState(false)
  const [addFilterEmployerId, setAddFilterEmployerId] = useState<number | null>(null)
  const [addFilterWorksiteId, setAddFilterWorksiteId] = useState<number | null>(null)
  const [addFilterOccupation, setAddFilterOccupation] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setAddSearchDebounced(addSearch.trim()), 400)
    return () => clearTimeout(t)
  }, [addSearch])

  useEffect(() => {
    setWorkersInitialized(false)
    setAdditionalWorkers([])
    setWorkerSources({})
    setPushResults(null)
    setAddSearch('')
    setAddSearchDebounced('')
    setAddFilterEmployerId(null)
    setAddFilterWorksiteId(null)
    setAddFilterOccupation('')
  }, [state.campaignId, state.standaloneEmployerId, state.standaloneWorksiteId])

  const { data: workerList = [], isLoading: workersLoading } = useQuery({
    queryKey: ['wizard-worker-list', state.campaignId, state.standaloneEmployerId, state.standaloneWorksiteId],
    queryFn: async (): Promise<WorkerPreview[]> => {
      if (state.campaignId) {
        const res = await fetch(`/api/campaigns/${state.campaignId}/list-builder?`)
        const json = await res.json()
        if (!json.success) throw new Error(json.error)
        return (json.data as WorkerPreview[]).map((row) => ({
          ...row,
          membership_status: row.membership_status ?? null,
          oa_leader_role: row.oa_leader_role ?? null,
        }))
      }
      if (state.standaloneEmployerId) {
        let q = supabase
          .from('workers')
          .select('worker_id, first_name, last_name, email, occupation, employers(employer_name), worksites(worksite_name)')
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

  const combinedWorkers = useMemo(() => {
    const map = new Map<number, WorkerPreview>()
    for (const w of workerList) map.set(w.worker_id, w)
    for (const w of additionalWorkers) {
      if (!map.has(w.worker_id)) map.set(w.worker_id, w)
    }
    return [...map.values()]
  }, [workerList, additionalWorkers])

  useEffect(() => {
    if (step !== 4) return
    if (workersLoading) return
    if (combinedWorkers.length === 0) {
      setSelectedWorkerIds(new Set())
      return
    }
    if (!workersInitialized) {
      const withEmail = combinedWorkers.filter((w) => w.email)
      setSelectedWorkerIds(new Set(withEmail.map((w) => w.worker_id)))
      setWorkersInitialized(true)
    }
  }, [step, combinedWorkers, workersLoading, workersInitialized])

  const filteredWorkers = useMemo(() => {
    if (!workerSearch.trim()) return combinedWorkers
    const q = workerSearch.toLowerCase()
    return combinedWorkers.filter((w) =>
      `${w.first_name} ${w.last_name}`.toLowerCase().includes(q) ||
      w.email?.toLowerCase().includes(q) ||
      w.occupation?.toLowerCase().includes(q)
    )
  }, [combinedWorkers, workerSearch])

  function resolveWorkerSourceLabel(w: WorkerPreview): string {
    const override = workerSources[w.worker_id]
    if (override) return override
    if (state.campaignId) return formatCampaignListSource(w)
    return formatStandaloneListSource(w)
  }

  function mapWorkerRow(r: Record<string, unknown>): WorkerPreview {
    const emp = r.employers as { employer_name: string } | { employer_name: string }[] | null
    const ws = r.worksites as { worksite_name: string } | { worksite_name: string }[] | null
    return {
      worker_id: r.worker_id as number,
      first_name: r.first_name as string,
      last_name: r.last_name as string,
      email: r.email as string | null,
      occupation: r.occupation as string | null,
      employer_name: Array.isArray(emp) ? emp[0]?.employer_name ?? null : emp?.employer_name ?? null,
      worksite_name: Array.isArray(ws) ? ws[0]?.worksite_name ?? null : ws?.worksite_name ?? null,
      membership_status: (r.membership_status as string | undefined) ?? null,
      oa_leader_role: (r.oa_leader_role as string | undefined) ?? null,
    }
  }

  const { data: addSearchResults = [], isFetching: addSearchLoading } = useQuery({
    queryKey: ['wizard-add-worker-search', addSearchDebounced, state.campaignId],
    queryFn: async (): Promise<WorkerPreview[]> => {
      const q = addSearchDebounced
      if (q.length < 3) return []
      const safe = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%')
      const p = `%${safe}%`
      const { data: found, error } = await supabase
        .from('workers')
        .select('worker_id, first_name, last_name, email, occupation, employers(employer_name), worksites(worksite_name)')
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

  const combinedIdsKey = combinedWorkers
    .map((w) => w.worker_id)
    .sort((a, b) => a - b)
    .join(',')

  const bulkAddFiltersEnabled =
    step === 4 &&
    showBulkAdd &&
    (!!addFilterEmployerId || !!addFilterWorksiteId || addFilterOccupation.trim().length > 0)

  const { data: bulkNewCount = 0, isFetching: bulkCountLoading } = useQuery({
    queryKey: [
      'wizard-bulk-new-count',
      addFilterEmployerId,
      addFilterWorksiteId,
      addFilterOccupation,
      state.campaignId,
      combinedIdsKey,
    ],
    queryFn: async () => {
      let q = supabase
        .from('workers')
        .select('worker_id, first_name, last_name, email, occupation, employers(employer_name), worksites(worksite_name)')
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

  async function handleAddMatchingWorkers() {
    let q = supabase
      .from('workers')
      .select('worker_id, first_name, last_name, email, occupation, employers(employer_name), worksites(worksite_name)')
      .limit(500)
    if (addFilterEmployerId) q = q.eq('employer_id', addFilterEmployerId)
    if (addFilterWorksiteId) q = q.eq('worksite_id', addFilterWorksiteId)
    if (addFilterOccupation.trim()) {
      const occ = addFilterOccupation.trim().replace(/%/g, '\\%')
      q = q.ilike('occupation', `%${occ}%`)
    }
    const { data, error } = await q
    if (error) {
      toast.error(error.message)
      return
    }
    let rows = (data ?? []).map((row) => mapWorkerRow(row as Record<string, unknown>))
    if (state.campaignId) {
      const ids = rows.map((w) => w.worker_id)
      if (ids.length === 0) {
        toast.info('No workers match these filters on this campaign.')
        return
      }
      const { data: mem, error: memErr } = await supabase
        .from('campaign_worker_membership')
        .select('worker_id')
        .eq('campaign_id', state.campaignId)
        .in('worker_id', ids)
      if (memErr) {
        toast.error(memErr.message)
        return
      }
      const allowed = new Set((mem ?? []).map((m) => m.worker_id))
      rows = rows.filter((w) => allowed.has(w.worker_id))
    }
    const existing = new Set(combinedWorkers.map((w) => w.worker_id))
    const newRows = rows.filter((w) => !existing.has(w.worker_id))
    if (newRows.length === 0) {
      toast.info('No new workers to add (all matches are already on the list).')
      return
    }
    const empLabel = allEmployers.find((e) => e.employer_id === addFilterEmployerId)?.employer_name ?? 'Any employer'
    const wsLabel = addFilterWorksites.find((w) => w.worksite_id === addFilterWorksiteId)?.worksite_name
      ?? (addFilterWorksiteId ? 'Worksite' : 'All worksites')
    const sourceLabel = `Filter: ${empLabel} / ${wsLabel}`
    setAdditionalWorkers((prev) => [...prev, ...newRows])
    setWorkerSources((prev) => {
      const next = { ...prev }
      for (const w of newRows) next[w.worker_id] = sourceLabel
      return next
    })
    setSelectedWorkerIds((prev) => {
      const n = new Set(prev)
      for (const w of newRows) {
        if (w.email) n.add(w.worker_id)
      }
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
        if (error) {
          toast.error(error.message)
          return
        }
        if (!mem) {
          toast.error('This worker is not on the selected campaign.')
          return
        }
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
      if (w.email) n.add(w.worker_id)
      return n
    })
    toast.success('Worker added to list')
  }

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

  useQuery({
    queryKey: ['wizard-campaign-context', state.campaignId],
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

  const { data: addFilterWorksites = [] } = useQuery({
    queryKey: ['wizard-add-filter-worksites', addFilterEmployerId],
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

  const [manualVarOverrides, setManualVarOverrides] = useState<Record<string, string>>({})
  const [manualVarConfirmed, setManualVarConfirmed] = useState<Record<string, boolean>>({})

  const campaignVarContext = useMemo<Record<string, string | undefined>>(() => ({
    employer_name: state.employerName || undefined,
    agreement_name: state.agreementName || undefined,
    worksite_name: state.worksiteNames[0] || undefined,
    campaign_name: state.campaignName || undefined,
    organiser_name: state.organiserName || profile?.display_name || user?.email || undefined,
    organiser_phone: state.organiserPhone || undefined,
    staff_name: profile?.display_name || user?.email || undefined,
    staff_email: user?.email || undefined,
    staff_phone: undefined,
    staff_role: undefined,
    date: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
    ...manualVarOverrides,
  }), [state, profile, user, manualVarOverrides])

  const autoVarContext = useMemo<Record<string, string | undefined>>(() => ({
    employer_name: state.employerName || undefined,
    agreement_name: state.agreementName || undefined,
    worksite_name: state.worksiteNames[0] || undefined,
    campaign_name: state.campaignName || undefined,
    organiser_name: state.organiserName || profile?.display_name || user?.email || undefined,
    organiser_phone: state.organiserPhone || undefined,
    staff_name: profile?.display_name || user?.email || undefined,
    staff_email: user?.email || undefined,
    date: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
  }), [state.employerName, state.agreementName, state.worksiteNames, state.campaignName, state.organiserName, state.organiserPhone, profile, user])

  const unresolvedVars = useMemo(() => {
    if (!state.bodyText) return []
    const allText = state.subject + '\n' + state.bodyText
    const matches = allText.match(/\{\{(\w+)\}\}/g)
    if (!matches) return []
    const unique = [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, '')))]
    return unique.filter((key) => {
      if (RECIPIENT_VARIABLES.some((v) => v.key === key)) return false
      return !autoVarContext[key]
    })
  }, [state.bodyText, state.subject, autoVarContext])

  useEffect(() => {
    const keys = new Set(unresolvedVars)
    setManualVarConfirmed((prev) => {
      let changed = false
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        if (!keys.has(k)) {
          delete next[k]
          changed = true
        }
      }
      return changed ? next : prev
    })
    setManualVarOverrides((prev) => {
      let changed = false
      const next = { ...prev }
      for (const k of Object.keys(next)) {
        if (!keys.has(k)) {
          delete next[k]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [unresolvedVars])

  const allUnresolvedConfirmed =
    unresolvedVars.length > 0 && unresolvedVars.every((k) => manualVarConfirmed[k] === true)

  const wtpSelections = useMemo(() => ({
    tone: state.tone,
    audience: state.audience,
    platforms: ['Email'],
    engagement_intensity: state.engagementIntensity || undefined,
  }), [state.tone, state.audience, state.engagementIntensity])

  const stageName = state.stageNumber
    ? STAGE_NAMES[state.stageNumber as keyof typeof STAGE_NAMES] || `Stage ${state.stageNumber}`
    : 'General'

  function insertVariable(variable: string) {
    const textarea = bodyRef.current
    if (!textarea) {
      setState((prev) => ({ ...prev, bodyText: prev.bodyText + variable }))
      return
    }
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newValue = state.bodyText.substring(0, start) + variable + state.bodyText.substring(end)
    setState((prev) => ({ ...prev, bodyText: newValue }))
    requestAnimationFrame(() => {
      const pos = start + variable.length
      textarea.setSelectionRange(pos, pos)
      textarea.focus()
    })
  }

  function handleSelectTemplate(template: TemplateRow) {
    setState((prev) => ({
      ...prev,
      subject: template.subject_line || '',
      bodyText: template.body_text,
      bodyHtml: template.body_html || null,
      sourceTemplateId: template.template_id,
    }))
    setShowTemplatePicker(false)
  }

  async function handleCustomiseTemplate(template: TemplateRow) {
    setIsCustomising(true)
    try {
      const response = await fetch('/api/templates/customise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: template.template_id,
          subject_line: template.subject_line,
          body_text: template.body_text,
          stage_number: state.stageNumber || 1,
          stage_name: stageName,
          wtp_selections: wtpSelections,
        }),
      })
      if (!response.ok) throw new Error('Customisation failed')
      const result = await response.json()
      setState((prev) => ({
        ...prev,
        subject: result.adapted_subject || template.subject_line || '',
        bodyText: result.adapted_body_text || template.body_text,
        bodyHtml: template.body_html || null,
        sourceTemplateId: template.template_id,
      }))
      setShowTemplatePicker(false)
      toast.success('Template customised')
    } catch {
      toast.error('Customisation failed')
    } finally {
      setIsCustomising(false)
    }
  }

  async function handleAIGenerate() {
    const request: CommsDraftRequest = {
      campaign_id: state.campaignId || 0,
      plan_id: 0,
      stage_number: state.stageNumber || 1,
      stage_name: stageName,
      platform: 'email',
      campaign_context: {
        employer_name: state.employerName,
        agreement_name: state.agreementName,
        worksite_names: state.worksiteNames,
        sector: '',
      },
      wtp_selections: wtpSelections,
      custom_instructions: state.emailPurpose || undefined,
    }
    const result = await generateDraft.mutateAsync(request)
    setState((prev) => ({
      ...prev,
      subject: result.subject || '',
      bodyText: result.body_text,
      bodyHtml: result.body_html || null,
    }))
  }

  async function handleSaveDraft() {
    setIsSavingDraft(true)
    try {
      const draftFields = {
        campaign_id: state.campaignId,
        stage_number: state.stageNumber || 1,
        platform: 'email' as const,
        title: `Email – ${stageName}`,
        subject: state.subject || null,
        body: state.bodyText,
        body_html: state.bodyHtml,
        status: 'draft' as const,
        tone: state.tone.join(', ') || null,
        audience_segment: state.audience.join(', ') || null,
        source_template_ids: state.sourceTemplateId ? [state.sourceTemplateId] : null,
      }

      if (state.draftId) {
        const { error } = await supabase
          .from('campaign_comms_drafts')
          .update(draftFields)
          .eq('draft_id', state.draftId)
        if (error) throw error
        toast.success('Draft updated')
      } else {
        const { data, error } = await supabase
          .from('campaign_comms_drafts')
          .insert({ ...draftFields, created_by: user?.id })
          .select('draft_id')
          .single()
        if (error) throw error
        setState((prev) => ({ ...prev, draftId: data.draft_id }))
        toast.success('Draft saved')
      }
    } catch {
      toast.error('Failed to save draft')
    } finally {
      setIsSavingDraft(false)
    }
  }

  async function handlePushList() {
    setIsPushingList(true)
    setPushResults(null)
    try {
      let url: string
      let payload: Record<string, unknown>
      const ids = [...selectedWorkerIds]

      if (state.campaignId) {
        url = `/api/campaigns/${state.campaignId}/push-list`
        payload = { draft_id: state.draftId, filters: {}, worker_ids: ids }
      } else {
        url = '/api/email-wizard/push-standalone'
        payload = {
          employer_id: state.standaloneEmployerId || undefined,
          worksite_id: state.standaloneWorksiteId || undefined,
          worker_ids: ids.length > 0 ? ids : undefined,
        }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Push failed')
      setState((prev) => ({
        ...prev,
        preparedTag: {
          tag_id: data.tag_id,
          tag_href: data.tag_href,
          tag_name: data.tag_name,
          contacts_tagged: data.contacts_tagged,
          contacts_created: data.contacts_created,
        },
      }))
      if (data.worker_results) {
        setPushResults(data.worker_results)
      }
      toast.success(`${data.contacts_tagged + data.contacts_created} contacts pushed to AN`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Push failed')
    } finally {
      setIsPushingList(false)
    }
  }

  async function handlePushToAN() {
    if (!state.bodyText.trim()) return
    setIsPushingToAN(true)
    try {
      const ctx = campaignVarContext
      const resolvedSubject = translateToActionNetwork(resolveTemplateVariables(state.subject, ctx))
      const resolvedBody = translateToActionNetwork(resolveTemplateVariables(state.bodyHtml || state.bodyText, ctx))

      const messagePayload: Record<string, unknown> = {
        subject: resolvedSubject,
        body: resolvedBody,
        from: 'Offshore Alliance',
        reply_to: 'info@offshorealliance.org.au',
      }
      if (state.preparedTag?.tag_href) {
        messagePayload.targets = [{ href: state.preparedTag.tag_href }]
      }

      const createRes = await fetch('/api/action-network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_message', message: messagePayload }),
      })
      const createData = await createRes.json()
      if (!createData.success) throw new Error(createData.error)

      const messageHref = createData.data?._links?.self?.href ?? ''
      const messageId = messageHref.split('/').pop() || ''

      if (state.draftId) {
        await supabase
          .from('campaign_comms_drafts')
          .update({
            status: 'sent',
            sent_via: 'action_network',
            external_message_id: messageId,
          })
          .eq('draft_id', state.draftId)
      }

      setState((prev) => ({ ...prev, externalMessageId: messageId }))
      toast.success('Email pushed to Action Network')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Push failed')
    } finally {
      setIsPushingToAN(false)
    }
  }

  const canProceed: Record<number, boolean> = {
    1: true,
    2: state.tone.length > 0 && state.audience.length > 0,
    3: state.bodyText.trim().length > 0,
    4: true,
  }

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Wizard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and send a campaign email step by step
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            // #region agent log
            fetch('http://127.0.0.1:7485/ingest/91b5d340-cda7-4f2d-9be2-7828537c993f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'42d665'},body:JSON.stringify({sessionId:'42d665',runId:'pre-fix-1',hypothesisId:'H1',location:'EmailWizardSteps.tsx:cancel',message:'Email wizard cancel clicked',data:{step,campaignId:state.campaignId,standaloneEmployerId:state.standaloneEmployerId,standaloneWorksiteId:state.standaloneWorksiteId,hasDraft:!!state.draftId},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            router.push('/campaigns')
          }}
        >
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

      {/* Step 1: Campaign Context */}
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
                  ...(v === '__none__' ? { campaignName: '', employerName: '', agreementName: '', worksiteNames: [], organiserName: '', organiserPhone: '' } : {}),
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No campaign — standalone email" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No campaign — standalone email</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.campaign_id} value={c.campaign_id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Linking to a campaign enables variable auto-fill, list building, and draft saving.
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
              <Label>Email Purpose (optional)</Label>
              <Textarea
                value={state.emailPurpose}
                onChange={(e) => setState((prev) => ({ ...prev, emailPurpose: e.target.value }))}
                placeholder="What's the goal of this email? e.g., Announce bargaining dates, Rally support for protected action..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Tone & Audience */}
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

      {/* Step 3: Create Email */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Create Email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!state.bodyText && (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={() => setShowTemplatePicker(true)}
                >
                  <FileText className="h-6 w-6" />
                  <span>Use Template</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={() => {
                    setShowTemplatePicker(true)
                    setIsCustomising(true)
                  }}
                >
                  <Sparkles className="h-6 w-6" />
                  <span>AI Customise Template</span>
                </Button>
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
                  <span>{generateDraft.isPending ? 'Generating...' : 'AI Generate'}</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-24 flex-col gap-2"
                  onClick={() => setState((prev) => ({ ...prev, bodyText: ' ' }))}
                >
                  <PenLine className="h-6 w-6" />
                  <span>Write from Scratch</span>
                </Button>
              </div>
            )}

            {state.bodyText && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Subject Line</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setState((prev) => ({ ...prev, subject: '', bodyText: '', bodyHtml: null, sourceTemplateId: null }))}
                  >
                    Start Over
                  </Button>
                </div>
                <Input
                  value={state.subject}
                  onChange={(e) => setState((prev) => ({ ...prev, subject: e.target.value }))}
                  placeholder="Email subject line..."
                />

                <div>
                  <Label className="mb-1.5 block">Body</Label>
                  <div className="space-y-1 mb-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Variable className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground font-medium">Recipient:</span>
                      {RECIPIENT_VARIABLES.map((v) => (
                        <Button
                          key={v.key}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-5 text-[10px] font-mono px-1"
                          title={v.description}
                          onClick={() => insertVariable(`{{${v.key}}}`)}
                        >
                          {v.key}
                        </Button>
                      ))}
                      <span className="text-[10px] text-muted-foreground font-medium ml-1">Campaign:</span>
                      {CAMPAIGN_CONTEXT_VARIABLES.map((v) => (
                        <Button
                          key={v.key}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-5 text-[10px] font-mono px-1"
                          title={v.description}
                          onClick={() => insertVariable(`{{${v.key}}}`)}
                        >
                          {v.key}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    ref={bodyRef}
                    value={state.bodyText.trim() === '' ? '' : state.bodyText}
                    onChange={(e) => setState((prev) => ({ ...prev, bodyText: e.target.value, bodyHtml: null }))}
                    rows={12}
                    className="font-mono text-sm"
                    placeholder="Write your email body here..."
                  />
                  <p className="text-xs text-muted-foreground text-right mt-1">
                    {state.bodyText.trim().length} characters
                  </p>
                </div>

                {/* Unresolved variables editor */}
                {unresolvedVars.length > 0 && (
                  <Card
                    className={cn(
                      allUnresolvedConfirmed
                        ? 'border-emerald-200 bg-emerald-50/70'
                        : 'border-amber-200 bg-amber-50/50',
                    )}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle
                        className={cn(
                          'text-xs font-medium',
                          allUnresolvedConfirmed ? 'text-emerald-900' : 'text-amber-800',
                        )}
                      >
                        Unresolved Variables ({unresolvedVars.length})
                      </CardTitle>
                      {allUnresolvedConfirmed ? (
                        <p className="text-xs text-emerald-800 font-medium pt-0.5">
                          All values marked as correct.
                        </p>
                      ) : null}
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p
                        className={cn(
                          'text-xs mb-2',
                          allUnresolvedConfirmed ? 'text-emerald-800' : 'text-amber-700',
                        )}
                      >
                        These variables are in your email but don&apos;t have values yet. Fill them in below, tick
                        OK when each value is correct, or they&apos;ll appear as {'{{variable}}'} in the final email.
                      </p>
                      {unresolvedVars.map((varKey) => {
                        const varDef = CAMPAIGN_CONTEXT_VARIABLES.find((v) => v.key === varKey)
                        const confirmId = `unresolved-confirm-${varKey}`
                        return (
                          <div key={varKey} className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs shrink-0 w-36 justify-center">
                              {`{{${varKey}}}`}
                            </Badge>
                            <Input
                              value={manualVarOverrides[varKey] ?? ''}
                              onChange={(e) => {
                                const value = e.target.value
                                setManualVarOverrides((prev) => ({ ...prev, [varKey]: value }))
                                setManualVarConfirmed((prev) => ({ ...prev, [varKey]: false }))
                              }}
                              placeholder={varDef?.label || varKey.replace(/_/g, ' ')}
                              className="h-7 text-sm flex-1"
                            />
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Checkbox
                                id={confirmId}
                                checked={manualVarConfirmed[varKey] ?? false}
                                onCheckedChange={(checked) => {
                                  setManualVarConfirmed((prev) => ({ ...prev, [varKey]: checked === true }))
                                }}
                                aria-label={`Confirm value for {{${varKey}}}`}
                              />
                              <Label htmlFor={confirmId} className="text-xs font-normal cursor-pointer whitespace-nowrap">
                                OK
                              </Label>
                            </div>
                          </div>
                        )
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* Preview with resolved variables */}
                {state.bodyText.trim() && (
                  <Card className="bg-muted/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs text-muted-foreground font-medium">
                        Preview (with resolved variables)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {state.subject && (
                        <p className="text-sm font-medium mb-2">
                          Subject: {resolveTemplateVariables(state.subject, campaignVarContext)}
                        </p>
                      )}
                      <div className="text-sm whitespace-pre-wrap text-muted-foreground max-h-64 overflow-auto">
                        {resolveTemplateVariables(state.bodyText, campaignVarContext)}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {state.campaignId && (
                  <div className="flex items-center gap-2">
                    <Button onClick={handleSaveDraft} disabled={isSavingDraft || !state.bodyText.trim()}>
                      {isSavingDraft ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      {state.draftId ? 'Update Draft' : 'Save Draft'}
                    </Button>
                    {state.draftId && (
                      <Badge variant="outline" className="py-1.5 px-3 text-muted-foreground">
                        Draft #{state.draftId}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            )}

            <TemplatePicker
              open={showTemplatePicker}
              onClose={() => { setShowTemplatePicker(false); setIsCustomising(false) }}
              onSelect={handleSelectTemplate}
              onSelectAndCustomise={handleCustomiseTemplate}
              platform="email"
              stageNumber={state.stageNumber || 1}
              isCustomising={isCustomising}
            />
          </CardContent>
        </Card>
      )}

      {/* Step 4: List & Send */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Build List & Send</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Worker list table */}
            {(state.campaignId || state.standaloneEmployerId) && !state.preparedTag && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={workerSearch}
                      onChange={(e) => setWorkerSearch(e.target.value)}
                      placeholder="Search by name, email, or occupation..."
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
                      const withEmail = filteredWorkers.filter((w) => w.email)
                      setSelectedWorkerIds(new Set(withEmail.map((w) => w.worker_id)))
                    }}
                  >Select All</Button>
                  <Button
                    size="sm" variant="outline" className="text-xs h-7"
                    onClick={() => setSelectedWorkerIds(new Set())}
                  >Deselect All</Button>
                </div>

                {workersLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredWorkers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No workers found.</p>
                ) : (
                  <div className="border rounded-md max-h-72 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="w-8 p-2" />
                          <th className="text-left p-2 font-medium">Name</th>
                          <th className="text-left p-2 font-medium min-w-[8rem]">Source</th>
                          <th className="text-left p-2 font-medium">Email</th>
                          <th className="text-left p-2 font-medium hidden sm:table-cell">Occupation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredWorkers.map((w) => {
                          const checked = selectedWorkerIds.has(w.worker_id)
                          return (
                            <tr key={w.worker_id} className={`border-t ${!w.email ? 'opacity-50' : ''}`}>
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={!w.email}
                                  onChange={() => {
                                    const next = new Set(selectedWorkerIds)
                                    if (checked) next.delete(w.worker_id)
                                    else next.add(w.worker_id)
                                    setSelectedWorkerIds(next)
                                  }}
                                />
                              </td>
                              <td className="p-2">{w.first_name} {w.last_name}</td>
                              <td className="p-2 text-muted-foreground max-w-[10rem] sm:max-w-[14rem] align-top">
                                <span className="line-clamp-2">{resolveWorkerSourceLabel(w)}</span>
                              </td>
                              <td className="p-2 text-muted-foreground">{w.email || 'No email'}</td>
                              <td className="p-2 text-muted-foreground hidden sm:table-cell">{w.occupation || '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

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
                              <li
                                key={w.worker_id}
                                className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50"
                              >
                                <span>
                                  {w.first_name} {w.last_name}
                                  <span className="text-muted-foreground block">{w.email || 'No email'}</span>
                                </span>
                                {onList ? (
                                  <Badge variant="secondary" className="shrink-0 text-[10px]">Already added</Badge>
                                ) : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-7 shrink-0 text-xs"
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
                        Combine employer, worksite, and/or occupation. Multiple filters apply together (AND).
                        {state.campaignId ? ' Results are limited to workers on this campaign.' : ''}
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
                          type="button"
                          size="sm"
                          className="text-xs h-8"
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

                <Button
                  onClick={handlePushList}
                  disabled={isPushingList || selectedWorkerIds.size === 0}
                >
                  {isPushingList ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Users className="h-4 w-4 mr-2" />
                  )}
                  {isPushingList
                    ? 'Pushing contacts to AN...'
                    : `Push ${selectedWorkerIds.size} Selected Workers to AN`}
                </Button>
              </div>
            )}

            {/* Push results */}
            {pushResults && pushResults.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Push Results</Label>
                <div className="border rounded-md max-h-48 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left p-1.5 font-medium">Name</th>
                        <th className="text-left p-1.5 font-medium">Status</th>
                        <th className="text-left p-1.5 font-medium">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pushResults.map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-1.5">{r.name}</td>
                          <td className="p-1.5">
                            <Badge
                              variant={r.status === 'error' ? 'destructive' : r.status === 'skipped' ? 'secondary' : 'default'}
                              className="text-[10px]"
                            >
                              {r.status}
                            </Badge>
                          </td>
                          <td className="p-1.5 text-muted-foreground max-w-48 truncate">{r.detail || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pushResults.some((r) => r.status === 'error') && (
                  <div className="flex items-start gap-2 p-2 rounded bg-red-50 border border-red-200 text-xs text-red-700">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{pushResults.filter((r) => r.status === 'error').length} workers failed. Check the detail column for error messages.</span>
                  </div>
                )}
              </div>
            )}

            {/* Tag ready + send */}
            {state.preparedTag && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-green-800">
                      {state.preparedTag.contacts_tagged + state.preparedTag.contacts_created} contacts ready
                    </p>
                    <p className="text-green-700 text-xs">
                      Tag: {state.preparedTag.tag_name}
                      {state.preparedTag.contacts_created > 0 && ` (${state.preparedTag.contacts_created} new)`}
                    </p>
                  </div>
                </div>

                {!state.externalMessageId && (
                  <Button onClick={handlePushToAN} disabled={isPushingToAN || !state.bodyText.trim()}>
                    {isPushingToAN ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                    {isPushingToAN ? 'Pushing email...' : 'Push Email to Action Network'}
                  </Button>
                )}

                {state.externalMessageId && (
                  <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                      <span className="font-medium text-blue-800">Email ready in Action Network</span>
                    </div>
                    <p className="text-sm text-blue-700">
                      The email has been created in Action Network targeting {state.preparedTag.contacts_tagged + state.preparedTag.contacts_created} contacts.
                    </p>
                    <Button variant="outline" onClick={() => router.push('/campaigns')}>
                      Done — Back to Campaigns
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* No targeting fallback */}
            {!state.preparedTag && !state.campaignId && !state.standaloneEmployerId && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                  No target audience defined. You can still push the email to AN without targeting.
                </div>
                {!state.externalMessageId && (
                  <Button variant="outline" onClick={handlePushToAN} disabled={isPushingToAN || !state.bodyText.trim()}>
                    {isPushingToAN ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                    Push Email to AN (no targeting)
                  </Button>
                )}
                {state.externalMessageId && (
                  <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                      <span className="font-medium text-blue-800">Email created in Action Network</span>
                    </div>
                    <p className="text-sm text-blue-700">Go to Action Network to add recipients and schedule the send.</p>
                    <Button variant="outline" onClick={() => router.push('/campaigns')}>Done — Back to Campaigns</Button>
                  </div>
                )}
              </div>
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
