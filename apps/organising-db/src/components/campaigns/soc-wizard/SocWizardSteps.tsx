'use client'

/**
 * Top-level SOC wizard. Mirrors the email/phone wizard pattern but with a
 * coaching-driven shape: 11 steps total = Context, Populations, then 8 SOC
 * stages with multi-turn coaching, then Review.
 *
 * Stage 5 (Hope) is a single step with three sub-frames (Opportunity / Plan /
 * Don't Take The Lolly), each its own coaching session.
 *
 * Mounts on:
 *   - /campaigns/soc-wizard (standalone)
 *   - /campaigns/soc-wizard?session_id=N           (resume an existing session)
 *   - /campaigns/soc-wizard?campaign_id=N&...      (preload campaign context)
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ChevronLeft, ChevronRight, Loader2, Plus, Trash2, Lock, MessageSquare,
  FileText, Users, Target, Sparkles, RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { fetchApi, API_FETCH_TIMEOUT_LLM_MS } from '@/lib/api/fetch-api'
import { CoachChatPanel } from './CoachChatPanel'
import { ExportArtifactDialog } from './ExportArtifactDialog'
import { SocDiagramPanel } from './SocDiagramPanel'
import { StageSeedPanel } from './StageSeedPanel'
import { useSituationAnalysis } from '@/lib/hooks/useSituationAnalysis'
import {
  useSocSession,
  useCreateSocSession,
  useUpdateSocSession,
  useSocStageContent,
} from '@/lib/hooks/useSocWizard'
import type { HopeFrame, SocStage } from '@/lib/prompts/soc-framework'
import { SOC_STAGE_NAMES, HOPE_FRAME_NAMES } from '@/lib/prompts/soc-framework'
import { STAGE_COACHING } from '@/lib/prompts/soc/coaching'
import type { SocSessionPopulation } from '@/lib/prompts/soc/populations'

const HOPE_FRAMES: HopeFrame[] = ['opportunity', 'plan', 'dont_take_lolly']

interface StepDef {
  step: number
  label: string
  /** When set, this step renders a SOC stage. */
  socStage?: SocStage
}

const STEPS: StepDef[] = [
  { step: 1, label: 'Context' },
  { step: 2, label: 'Populations' },
  { step: 3, label: SOC_STAGE_NAMES[1], socStage: 1 },
  { step: 4, label: SOC_STAGE_NAMES[2], socStage: 2 },
  { step: 5, label: SOC_STAGE_NAMES[3], socStage: 3 },
  { step: 6, label: SOC_STAGE_NAMES[4], socStage: 4 },
  { step: 7, label: SOC_STAGE_NAMES[5], socStage: 5 },  // Hope
  { step: 8, label: SOC_STAGE_NAMES[6], socStage: 6 },
  { step: 9, label: SOC_STAGE_NAMES[7], socStage: 7 },
  { step: 10, label: SOC_STAGE_NAMES[8], socStage: 8 },
  { step: 11, label: 'Review & export' },
]

export function SocWizardSteps() {
  const router = useRouter()
  const params = useSearchParams()
  const initialSessionId = params.get('session_id')
  const initialCampaignId = params.get('campaign_id')
  const initialStageNumber = params.get('stage_number')
  const initialCapacityId = params.get('capacity_id')

  const [sessionId, setSessionId] = useState<number | null>(
    initialSessionId ? Number(initialSessionId) : null
  )
  const [step, setStep] = useState(1)
  const [exportingScope, setExportingScope] = useState<{
    stage_number?: SocStage
    hope_frame?: HopeFrame
    label?: string
  } | null>(null)

  const session = useSocSession(sessionId)
  const stageContent = useSocStageContent(sessionId)
  const createSession = useCreateSocSession()
  const updateSession = useUpdateSocSession()

  // ---------------- Step 1: Context ----------------
  const [contextTitle, setContextTitle] = useState('')
  const [contextSituation, setContextSituation] = useState('')
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [contextSnapshot, setContextSnapshot] = useState<any>(null)

  // Preload context when campaign_id is in URL
  useEffect(() => {
    if (!initialCampaignId || sessionId) return
    setSnapshotLoading(true)
    fetchApi('/api/soc-wizard/context-snapshot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        campaign_id: Number(initialCampaignId),
        stage_number: initialStageNumber ? Number(initialStageNumber) : undefined,
      }),
      timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed to load context')
        return r.json()
      })
      .then((data) => {
        setContextSnapshot(data.snapshot)
        const stageBit = data.snapshot?.stage?.stage_name ? ` — ${data.snapshot.stage.stage_name}` : ''
        setContextTitle(`${data.snapshot?.campaign?.name ?? 'Campaign'} SOC${stageBit}`)
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setSnapshotLoading(false))
  }, [initialCampaignId, initialStageNumber, sessionId])

  // Populate state from existing session
  useEffect(() => {
    if (session.data && step === 1 && !contextTitle) {
      setContextTitle(session.data.title)
      setContextSituation(session.data.custom_situation ?? '')
      setContextSnapshot(session.data.context_snapshot)
    }
  }, [session.data, step, contextTitle])

  // ---------------- Step 2: Populations ----------------
  const [populations, setPopulations] = useState<SocSessionPopulation[]>([])
  const [populationsPrefilledFromSA, setPopulationsPrefilledFromSA] = useState(false)
  useEffect(() => {
    if (session.data?.target_populations && session.data.target_populations.length > 0 && populations.length === 0) {
      setPopulations(session.data.target_populations)
    }
  }, [session.data, populations.length])

  // Pre-fill from situation analysis ONLY when no session exists yet AND
  // no populations have been entered. Once the session is created, the
  // saved target_populations are authoritative — no auto-overwrite.
  useEffect(() => {
    if (sessionId) return
    if (populations.length > 0) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saPops = (contextSnapshot?.situation_analysis as any)?.workforce_populations
    if (!Array.isArray(saPops) || saPops.length === 0) return
    setPopulations(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (saPops as any[]).map((p) => ({
        name: p.name ?? '',
        description: p.approx_size ? `~${p.approx_size} workers` : (p.source_of_evidence ?? undefined),
        characteristics: p.soc_emphasis ?? undefined,
      }))
    )
    setPopulationsPrefilledFromSA(true)
  }, [contextSnapshot, sessionId, populations.length])

  function addPopulation() {
    setPopulations((p) => [...p, { name: '', description: '', characteristics: '' }])
  }
  function updatePopulation(i: number, patch: Partial<SocSessionPopulation>) {
    setPopulations((p) => p.map((pp, idx) => (idx === i ? { ...pp, ...patch } : pp)))
  }
  function removePopulation(i: number) {
    setPopulations((p) => p.filter((_, idx) => idx !== i))
  }

  // ---------------- Step navigation ----------------
  const totalSteps = STEPS.length
  const progressPct = Math.round((step / totalSteps) * 100)
  const currentStep = STEPS[step - 1]

  const lockedStageIndex = useMemo(() => {
    const set = new Set<string>()
    for (const c of stageContent.data || []) {
      const key = c.stage_number === 5
        ? `5:${c.hope_frame}:none`
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : `${c.stage_number}:none:${(c as any).population_index ?? 'none'}`
      set.add(key)
    }
    return set
  }, [stageContent.data])

  const isStageFullyLocked = useCallback((s: SocStage): boolean => {
    if (s === 5) return HOPE_FRAMES.every((f) => lockedStageIndex.has(`5:${f}:none`))
    if (populations.length > 0) {
      return populations.every((_, i) => lockedStageIndex.has(`${s}:none:${i}`))
    }
    return lockedStageIndex.has(`${s}:none:none`)
  }, [lockedStageIndex, populations])

  async function ensureSessionExists(): Promise<number | null> {
    if (sessionId) return sessionId
    const t = (contextTitle || 'New SOC').trim()
    if (!t) {
      toast.error('Give this SOC a title first.')
      return null
    }
    try {
      const created = await createSession.mutateAsync({
        campaign_id: initialCampaignId ? Number(initialCampaignId) : null,
        plan_id: contextSnapshot?.stage?.plan_id ?? null,
        stage_number: initialStageNumber ? Number(initialStageNumber) : null,
        capacity_id: initialCapacityId ? Number(initialCapacityId) : null,
        title: t,
        target_populations: populations,
        context_snapshot: contextSnapshot ?? {},
        custom_situation: contextSituation || null,
      })
      setSessionId(created.session_id)
      // Push the session_id into the URL so refresh resumes correctly
      const sp = new URLSearchParams(params.toString())
      sp.set('session_id', String(created.session_id))
      router.replace(`/campaigns/soc-wizard?${sp.toString()}`)
      return created.session_id
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start SOC')
      return null
    }
  }

  async function persistContext() {
    if (!sessionId) return
    await updateSession.mutateAsync({
      session_id: sessionId,
      patch: {
        title: contextTitle,
        custom_situation: contextSituation || null,
        context_snapshot: contextSnapshot ?? {},
      },
    }).catch((e) => toast.error(e instanceof Error ? e.message : 'Save failed'))
  }
  async function persistPopulations() {
    if (!sessionId) return
    await updateSession.mutateAsync({
      session_id: sessionId,
      patch: { target_populations: populations },
    }).catch((e) => toast.error(e instanceof Error ? e.message : 'Save failed'))
  }

  const [partialLockPrompt, setPartialLockPrompt] = useState<{
    stage: SocStage; lockedCount: number; totalCount: number
  } | null>(null)

  // Clear the prompt whenever the visible step changes (Back, step pills, etc.)
  useEffect(() => { setPartialLockPrompt(null) }, [step])

  async function handleNext() {
    if (step === 1) {
      const id = await ensureSessionExists()
      if (!id) return
      await persistContext()
    }
    if (step === 2) await persistPopulations()

    // If this is a population-tabbed stage with some (not all) populations locked,
    // pause and ask the user whether to refine the remaining tabs or move on.
    const stage = currentStep.socStage
    if (stage && stage !== 5 && populations.length > 1 && !partialLockPrompt) {
      const lockedCount = populations.filter(
        (_, i) => lockedStageIndex.has(`${stage}:none:${i}`)
      ).length
      if (lockedCount > 0 && lockedCount < populations.length) {
        setPartialLockPrompt({ stage, lockedCount, totalCount: populations.length })
        return
      }
    }

    setPartialLockPrompt(null)
    setStep((s) => Math.min(totalSteps, s + 1))
  }
  function handleBack() {
    setPartialLockPrompt(null)
    setStep((s) => Math.max(1, s - 1))
  }

  // ---------------- Render ----------------
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-semibold text-slate-900 inline-flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-slate-700" />
            Structured Organising Conversation
          </h1>
          <div className="text-sm text-slate-500">
            Step {step} of {totalSteps} — {currentStep.label}
          </div>
        </div>
        <Progress value={progressPct} className="h-1" />
        {session.data && (
          <div className="text-xs text-slate-500 mt-2 inline-flex items-center gap-2">
            <Badge variant="secondary">{session.data.status}</Badge>
            <span>{session.data.title}</span>
          </div>
        )}
      </div>

      <StaleSituationAnalysisBanner
        sessionId={sessionId}
        campaignId={session.data?.campaign_id ?? null}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        snapshotVersion={(session.data?.context_snapshot as any)?.situation_analysis?.version ?? null}
        onRefreshed={(snap) => setContextSnapshot(snap)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
      <div>

      {/* Step 1: Context */}
      {step === 1 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold">Context</h2>
            </div>
            {snapshotLoading && (
              <p className="text-xs text-slate-500 inline-flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading campaign context…
              </p>
            )}
            <div>
              <Label className="text-xs">Title</Label>
              <Input
                value={contextTitle}
                onChange={(e) => setContextTitle(e.target.value)}
                placeholder="A short name for this SOC"
              />
            </div>
            <div>
              <Label className="text-xs">Situation</Label>
              <Textarea
                value={contextSituation}
                onChange={(e) => setContextSituation(e.target.value)}
                placeholder="What is this SOC about? Known issues, calls to action, who you are talking with, etc."
                className="min-h-[120px]"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                The coach will use this as context across every stage. If this SOC was launched from a campaign planner stage, key facts (employer, ambitions, where-to-plays) are already loaded — see the context preview below.
              </p>
            </div>
            {contextSnapshot && (
              <ContextPreview snapshot={contextSnapshot} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Populations */}
      {step === 2 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold">Populations</h2>
            </div>
            <p className="text-xs text-slate-600">
              Identify the discrete worker populations relevant to THIS SOC. Different populations carry different leverage, surface different issues, and respond to different language. Add as many as are relevant — there is no fixed list.
            </p>
            {populationsPrefilledFromSA && (
              <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-2">
                Pre-filled from this campaign&apos;s situation analysis. Edit, add, or remove freely — the SOC&apos;s populations are independent of the analysis.
              </div>
            )}
            <div className="space-y-3">
              {populations.length === 0 && (
                <p className="text-xs text-slate-500 italic">
                  No populations yet. Skip if not relevant, or add at least one to get population-aware coaching.
                </p>
              )}
              {populations.map((pop, i) => (
                <div key={i} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={pop.name}
                      onChange={(e) => updatePopulation(i, { name: e.target.value })}
                      placeholder="Population name (e.g. Permanent workforce)"
                      className="text-sm flex-1"
                    />
                    <Button variant="ghost" size="sm" onClick={() => removePopulation(i)}>
                      <Trash2 className="h-4 w-4 text-slate-500" />
                    </Button>
                  </div>
                  <Textarea
                    value={pop.description ?? ''}
                    onChange={(e) => updatePopulation(i, { description: e.target.value })}
                    placeholder="Short description"
                    className="text-sm"
                  />
                  <Textarea
                    value={pop.characteristics ?? ''}
                    onChange={(e) => updatePopulation(i, { characteristics: e.target.value })}
                    placeholder="Distinguishing characteristics — what makes this population different from others?"
                    className="text-sm"
                  />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addPopulation}>
                <Plus className="h-4 w-4" />
                Add population
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Steps 3-10: SOC stages */}
      {currentStep.socStage !== undefined && sessionId && (
        <SocStageStep
          session_id={sessionId}
          stage={currentStep.socStage as SocStage}
          stageContent={stageContent.data || []}
          populations={populations}
          situation={
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((session.data?.context_snapshot as any)?.situation_analysis ?? null) ||
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((contextSnapshot as any)?.situation_analysis ?? null)
          }
          onScrollToTop={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        />
      )}
      {currentStep.socStage !== undefined && !sessionId && (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-slate-600">
              Save Step 1 first to start coaching.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 11: Review */}
      {step === 11 && sessionId && (
        <ReviewStep
          session_id={sessionId}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          stageContent={(stageContent.data as any[]) || []}
          populations={populations}
          campaign_id={session.data?.campaign_id ?? null}
          onExport={(scope) => setExportingScope(scope)}
        />
      )}

      </div>{/* end left column */}

      <div className="hidden lg:block">
        <SocDiagramPanel activeStage={currentStep.socStage ?? null} />
      </div>

      </div>{/* end grid */}

      {partialLockPrompt && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-amber-900">
              Stage {partialLockPrompt.stage} — {partialLockPrompt.lockedCount} of {partialLockPrompt.totalCount} population drafts locked
            </div>
            <div className="text-xs text-amber-800 mt-0.5">
              Refine the remaining population tabs to tailor the language for each group, or move on and return later.
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setPartialLockPrompt(null)}>
              Stay on this stage
            </Button>
            <Button size="sm" onClick={() => { setPartialLockPrompt(null); setStep((s) => Math.min(totalSteps, s + 1)) }}>
              Move to next stage
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          variant="ghost"
          onClick={handleBack}
          disabled={step === 1}
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex flex-wrap gap-1 max-w-md">
          {STEPS.map((s) => {
            const isLocked = s.socStage ? isStageFullyLocked(s.socStage) : false
            return (
              <button
                key={s.step}
                onClick={() => { setPartialLockPrompt(null); sessionId && setStep(s.step) }}
                disabled={!sessionId && s.step > 1}
                className={
                  'text-[10px] px-1.5 py-0.5 rounded ' +
                  (s.step === step
                    ? 'bg-slate-900 text-white'
                    : isLocked
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40')
                }
                title={s.label}
              >
                {s.step}
                {isLocked && '·'}
              </button>
            )
          })}
        </div>
        <Button onClick={handleNext} disabled={step === totalSteps}>
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {exportingScope && sessionId && (
        <ExportArtifactDialog
          open={!!exportingScope}
          onOpenChange={(o) => !o && setExportingScope(null)}
          session_id={sessionId}
          campaign_id={session.data?.campaign_id ?? null}
          stage_number={exportingScope.stage_number}
          hope_frame={exportingScope.hope_frame}
          scopeLabel={exportingScope.label}
        />
      )}
    </div>
  )
}

// ---------------- Per-stage step (3-10) ----------------

function SocStageStep({
  session_id,
  stage,
  stageContent,
  populations,
  situation,
  onScrollToTop,
}: {
  session_id: number
  stage: SocStage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stageContent: any[]
  populations: SocSessionPopulation[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  situation: any | null
  onScrollToTop: () => void
}) {
  // Composer state keyed by (stage, frame, popIdx) so each tab is independent.
  const [composers, setComposers] = useState<Record<string, string>>({})
  const composerKey = (frame?: HopeFrame, popIdx?: number | null) =>
    `${stage}:${frame ?? 'none'}:${popIdx ?? 'none'}`
  const setComposerFor = (frame: HopeFrame | undefined, popIdx: number | null | undefined, next: string) =>
    setComposers((prev) => ({ ...prev, [composerKey(frame, popIdx)]: next }))
  const composerFor = (frame?: HopeFrame, popIdx?: number | null) =>
    composers[composerKey(frame, popIdx)] ?? ''
  // Track whether the user has ever typed in a given composer slot.
  // Used to decide whether to show the sibling-seed pre-fill: once a user
  // has touched a composer (even if they then clear it), don't re-seed.
  const composerTouched = (popIdx: number) => composerKey(undefined, popIdx) in composers

  function appendSeed(frame: HopeFrame | undefined, popIdx: number | null | undefined, body: string) {
    const current = composerFor(frame, popIdx)
    const next = current.trim().length > 0 ? `${current}\n\n${body}` : body
    setComposerFor(frame, popIdx, next)
  }

  if (stage === 5) {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold">Stage 5 — Hope</h2>
          </div>
          <p className="text-xs text-slate-600">
            Three frames in sequence. Each frame is its own coaching session and lock — work through them in any order, but lock all three before moving on.
          </p>
          <Tabs defaultValue="opportunity">
            <TabsList className="grid grid-cols-3 w-full">
              {HOPE_FRAMES.map((f) => {
                const locked = stageContent.some(
                  (c) => c.stage_number === 5 && c.hope_frame === f
                )
                return (
                  <TabsTrigger key={f} value={f} className="text-xs">
                    {HOPE_FRAME_NAMES[f]}
                    {locked && <Lock className="h-3 w-3 ml-1" />}
                  </TabsTrigger>
                )
              })}
            </TabsList>
            {HOPE_FRAMES.map((f) => {
              const locked = stageContent.find(
                (c) => c.stage_number === 5 && c.hope_frame === f
              )
              return (
                <TabsContent key={f} value={f} className="mt-3 space-y-3">
                  <StageSeedPanel
                    stage={5}
                    hopeFrame={f}
                    situation={situation}
                    onSeed={(body) => appendSeed(f, null, body)}
                  />
                  <CoachChatPanel
                    session_id={session_id}
                    stage_number={5}
                    stage_name={`Hope — ${HOPE_FRAME_NAMES[f]}`}
                    hope_frame={f}
                    alreadyLocked={!!locked}
                    initialLockedContent={locked?.locked_content ?? ''}
                    onLocked={onScrollToTop}
                    composerText={composerFor(f, null)}
                    onComposerTextChange={(next) => setComposerFor(f, null, next)}
                  />
                </TabsContent>
              )
            })}
          </Tabs>
        </CardContent>
      </Card>
    )
  }

  // Population tabs — stages 1-4, 6-8
  if (populations.length > 0) {
    // First locked sibling row — used to seed other population composers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const siblingLockRow: any = stageContent.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c.stage_number === stage && !c.hope_frame && c.population_index != null
    )
    const siblingContent: string | null = siblingLockRow?.locked_content ?? null
    const siblingPopName: string | null = siblingLockRow != null
      ? (populations[siblingLockRow.population_index]?.name ?? null)
      : null

    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold">
              Stage {stage} — {SOC_STAGE_NAMES[stage]}
            </h2>
          </div>
          <p className="text-xs text-slate-600">{STAGE_COACHING[stage].short_purpose}</p>
          <Tabs defaultValue="0">
            <TabsList className={`grid w-full`} style={{ gridTemplateColumns: `repeat(${populations.length}, minmax(0, 1fr))` }}>
              {populations.map((pop, i) => {
                const isLocked = stageContent.some(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (c: any) => c.stage_number === stage && !c.hope_frame && c.population_index === i
                )
                return (
                  <TabsTrigger key={i} value={String(i)} className="text-xs">
                    {pop.name || `Population ${i + 1}`}
                    {isLocked && <Lock className="h-3 w-3 ml-1" />}
                  </TabsTrigger>
                )
              })}
            </TabsList>
            {populations.map((_, i) => {
              const locked = stageContent.find(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (c: any) => c.stage_number === stage && !c.hope_frame && c.population_index === i
              )
              // Seed the composer from a locked sibling if this tab hasn't been touched
              const showSeed = !locked && !composerTouched(i) && !!siblingContent && siblingLockRow?.population_index !== i
              const effectiveComposer = composerTouched(i) ? composerFor(undefined, i) : (showSeed ? siblingContent! : '')
              return (
                <TabsContent key={i} value={String(i)} className="mt-3 space-y-3">
                  {showSeed && siblingPopName && (
                    <div className="text-xs bg-blue-50 border border-blue-200 rounded px-3 py-2 text-blue-800">
                      Starting from <span className="font-medium">{siblingPopName}</span>&apos;s locked draft — edit to suit this population.
                    </div>
                  )}
                  <StageSeedPanel
                    stage={stage}
                    situation={situation}
                    onSeed={(body) => appendSeed(undefined, i, body)}
                  />
                  <CoachChatPanel
                    session_id={session_id}
                    stage_number={stage}
                    stage_name={SOC_STAGE_NAMES[stage]}
                    population_index={i}
                    alreadyLocked={!!locked}
                    initialLockedContent={locked?.locked_content ?? ''}
                    onLocked={onScrollToTop}
                    composerText={effectiveComposer}
                    onComposerTextChange={(next) => setComposerFor(undefined, i, next)}
                  />
                </TabsContent>
              )
            })}
          </Tabs>
        </CardContent>
      </Card>
    )
  }

  // No populations — single draft (original behaviour)
  const locked = stageContent.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c: any) => c.stage_number === stage && !c.hope_frame && c.population_index == null
  )

  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold">
            Stage {stage} — {SOC_STAGE_NAMES[stage]}
          </h2>
          {locked && <Badge className="bg-emerald-100 text-emerald-700" variant="secondary">Locked</Badge>}
        </div>
        <p className="text-xs text-slate-600">{STAGE_COACHING[stage].short_purpose}</p>
        <StageSeedPanel
          stage={stage}
          situation={situation}
          onSeed={(body) => appendSeed(undefined, null, body)}
        />
        <CoachChatPanel
          session_id={session_id}
          stage_number={stage}
          stage_name={SOC_STAGE_NAMES[stage]}
          alreadyLocked={!!locked}
          initialLockedContent={locked?.locked_content ?? ''}
          onLocked={onScrollToTop}
          composerText={composerFor(undefined, null)}
          onComposerTextChange={(next) => setComposerFor(undefined, null, next)}
        />
      </CardContent>
    </Card>
  )
}

// ---------------- Review step ----------------

function ReviewStep({
  session_id,
  stageContent,
  populations,
  campaign_id,
  onExport,
}: {
  session_id: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stageContent: any[]
  populations: SocSessionPopulation[]
  campaign_id: number | null
  onExport: (scope: { stage_number?: SocStage; hope_frame?: HopeFrame; label?: string }) => void
}) {
  const sorted = [...stageContent].sort((a, b) => {
    if (a.stage_number !== b.stage_number) return a.stage_number - b.stage_number
    const order: Record<string, number> = { opportunity: 0, plan: 1, dont_take_lolly: 2 }
    const frameOrder = (order[a.hope_frame ?? ''] ?? 0) - (order[b.hope_frame ?? ''] ?? 0)
    if (frameOrder !== 0) return frameOrder
    return (a.population_index ?? -1) - (b.population_index ?? -1)
  })

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold">Review & export</h2>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            All locked stages below. Use as-is for site visits, or convert into a phone script, email, or SMS draft using the existing wizards.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onExport({ label: 'Whole SOC' })}>
            <Sparkles className="h-4 w-4" />
            Export whole SOC
          </Button>
        </div>

        {sorted.length === 0 && (
          <p className="text-sm text-slate-500 italic">
            Nothing locked yet. Walk back through the stages and lock at least one before exporting.
          </p>
        )}

        <div className="space-y-3">
          {sorted.map((c) => (
            <div key={c.content_id} className="border rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-slate-700">
                  Stage {c.stage_number} — {c.stage_name}
                  {c.hope_frame && (
                    <span className="text-slate-500 font-normal"> · {HOPE_FRAME_NAMES[c.hope_frame as HopeFrame]}</span>
                  )}
                  {c.population_index != null && populations[c.population_index] && (
                    <span className="text-slate-500 font-normal"> · {populations[c.population_index].name}</span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onExport({
                      stage_number: c.stage_number as SocStage,
                      hope_frame: (c.hope_frame ?? undefined) as HopeFrame | undefined,
                      label: `Stage ${c.stage_number}${c.hope_frame ? ` (${HOPE_FRAME_NAMES[c.hope_frame as HopeFrame]})` : ''}`,
                    })
                  }
                >
                  Export this stage
                </Button>
              </div>
              <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                {c.locked_content}
              </div>
            </div>
          ))}
        </div>

        {!campaign_id && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            This SOC was created standalone (no campaign). Email / SMS / phone exports need a campaign — either re-launch from a campaign planner or use the snippet export.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------- Stale situation-analysis banner ----------------

function StaleSituationAnalysisBanner({
  sessionId,
  campaignId,
  snapshotVersion,
  onRefreshed,
}: {
  sessionId: number | null
  campaignId: number | null
  snapshotVersion: number | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRefreshed: (snapshot: any) => void
}) {
  const { data } = useSituationAnalysis(campaignId)
  const updateSession = useUpdateSocSession()
  const [dismissed, setDismissed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  if (!sessionId || !campaignId) return null
  if (dismissed) return null
  const currentVersion = data?.row?.version ?? null
  if (currentVersion === null || snapshotVersion === null) return null
  if (currentVersion <= snapshotVersion) return null

  async function handleRefresh() {
    if (!sessionId || !campaignId) return
    setRefreshing(true)
    try {
      const res = await fetchApi('/api/soc-wizard/context-snapshot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId }),
        timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to refresh')
      const { snapshot } = await res.json()
      await updateSession.mutateAsync({
        session_id: sessionId,
        patch: { context_snapshot: snapshot },
      })
      onRefreshed(snapshot)
      toast.success('Situation analysis refreshed')
      setDismissed(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 flex items-start justify-between gap-3">
      <div className="text-xs text-amber-900">
        <div className="font-medium">Situation analysis updated</div>
        <div className="text-amber-800/80">
          This campaign&apos;s situation analysis has been updated (v{snapshotVersion} → v{currentVersion}) since this SOC was started. Refresh to bring the new context into the coach prompt and the seed panels. Locked stages and chat history are preserved.
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
          Dismiss
        </Button>
        <Button size="sm" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Refresh context
        </Button>
      </div>
    </div>
  )
}

// ---------------- Context preview ----------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ContextPreview({ snapshot }: { snapshot: any }) {
  if (!snapshot) return null
  const items: { label: string; value: string }[] = []
  if (snapshot.campaign?.name) items.push({ label: 'Campaign', value: snapshot.campaign.name })
  if (snapshot.agreement?.agreement_name) items.push({ label: 'Agreement', value: snapshot.agreement.agreement_name })
  if (snapshot.organiser?.organiser_name) items.push({ label: 'Lead organiser', value: snapshot.organiser.organiser_name })
  if (snapshot.stage?.stage_number) items.push({ label: 'Planner stage', value: `${snapshot.stage.stage_number} — ${snapshot.stage.stage_name ?? ''}` })

  return (
    <div className="border rounded-md p-3 bg-slate-50">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 mb-2">
        Loaded context
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map((it) => (
          <div key={it.label} className="text-xs">
            <span className="text-slate-500">{it.label}:</span>{' '}
            <span className="text-slate-800 font-medium">{it.value}</span>
          </div>
        ))}
      </div>
      {Array.isArray(snapshot.ambitions) && snapshot.ambitions.length > 0 && (
        <div className="mt-3 text-xs">
          <div className="text-slate-500">Stage ambitions:</div>
          <ul className="list-disc list-inside text-slate-800">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {snapshot.ambitions.slice(0, 5).map((a: any, i: number) => (
              <li key={i}>{a.custom_text}</li>
            ))}
          </ul>
        </div>
      )}
      {Array.isArray(snapshot.where_to_play) && snapshot.where_to_play.length > 0 && (
        <div className="mt-3 text-xs">
          <div className="text-slate-500">Where to play:</div>
          <ul className="list-disc list-inside text-slate-800">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {snapshot.where_to_play.slice(0, 8).map((w: any, i: number) => (
              <li key={i}>
                {w.option_text}
                {w.category_name && <span className="text-slate-500"> · {w.category_name}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {snapshot.situation_analysis && <StrategicSituationPreview sa={snapshot.situation_analysis} />}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StrategicSituationPreview({ sa }: { sa: any }) {
  const topIssues: { label: string; heat: number }[] = (sa.top_issues || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((i: any) => i.label?.trim().length > 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => (b.heat ?? 0) - (a.heat ?? 0))
    .slice(0, 3)
  const playbookCount = (sa.company_playbook || []).length
  const populationCount = (sa.workforce_populations || []).length
  const gaps: { question: string }[] = (sa.information_gaps || []).slice(0, 3)
  const stateMap: Record<string, string> = {
    no_engagement: 'No engagement',
    preemptive_setup: 'Pre-emptive setup',
    bargaining_underway: 'Bargaining underway',
    agreement_balloted: 'Agreement balloted',
    employer_delaying: 'Employer delaying',
    industrial_action_phase: 'Industrial action phase',
    post_settlement: 'Post-settlement',
    other: 'Other',
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-200">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-amber-700 mb-1.5">
        Strategic situation (v{sa.version ?? 1})
      </div>
      {sa.employer_interaction_state && (
        <div className="text-xs">
          <span className="text-slate-500">Employer state:</span>{' '}
          <span className="text-slate-800 font-medium">{stateMap[sa.employer_interaction_state] ?? sa.employer_interaction_state}</span>
        </div>
      )}
      {topIssues.length > 0 && (
        <div className="text-xs mt-1.5">
          <div className="text-slate-500">Top issues by heat:</div>
          <ul className="list-disc list-inside text-slate-800">
            {topIssues.map((it, i) => (
              <li key={i}>
                {it.label}{' '}
                <span className="text-slate-500">({it.heat}/5)</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(playbookCount > 0 || populationCount > 0) && (
        <div className="text-[11px] text-slate-600 mt-1.5">
          {playbookCount > 0 && <>{playbookCount} predicted playbook move{playbookCount !== 1 ? 's' : ''}</>}
          {playbookCount > 0 && populationCount > 0 && ' · '}
          {populationCount > 0 && <>{populationCount} workforce population{populationCount !== 1 ? 's' : ''}</>}
        </div>
      )}
      {gaps.length > 0 && (
        <div className="mt-2 text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded p-2">
          <div className="font-medium mb-0.5">Open questions in the situation analysis</div>
          <ul className="list-disc list-inside">
            {gaps.map((g, i) => (
              <li key={i}>{g.question}</li>
            ))}
          </ul>
          <div className="mt-1 text-amber-800/70">
            Closing these out before the SOC will give the coach more grounded context.
          </div>
        </div>
      )}
    </div>
  )
}
