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
import { CoachChatPanel } from './CoachChatPanel'
import { ExportArtifactDialog } from './ExportArtifactDialog'
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
    fetch('/api/soc-wizard/context-snapshot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        campaign_id: Number(initialCampaignId),
        stage_number: initialStageNumber ? Number(initialStageNumber) : undefined,
      }),
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
  useEffect(() => {
    if (session.data?.target_populations && session.data.target_populations.length > 0 && populations.length === 0) {
      setPopulations(session.data.target_populations)
    }
  }, [session.data, populations.length])

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
      const key = c.stage_number === 5 ? `5:${c.hope_frame}` : `${c.stage_number}`
      set.add(key)
    }
    return set
  }, [stageContent.data])

  const isStageFullyLocked = useCallback((s: SocStage): boolean => {
    if (s === 5) return HOPE_FRAMES.every((f) => lockedStageIndex.has(`5:${f}`))
    return lockedStageIndex.has(`${s}`)
  }, [lockedStageIndex])

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

  async function handleNext() {
    if (step === 1) {
      const id = await ensureSessionExists()
      if (!id) return
      await persistContext()
    }
    if (step === 2) await persistPopulations()
    setStep((s) => Math.min(totalSteps, s + 1))
  }
  function handleBack() {
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
          campaign_id={session.data?.campaign_id ?? null}
          onExport={(scope) => setExportingScope(scope)}
        />
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
                onClick={() => sessionId && setStep(s.step)}
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
  onScrollToTop,
}: {
  session_id: number
  stage: SocStage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stageContent: any[]
  onScrollToTop: () => void
}) {
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
                <TabsContent key={f} value={f} className="mt-3">
                  <CoachChatPanel
                    session_id={session_id}
                    stage_number={5}
                    stage_name={`Hope — ${HOPE_FRAME_NAMES[f]}`}
                    hope_frame={f}
                    alreadyLocked={!!locked}
                    initialLockedContent={locked?.locked_content ?? ''}
                    onLocked={onScrollToTop}
                  />
                </TabsContent>
              )
            })}
          </Tabs>
        </CardContent>
      </Card>
    )
  }

  const locked = stageContent.find(
    (c) => c.stage_number === stage && !c.hope_frame
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
        <CoachChatPanel
          session_id={session_id}
          stage_number={stage}
          stage_name={SOC_STAGE_NAMES[stage]}
          alreadyLocked={!!locked}
          initialLockedContent={locked?.locked_content ?? ''}
          onLocked={onScrollToTop}
        />
      </CardContent>
    </Card>
  )
}

// ---------------- Review step ----------------

function ReviewStep({
  session_id,
  stageContent,
  campaign_id,
  onExport,
}: {
  session_id: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stageContent: any[]
  campaign_id: number | null
  onExport: (scope: { stage_number?: SocStage; hope_frame?: HopeFrame; label?: string }) => void
}) {
  const sorted = [...stageContent].sort((a, b) => {
    if (a.stage_number !== b.stage_number) return a.stage_number - b.stage_number
    const order: Record<string, number> = { opportunity: 0, plan: 1, dont_take_lolly: 2 }
    return (order[a.hope_frame ?? ''] ?? 0) - (order[b.hope_frame ?? ''] ?? 0)
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
    </div>
  )
}
