'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Plus, Archive, Pencil, ExternalLink } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useAuth } from '@/lib/supabase/auth-context'
import {
  useArchiveSectionPlan,
  useSectionPlans,
} from '@/lib/hooks/useSectionPlans'
import {
  SECTION_PLAN_STATUS_LABELS,
  type SectionPlanRow,
  type SectionPlanTimeframeKind,
} from '@/types/section-planning'
import { CreateSectionPlanDialog } from './CreateSectionPlanDialog'

interface SectionPlansTabProps {
  campaignId: number
}

const TIMEFRAME_BADGE: Record<
  SectionPlanTimeframeKind,
  { variant: 'secondary' | 'warning' | 'destructive'; tone: string }
> = {
  user_set: { variant: 'secondary', tone: 'Flexible timing' },
  user_set_firm: { variant: 'warning', tone: 'External date, internal measure' },
  hard_external_deadline: { variant: 'destructive', tone: 'Hard external deadline' },
}

function formatDateSafe(d: string | null) {
  if (!d) return '—'
  try {
    return format(parseISO(d), 'dd MMM yyyy')
  } catch {
    return d
  }
}

function SectionPlanRowCard({
  plan,
  campaignId,
  canWrite,
}: {
  plan: SectionPlanRow
  campaignId: number
  canWrite: boolean
}) {
  const archive = useArchiveSectionPlan()
  const tf = TIMEFRAME_BADGE[plan.timeframe_kind]

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2 flex-wrap">
              {plan.name}
              <Badge variant={tf.variant}>{tf.tone}</Badge>
              <Badge variant="secondary">{SECTION_PLAN_STATUS_LABELS[plan.status]}</Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              {formatDateSafe(plan.start_date)} → {formatDateSafe(plan.end_date)}
              {plan.external_anchor_label ? (
                <span className="ml-2 text-muted-foreground">
                  · anchor: {plan.external_anchor_label}
                </span>
              ) : null}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <a href={`/campaigns/${campaignId}/section-plans/${plan.section_plan_id}`}>
                Open
                <ExternalLink className="h-3.5 w-3.5 ml-1" />
              </a>
            </Button>
            {canWrite && plan.status !== 'archived' && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Archive section plan"
                    aria-label="Archive section plan"
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Archive this section plan?</AlertDialogTitle>
                    <AlertDialogDescription>
                      “{plan.name}” will be hidden from the active list. Its data
                      is retained — toggle “Show archived” to bring it back into
                      view. You can reactivate it later by editing the plan.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        archive.mutate({ section_plan_id: plan.section_plan_id })
                      }
                    >
                      Archive
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardHeader>
      {plan.purpose && (
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {plan.purpose}
          </p>
        </CardContent>
      )}
    </Card>
  )
}

export function SectionPlansTab({ campaignId }: SectionPlansTabProps) {
  const { canWrite } = useAuth()
  const [createOpen, setCreateOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const { data: plans, isLoading, error } = useSectionPlans(campaignId, {
    includeArchived: showArchived,
  })

  const sortedPlans = useMemo(() => {
    if (!plans) return []
    // status priority: active > draft > completed > archived
    const order: Record<string, number> = {
      active: 0,
      draft: 1,
      completed: 2,
      archived: 3,
    }
    return [...plans].sort((a, b) => {
      const so = (order[a.status] ?? 99) - (order[b.status] ?? 99)
      if (so !== 0) return so
      // newest start_date first inside each status bucket
      return a.start_date < b.start_date ? 1 : -1
    })
  }, [plans])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Section plans</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Lightweight, period-scoped plans. Use these for a discrete piece of
            work (e.g. pre-ballot surge, week-of activity) without forcing it
            through the full campaign-stage flow.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
            <Label htmlFor="show-archived" className="text-sm">
              Show archived
            </Label>
          </div>
          {canWrite && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New section plan
            </Button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {error && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Could not load section plans: {(error as Error)?.message ?? 'unknown error'}
          </CardContent>
        </Card>
      )}

      {!isLoading && !error && sortedPlans.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Pencil className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              No section plans yet. Create one to scope a tight piece of work
              — a pre-ballot surge, a single week of contact, an activist
              tasking sprint.
            </p>
            {canWrite && (
              <Button variant="outline" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Create the first one
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {!isLoading && sortedPlans.length > 0 && (
        <div className="space-y-3">
          {sortedPlans.map((plan) => (
            <SectionPlanRowCard
              key={plan.section_plan_id}
              plan={plan}
              campaignId={campaignId}
              canWrite={!!canWrite}
            />
          ))}
        </div>
      )}

      <CreateSectionPlanDialog
        campaignId={campaignId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  )
}
