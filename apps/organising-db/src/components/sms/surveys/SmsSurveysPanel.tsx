'use client'

/**
 * Surveys tab of the SMS Outreach sub-tab (Phase 4, brief §4.1 +
 * §7.3): survey list with status + mini funnel, a create/edit sheet
 * around SmsSurveyEditor, an open sheet with audience selection
 * (whole campaign or a saved worker list — the sms-lists idiom), and
 * a funnel report for open/closed surveys (invited → started →
 * completed, per-question drop-off + invalid-reply rate with the
 * §4.1 ">10–15% invalid = rewrite the question" hint).
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  ClipboardList,
  Download,
  ListPlus,
  Loader2,
  Lock,
  Play,
  Plus,
  Scale,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { BALLOT_COMPLIANCE_BANNER } from '@/lib/sms/survey-validation'
import type {
  SmsBallotDetail,
  SmsBallotEventRow,
  VwSmsBallotTallyRow,
} from '@/types/sms'
import {
  useCreateSmsSurvey,
  useDeleteSmsSurvey,
  useSmsSurveyAction,
  useSmsSurveyDetail,
  useSmsSurveys,
  useUpdateSmsSurvey,
  type SmsSurveyDetail,
  type SmsSurveyListRow,
} from '@/lib/hooks/useSmsSurveys'
import {
  EMPTY_SURVEY,
  SmsSurveyEditor,
  fromQuestionRows,
  toQuestionInputs,
  type SurveyEditorValue,
} from '@/components/sms/surveys/SmsSurveyEditor'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  open: 'bg-green-100 text-green-700',
  closed: 'bg-slate-100 text-slate-500',
}

interface WorkerListOption {
  list_id: number
  name: string
  items_count: { count: number }[] | null
}

interface SmsSurveysPanelProps {
  campaignId: string | number
}

export function SmsSurveysPanel({ campaignId }: SmsSurveysPanelProps) {
  const id = String(campaignId)
  const searchParams = useSearchParams()
  const { data: surveys, isLoading } = useSmsSurveys(id)
  const [editorOpen, setEditorOpen] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [sourceWorkerListId, setSourceWorkerListId] = useState<number | null>(null)

  // Chain B (Phase 8): the SMS Build List Survey pathway lands here
  // with ?survey_source_list=<lid> (cohort attached) or ?new_survey=1
  // (header entry, no cohort) — open the create sheet on mount.
  useEffect(() => {
    const sourceList = searchParams.get('survey_source_list')
    const newSurvey = searchParams.get('new_survey')
    if (sourceList) {
      const n = Number(sourceList)
      if (Number.isFinite(n)) setSourceWorkerListId(n)
      setEditorOpen(true)
    } else if (newSurvey === '1') {
      setEditorOpen(true)
    }
    // Mount-only: re-running on every searchParams change would reopen
    // the sheet after the user closes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totals = useMemo(() => {
    const rows = surveys ?? []
    const sum = (fn: (r: SmsSurveyListRow) => number) =>
      rows.reduce((acc, r) => acc + fn(r), 0)
    return {
      surveys: rows.length,
      open: rows.filter((r) => r.status === 'open').length,
      invited: sum((r) => r.funnel?.ever_invited_count ?? 0),
      completed: sum((r) => r.funnel?.completed_count ?? 0),
    }
  }, [surveys])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button size="lg" onClick={() => setEditorOpen(true)}>
          <ClipboardList className="h-5 w-5 mr-2" />
          New survey
        </Button>
      </div>

      <div>
        <h3 className="font-semibold">SMS Surveys</h3>
        <p className="text-sm text-muted-foreground">
          Reply-native surveys with automatic parsing, retries and handoff.
          Answers land in the inbox thread; marked questions write member
          ratings.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Surveys" value={totals.surveys} />
        <StatCard label="Open" value={totals.open} />
        <StatCard label="Invited" value={totals.invited} />
        <StatCard label="Completed" value={totals.completed} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : surveys && surveys.length > 0 ? (
        <div className="space-y-2">
          {surveys.map((s) => (
            <SurveyCard
              key={s.survey_id}
              survey={s}
              onOpen={() => setDetailId(s.survey_id)}
            />
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-4 text-center">
            <ClipboardList className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              No surveys yet. Keep them short — completion drops sharply past 5
              questions.
            </p>
            <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New survey
            </Button>
          </CardContent>
        </Card>
      )}

      <SurveyEditorSheet
        campaignId={id}
        surveyId={null}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        sourceWorkerListId={sourceWorkerListId}
        onSaved={(surveyId) => {
          setEditorOpen(false)
          setDetailId(surveyId)
        }}
      />

      <SurveyDetailSheet
        campaignId={id}
        surveyId={detailId}
        onOpenChange={(open) => {
          if (!open) setDetailId(null)
        }}
      />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

function SurveyCard({
  survey,
  onOpen,
}: {
  survey: SmsSurveyListRow
  onOpen: () => void
}) {
  const funnel = survey.funnel
  const invited = funnel?.ever_invited_count ?? 0
  const completed = funnel?.completed_count ?? 0
  const pct = invited > 0 ? Math.round((completed / invited) * 100) : 0

  return (
    <Card className="hover:bg-muted/30 transition-colors">
      <CardContent className="p-3">
        <button type="button" className="w-full text-left" onClick={onOpen}>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium truncate">{survey.title}</p>
            <Badge className={STATUS_COLORS[survey.status] || ''} variant="secondary">
              {survey.status}
            </Badge>
            {survey.purpose === 'indicative_ballot' && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                <Scale className="h-3 w-3 mr-1" />
                indicative ballot
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {survey.question_count} question
              {survey.question_count === 1 ? '' : 's'}
            </span>
          </div>
          {survey.status !== 'draft' && funnel && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{funnel.total_sessions} recipients</span>
                <span>{invited} invited</span>
                <span>{funnel.started_count} started</span>
                <span>{completed} completed</span>
                {funnel.handed_off_count > 0 && (
                  <span className="text-amber-700">
                    {funnel.handed_off_count} handed off
                  </span>
                )}
                {funnel.opted_out_count > 0 && (
                  <span>{funnel.opted_out_count} opted out</span>
                )}
              </div>
              {invited > 0 && <Progress value={pct} className="h-1 mt-2" />}
            </>
          )}
        </button>
      </CardContent>
    </Card>
  )
}

function detailToEditorValue(detail: SmsSurveyDetail): SurveyEditorValue {
  const s = detail.survey
  return {
    title: s.title,
    purpose: s.purpose ?? 'survey',
    revote_policy: s.revote_policy ?? 'locked',
    results_restricted: !!s.results_restricted,
    activity_id: s.activity_id,
    sender_number_id: s.sender_number_id,
    invitation_body: s.invitation_body ?? '',
    completion_body: s.completion_body ?? '',
    retry_limit: s.retry_limit,
    question_timeout_minutes: s.question_timeout_minutes,
    session_ttl_hours: s.session_ttl_hours,
    reminder_offsets: Array.isArray(s.reminder_offsets) ? s.reminder_offsets : [],
    // A survey fired from the wall-chart fire path (or any other
    // question-less draft) must still open to a usable editor, not a
    // zero-card list.
    questions:
      detail.questions.length > 0
        ? fromQuestionRows(detail.questions)
        : [{ ...EMPTY_SURVEY.questions[0] }],
  }
}

function SurveyEditorSheet({
  campaignId,
  surveyId,
  initial,
  open,
  onOpenChange,
  onSaved,
  sourceWorkerListId,
}: {
  campaignId: string
  surveyId: number | null
  initial?: SurveyEditorValue
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (surveyId: number) => void
  /** Chain B: the cohort this draft is being created from (create mode only). */
  sourceWorkerListId?: number | null
}) {
  const [value, setValue] = useState<SurveyEditorValue>(
    initial ?? { ...EMPTY_SURVEY, questions: [{ ...EMPTY_SURVEY.questions[0] }] },
  )
  const queryClient = useQueryClient()
  const create = useCreateSmsSurvey(campaignId)
  const update = useUpdateSmsSurvey(campaignId)
  const pending = create.isPending || update.isPending

  const activitiesQueryKey = ['sms-survey-activities', campaignId] as const
  const { data: activities } = useQuery({
    queryKey: activitiesQueryKey,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('campaign_activities')
        .select('activity_id, title')
        .eq('campaign_id', Number(campaignId))
        .eq('activity_kind', 'assessment')
        .order('title')
      if (error) throw error
      return data ?? []
    },
    enabled: open,
  })

  const submit = () => {
    if (!value.title.trim()) {
      toast.error('Give the survey a title')
      return
    }
    const payload = {
      title: value.title,
      purpose: value.purpose,
      revote_policy: value.revote_policy,
      results_restricted: value.results_restricted,
      activity_id: value.activity_id,
      sender_number_id: value.sender_number_id,
      invitation_body: value.invitation_body,
      completion_body: value.completion_body || null,
      retry_limit: value.retry_limit,
      question_timeout_minutes: value.question_timeout_minutes,
      session_ttl_hours: value.session_ttl_hours,
      reminder_offsets: value.reminder_offsets,
      questions: toQuestionInputs(value.questions),
      ...(surveyId == null && sourceWorkerListId != null
        ? { source_worker_list_id: sourceWorkerListId }
        : {}),
    }
    const onError = (err: Error) => {
      toast.error(err.message)
    }
    if (surveyId != null) {
      update.mutate(
        { surveyId, ...payload },
        {
          onSuccess: () => {
            toast.success('Survey saved')
            onSaved(surveyId)
          },
          onError,
        },
      )
    } else {
      create.mutate(payload, {
        onSuccess: (res) => {
          toast.success('Survey created')
          onSaved(res.survey_id)
        },
        onError,
      })
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{surveyId != null ? 'Edit survey' : 'New survey'}</SheetTitle>
          <SheetDescription>
            Reply-native SMS survey — members answer by text, the engine
            parses, retries and hands off to the inbox when needed.
            {surveyId == null && sourceWorkerListId != null && (
              <span className="block mt-1 font-medium text-foreground">
                Fired from list #{sourceWorkerListId}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 pb-8">
          <SmsSurveyEditor
            value={value}
            onChange={setValue}
            activities={activities ?? []}
            disabled={pending}
            campaignId={campaignId}
            onActivityCreated={() => {
              queryClient.invalidateQueries({ queryKey: activitiesQueryKey })
            }}
          />
          <Button className="w-full" disabled={pending} onClick={submit}>
            {pending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            {surveyId != null ? 'Save survey' : 'Create survey'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function SurveyDetailSheet({
  campaignId,
  surveyId,
  onOpenChange,
}: {
  campaignId: string
  surveyId: number | null
  onOpenChange: (open: boolean) => void
}) {
  const { data: detail, isLoading } = useSmsSurveyDetail(campaignId, surveyId)
  const [editing, setEditing] = useState(false)

  return (
    <>
      <Sheet
        open={surveyId != null && !editing}
        onOpenChange={(open) => {
          if (!open) onOpenChange(false)
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {isLoading || !detail ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : detail.survey.status === 'draft' ? (
            <DraftDetail
              campaignId={campaignId}
              detail={detail}
              onEdit={() => setEditing(true)}
              onGone={() => onOpenChange(false)}
            />
          ) : (
            <FunnelDetail campaignId={campaignId} detail={detail} />
          )}
        </SheetContent>
      </Sheet>

      {detail && editing && (
        <SurveyEditorSheet
          campaignId={campaignId}
          surveyId={detail.survey.survey_id}
          initial={detailToEditorValue(detail)}
          open={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(false)
          }}
          onSaved={() => setEditing(false)}
        />
      )}
    </>
  )
}

function DraftDetail({
  campaignId,
  detail,
  onEdit,
  onGone,
}: {
  campaignId: string
  detail: SmsSurveyDetail
  onEdit: () => void
  onGone: () => void
}) {
  const action = useSmsSurveyAction(campaignId)
  const del = useDeleteSmsSurvey(campaignId)
  const [audience, setAudience] = useState<string>('campaign')
  const [userChangedAudience, setUserChangedAudience] = useState(false)

  const { data: workerLists } = useQuery({
    queryKey: ['worker-lists-for-sms', campaignId],
    queryFn: async () => {
      // Unfiltered by status (Phase 8) — a fired list is still a valid
      // default audience source here.
      const res = await fetchApi(`/api/campaigns/${campaignId}/worker-lists`)
      if (!res.ok) throw new Error('Failed to fetch worker lists')
      return res.json() as Promise<WorkerListOption[]>
    },
  })

  // Default the audience to the survey's source list, when it was
  // fired from one and still appears in the options (Phase 8) —
  // derived at render time so a workerLists refetch never needs an
  // effect + setState round trip; a manual pick always wins.
  const sourceListId = detail.survey.source_worker_list_id
  const sourceListStillOffered =
    sourceListId != null && (workerLists ?? []).some((wl) => wl.list_id === sourceListId)
  const effectiveAudience =
    !userChangedAudience && sourceListStillOffered ? String(sourceListId) : audience
  const handleAudienceChange = (v: string) => {
    setAudience(v)
    setUserChangedAudience(true)
  }

  const openSurvey = () => {
    action.mutate(
      {
        surveyId: detail.survey.survey_id,
        action: 'open',
        audience:
          effectiveAudience === 'campaign'
            ? { type: 'campaign' }
            : { type: 'worker_list', worker_list_id: Number(effectiveAudience) },
      },
      {
        onSuccess: (res) => {
          const notes: string[] = []
          if (res.opted_out) notes.push(`${res.opted_out} opted out`)
          if (res.skipped_no_phone) notes.push(`${res.skipped_no_phone} without a mobile`)
          toast.success(
            `Survey opened — ${res.sessions_created} invitations queued${
              notes.length ? ` (${notes.join(', ')} excluded)` : ''
            }. Sending starts within 10 minutes, inside the send window.`,
          )
        },
        onError: (err: Error) => toast.error(err.message),
      },
    )
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {detail.survey.title}
          <Badge variant="secondary" className={STATUS_COLORS.draft}>
            draft
          </Badge>
        </SheetTitle>
        <SheetDescription>
          {detail.questions.length} question
          {detail.questions.length === 1 ? '' : 's'} — pick the audience and
          open when ready. Opted-out workers and workers without a mobile are
          excluded automatically.
        </SheetDescription>
      </SheetHeader>
      <div className="mt-4 space-y-4 pb-8">
        {detail.survey.purpose === 'indicative_ballot' && (
          <BallotBanner note="Opening freezes the eligibility roll to the chosen audience — turnout reports against it, one vote per member." />
        )}
        <QuestionListPreview detail={detail} />

        <div className="space-y-1.5">
          <Label>Audience</Label>
          <Select value={effectiveAudience} onValueChange={handleAudienceChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="campaign">Whole campaign (all members)</SelectItem>
              {(workerLists ?? []).map((wl) => (
                <SelectItem key={wl.list_id} value={String(wl.list_id)}>
                  List: {wl.name} ({wl.items_count?.[0]?.count ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={action.isPending || del.isPending}
            onClick={onEdit}
          >
            Edit
          </Button>
          <Button
            className="flex-1"
            disabled={action.isPending || del.isPending}
            onClick={openSurvey}
          >
            {action.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Open survey
          </Button>
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            disabled={action.isPending || del.isPending}
            onClick={() =>
              del.mutate(detail.survey.survey_id, {
                onSuccess: () => {
                  toast.success('Survey deleted')
                  onGone()
                },
                onError: (err: Error) => toast.error(err.message),
              })
            }
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  )
}

function QuestionListPreview({ detail }: { detail: SmsSurveyDetail }) {
  return (
    <div className="rounded-md border divide-y">
      {detail.questions.map((q, i) => (
        <div key={q.question_id} className="px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Q{i + 1}</Badge>
            <span className="text-xs text-muted-foreground">{q.qtype}</span>
            {q.write_rating && (
              <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
                writes rating
              </Badge>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap">{q.prompt}</p>
        </div>
      ))}
    </div>
  )
}

function FunnelDetail({
  campaignId,
  detail,
}: {
  campaignId: string
  detail: SmsSurveyDetail
}) {
  const action = useSmsSurveyAction(campaignId)
  const funnel = detail.funnel
  const invited = funnel?.ever_invited_count ?? 0
  const isBallot = detail.survey.purpose === 'indicative_ballot'
  // Restricted ballots: the aggregate tally is the ONLY reporting
  // surface — the per-question stats (with unparsed-capture drill-in
  // counts) are hidden along with any per-member answer surface.
  const restricted = isBallot && detail.survey.results_restricted

  const statsByQuestion = new Map(
    detail.question_stats.map((s) => [s.question_id, s]),
  )

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {detail.survey.title}
          <Badge
            variant="secondary"
            className={STATUS_COLORS[detail.survey.status] || ''}
          >
            {detail.survey.status}
          </Badge>
          {isBallot && (
            <Badge variant="secondary" className="bg-blue-100 text-blue-700">
              <Scale className="h-3 w-3 mr-1" />
              indicative ballot
            </Badge>
          )}
        </SheetTitle>
        <SheetDescription>
          {funnel?.total_sessions ?? 0} recipients — invitations go out inside
          the send window; stalled sessions get one nudge and up to two
          reminders before expiring.
        </SheetDescription>
      </SheetHeader>
      <div className="mt-4 space-y-4 pb-8">
        {isBallot && (
          <BallotBanner
            note={
              detail.survey.revote_policy === 'revote_until_close'
                ? 'Re-votes allowed until close — the last vote counts and supersessions are logged.'
                : 'One vote per member — re-vote attempts are rejected and logged.'
            }
          />
        )}
        {funnel && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            <StatCard label="Invited" value={invited} />
            <StatCard label="Started" value={funnel.started_count} />
            <StatCard label="Completed" value={funnel.completed_count} />
            <StatCard label="Handed off" value={funnel.handed_off_count} />
            <StatCard label="Queued" value={funnel.queued_count} />
            <StatCard label="Expired" value={funnel.expired_count} />
            <StatCard label="Opted out" value={funnel.opted_out_count} />
            <StatCard label="Undeliverable" value={funnel.undeliverable_count} />
          </div>
        )}

        {isBallot && detail.ballot && (
          <BallotResults detail={detail} ballot={detail.ballot} />
        )}

        {/* Phase 7: answers export (blocked server-side for restricted
            ballots — hidden here too) + "create list from responders"
            cohorts (§3.1 item 11). Cohort lists carry membership only,
            never answers, so they stay available for restricted
            ballots. */}
        <div className="space-y-2">
          {!restricted && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Button asChild variant="outline" size="sm">
                <a
                  href={`/api/campaigns/${campaignId}/sms-surveys/${detail.survey.survey_id}/export`}
                  download
                >
                  <Download className="h-3 w-3 mr-1" />
                  Export answers CSV
                </a>
              </Button>
            </div>
          )}
          <SurveyCohortButtons
            campaignId={campaignId}
            surveyId={detail.survey.survey_id}
          />
        </div>

        {/* Per-question drop-off + invalid-reply rate (§4.1) — hidden
            for restricted ballots (the tally is the whole surface). */}
        {!restricted && (
        <div className="rounded-md border divide-y">
          {detail.questions.map((q, i) => {
            const stats = statsByQuestion.get(q.question_id)
            const answered = stats?.answered_count ?? 0
            const invalid = stats?.invalid_attempts ?? 0
            const replies = answered + invalid
            const invalidPct = replies > 0 ? Math.round((invalid / replies) * 100) : 0
            const dropPct =
              invited > 0 ? Math.round((answered / invited) * 100) : 0
            return (
              <div key={q.question_id} className="px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Q{i + 1}</Badge>
                  <p className="truncate flex-1">{q.prompt}</p>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {answered} answered ({dropPct}% of invited)
                  </span>
                  {(stats?.unparsed_count ?? 0) > 0 && (
                    <span>{stats?.unparsed_count} unparsed</span>
                  )}
                  <span className={invalidPct > 10 ? 'text-amber-700 font-medium' : ''}>
                    {invalidPct}% invalid replies
                    {invalidPct > 10 ? ' — consider rewording' : ''}
                  </span>
                </div>
                <Progress value={dropPct} className="h-1 mt-1.5" />
              </div>
            )
          })}
        </div>
        )}

        {detail.survey.status === 'open' && (
          <Button
            variant="outline"
            className="w-full"
            disabled={action.isPending}
            onClick={() =>
              action.mutate(
                { surveyId: detail.survey.survey_id, action: 'close' },
                {
                  onSuccess: (res) =>
                    toast.success(
                      `${isBallot ? 'Ballot' : 'Survey'} closed${
                        res.expired_sessions
                          ? ` — ${res.expired_sessions} unfinished sessions expired`
                          : ''
                      }`,
                    ),
                  onError: (err: Error) => toast.error(err.message),
                },
              )
            }
          >
            {action.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Lock className="h-4 w-4 mr-2" />
            )}
            {isBallot ? 'Close ballot' : 'Close survey'}
          </Button>
        )}
      </div>
    </>
  )
}

const SURVEY_COHORT_OPTIONS = [
  { value: 'completed', label: 'Completed' },
  { value: 'started_not_completed', label: 'Started, not completed' },
  { value: 'non_responders', label: 'Non-responders' },
] as const

/**
 * "Create list from responders" (Phase 7, §3.1 item 11) — one click
 * turns a funnel segment into a draft campaign_worker_list usable by
 * every channel. non_responders excludes opted-out sessions.
 */
function SurveyCohortButtons({
  campaignId,
  surveyId,
}: {
  campaignId: string
  surveyId: number
}) {
  const queryClient = useQueryClient()
  const create = useMutation({
    mutationFn: async (cohort: string) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-surveys/${surveyId}/worker-list`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cohort }),
        },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create worker list')
      return data as { list_id: number; name: string; items: number }
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['worker-lists-for-sms', campaignId] })
      toast.success(
        `Worker list "${res.name}" created with ${res.items} worker${res.items === 1 ? '' : 's'} — fire it into any channel from the wall chart or a new blast.`,
      )
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Create list from:</span>
      {SURVEY_COHORT_OPTIONS.map((o) => (
        <Button
          key={o.value}
          variant="outline"
          size="sm"
          disabled={create.isPending}
          onClick={() => create.mutate(o.value)}
        >
          <ListPlus className="h-3 w-3 mr-1" />
          {o.label}
        </Button>
      ))}
    </div>
  )
}

/**
 * The §4.2/§8.1 compliance boundary — always visible on ballot
 * surfaces, never editable.
 */
function BallotBanner({ note }: { note?: string }) {
  return (
    <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
      <Scale className="h-4 w-4 shrink-0 mt-0.5" />
      <p>
        <span className="font-semibold">{BALLOT_COMPLIANCE_BANNER}</span>
        {note ? ` ${note}` : ''}
      </p>
    </div>
  )
}

const BALLOT_EVENT_LABELS: Record<SmsBallotEventRow['event_type'], string> = {
  roll_frozen: 'Roll frozen',
  invitation_sent: 'Invitation sent',
  vote_received: 'Vote received',
  vote_superseded: 'Vote superseded (re-vote)',
  vote_rejected_locked: 'Re-vote rejected (locked)',
  receipt_sent: 'Receipt sent',
  ballot_opened: 'Ballot opened',
  ballot_closed: 'Ballot closed',
  tally_generated: 'Tally generated',
}

/**
 * Ballot results & audit (§4.2): turnout vs the frozen roll, the
 * aggregate tally (no per-member choices — the reporting surface for
 * restricted ballots), the recomputed receipt list (codes only,
 * lexicographic — members self-verify against it) and the append-only
 * event log timeline.
 */
function BallotResults({
  detail,
  ballot,
}: {
  detail: SmsSurveyDetail
  ballot: SmsBallotDetail
}) {
  const [showReceipts, setShowReceipts] = useState(false)
  const [showEvents, setShowEvents] = useState(false)

  const tallyByQuestion = new Map<number, VwSmsBallotTallyRow[]>()
  for (const row of ballot.tally) {
    const list = tallyByQuestion.get(row.question_id) ?? []
    list.push(row)
    tallyByQuestion.set(row.question_id, list)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="On roll" value={ballot.turnout.roll_count} />
        <StatCard label="Votes cast" value={ballot.turnout.votes_cast} />
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Turnout</p>
            <p className="text-lg font-semibold">{ballot.turnout.turnout_pct}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Aggregate tally — completed votes only, no member ids. */}
      <div className="rounded-md border divide-y">
        {detail.questions.map((q, i) => {
          const rows = tallyByQuestion.get(q.question_id) ?? []
          const total = rows.reduce((acc, r) => acc + r.vote_count, 0)
          return (
            <div key={q.question_id} className="px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Q{i + 1}</Badge>
                <p className="truncate flex-1">{q.prompt}</p>
                <span className="text-xs text-muted-foreground">
                  {total} vote{total === 1 ? '' : 's'}
                </span>
              </div>
              {rows.length > 0 ? (
                <div className="mt-1.5 space-y-1">
                  {rows.map((r) => {
                    const pct =
                      total > 0 ? Math.round((r.vote_count / total) * 100) : 0
                    return (
                      <div
                        key={r.parsed_value}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="w-24 truncate" title={r.parsed_value}>
                          {r.parsed_value}
                        </span>
                        <Progress value={pct} className="h-1.5 flex-1" />
                        <span className="w-16 text-right text-muted-foreground">
                          {r.vote_count} ({pct}%)
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  No completed votes yet.
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Receipt audit list — recomputed codes only, never member-
          linked; a voter checks their own code appears. */}
      <div className="rounded-md border">
        <button
          type="button"
          className="w-full px-3 py-2 text-left text-sm font-medium"
          onClick={() => setShowReceipts((v) => !v)}
        >
          Receipts ({ballot.receipts.length}) {showReceipts ? '▾' : '▸'}
        </button>
        {showReceipts && (
          <div className="border-t px-3 py-2">
            {ballot.receipts.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs sm:grid-cols-3">
                {ballot.receipts.map((code, i) => (
                  <span key={`${code}-${i}`}>{code}</span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No receipts yet.</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Codes are recomputed from the votes, sorted alphabetically and
              never linked to members — a voter verifies their own receipt
              appears here.
            </p>
          </div>
        )}
      </div>

      {/* Append-only event log timeline. */}
      <div className="rounded-md border">
        <button
          type="button"
          className="w-full px-3 py-2 text-left text-sm font-medium"
          onClick={() => setShowEvents((v) => !v)}
        >
          Event log ({ballot.events.length}
          {ballot.events.length === 200 ? '+' : ''}) {showEvents ? '▾' : '▸'}
        </button>
        {showEvents && (
          <div className="max-h-64 divide-y overflow-y-auto border-t">
            {ballot.events.map((e) => (
              <div
                key={e.event_id}
                className="flex items-center gap-2 px-3 py-1.5 text-xs"
              >
                <span className="font-medium">
                  {BALLOT_EVENT_LABELS[e.event_type] ?? e.event_type}
                </span>
                <span className="ml-auto text-muted-foreground">
                  {new Date(e.occurred_at).toLocaleString()}
                </span>
              </div>
            ))}
            {ballot.events.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No events yet.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
