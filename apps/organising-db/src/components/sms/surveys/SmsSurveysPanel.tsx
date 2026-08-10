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
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  Loader2,
  Lock,
  Play,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
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
  const { data: surveys, isLoading } = useSmsSurveys(id)
  const [editorOpen, setEditorOpen] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)

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
    activity_id: s.activity_id,
    sender_number_id: s.sender_number_id,
    invitation_body: s.invitation_body ?? '',
    completion_body: s.completion_body ?? '',
    retry_limit: s.retry_limit,
    question_timeout_minutes: s.question_timeout_minutes,
    session_ttl_hours: s.session_ttl_hours,
    reminder_offsets: Array.isArray(s.reminder_offsets) ? s.reminder_offsets : [],
    questions: fromQuestionRows(detail.questions),
  }
}

function SurveyEditorSheet({
  campaignId,
  surveyId,
  initial,
  open,
  onOpenChange,
  onSaved,
}: {
  campaignId: string
  surveyId: number | null
  initial?: SurveyEditorValue
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (surveyId: number) => void
}) {
  const [value, setValue] = useState<SurveyEditorValue>(
    initial ?? { ...EMPTY_SURVEY, questions: [{ ...EMPTY_SURVEY.questions[0] }] },
  )
  const create = useCreateSmsSurvey(campaignId)
  const update = useUpdateSmsSurvey(campaignId)
  const pending = create.isPending || update.isPending

  const { data: activities } = useQuery({
    queryKey: ['sms-survey-activities', campaignId],
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
      activity_id: value.activity_id,
      sender_number_id: value.sender_number_id,
      invitation_body: value.invitation_body,
      completion_body: value.completion_body || null,
      retry_limit: value.retry_limit,
      question_timeout_minutes: value.question_timeout_minutes,
      session_ttl_hours: value.session_ttl_hours,
      reminder_offsets: value.reminder_offsets,
      questions: toQuestionInputs(value.questions),
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
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 pb-8">
          <SmsSurveyEditor
            value={value}
            onChange={setValue}
            activities={activities ?? []}
            disabled={pending}
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

  const { data: workerLists } = useQuery({
    queryKey: ['worker-lists-for-sms', campaignId],
    queryFn: async () => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/worker-lists`)
      if (!res.ok) throw new Error('Failed to fetch worker lists')
      return res.json() as Promise<WorkerListOption[]>
    },
  })

  const openSurvey = () => {
    action.mutate(
      {
        surveyId: detail.survey.survey_id,
        action: 'open',
        audience:
          audience === 'campaign'
            ? { type: 'campaign' }
            : { type: 'worker_list', worker_list_id: Number(audience) },
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
        <QuestionListPreview detail={detail} />

        <div className="space-y-1.5">
          <Label>Audience</Label>
          <Select value={audience} onValueChange={setAudience}>
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
        </SheetTitle>
        <SheetDescription>
          {funnel?.total_sessions ?? 0} recipients — invitations go out inside
          the send window; stalled sessions get one nudge and up to two
          reminders before expiring.
        </SheetDescription>
      </SheetHeader>
      <div className="mt-4 space-y-4 pb-8">
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

        {/* Per-question drop-off + invalid-reply rate (§4.1). */}
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
                      `Survey closed${
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
            Close survey
          </Button>
        )}
      </div>
    </>
  )
}
