'use client'

import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Sparkles, Database, Save } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/supabase/auth-context'
import {
  useResolvedAgreementExpiry,
  useSectionSituationSnippet,
  useSeedSectionSituationSnippet,
  useUpsertSectionSituationSnippet,
} from '@/lib/hooks/useSectionSituationSnippet'

interface SectionSituationSnippetCardProps {
  sectionPlanId: number
}

export function SectionSituationSnippetCard({
  sectionPlanId,
}: SectionSituationSnippetCardProps) {
  const { canWrite } = useAuth()
  const { data: snippet, isLoading } = useSectionSituationSnippet(sectionPlanId)
  const { data: expiry } = useResolvedAgreementExpiry(sectionPlanId)
  const seed = useSeedSectionSituationSnippet()
  const upsert = useUpsertSectionSituationSnippet()

  const [form, setForm] = useState({
    status_summary: '',
    key_event: '',
    strategic_context: '',
    workforce_summary: '',
    notes: '',
    agreement_expiry_override: '',
  })

  useEffect(() => {
    if (snippet) {
      setForm({
        status_summary: snippet.status_summary ?? '',
        key_event: snippet.key_event ?? '',
        strategic_context: snippet.strategic_context ?? '',
        workforce_summary: snippet.workforce_summary ?? '',
        notes: snippet.notes ?? '',
        agreement_expiry_override: snippet.agreement_expiry_override ?? '',
      })
    }
  }, [snippet])

  const handleSeed = () => {
    seed.mutate({ section_plan_id: sectionPlanId })
  }

  const handleSave = () => {
    upsert.mutate({
      section_plan_id: sectionPlanId,
      status_summary: form.status_summary || null,
      key_event: form.key_event || null,
      strategic_context: form.strategic_context || null,
      workforce_summary: form.workforce_summary || null,
      notes: form.notes || null,
      agreement_expiry_override: form.agreement_expiry_override || null,
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              Current Situation
              {snippet?.derived_from_campaign_situation && (
                <Badge variant="info" title="Last seeded from campaign situation analysis">
                  Synced from campaign
                </Badge>
              )}
              {snippet?.ai_generated && (
                <Badge variant="warning"><Sparkles className="h-3 w-3 mr-1" />AI</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Maps to the Field Plan Template's Status / Key event / Agreement
              expiry / Strategic context block.
            </CardDescription>
          </div>
          {canWrite && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSeed}
                disabled={seed.isPending}
                title="Pull latest situation analysis + agreement expiry + readiness counts"
              >
                <Database className="h-3.5 w-3.5 mr-1.5" />
                {seed.isPending ? 'Pulling…' : 'Pull from campaign'}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={upsert.isPending || isLoading}>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {upsert.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="ss-status">Status</Label>
            <Textarea
              id="ss-status"
              rows={3}
              placeholder="Where bargaining / the campaign stands right now"
              value={form.status_summary}
              onChange={(e) => setForm({ ...form, status_summary: e.target.value })}
              disabled={!canWrite}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ss-event">Key event / trigger</Label>
            <Textarea
              id="ss-event"
              rows={3}
              placeholder="NERR issued · ballot imminent · first meeting scheduled"
              value={form.key_event}
              onChange={(e) => setForm({ ...form, key_event: e.target.value })}
              disabled={!canWrite}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="ss-expiry">Agreement expiry</Label>
            <Input
              id="ss-expiry"
              type="date"
              value={form.agreement_expiry_override}
              onChange={(e) =>
                setForm({ ...form, agreement_expiry_override: e.target.value })
              }
              disabled={!canWrite}
            />
            {expiry && !form.agreement_expiry_override && (
              <p className="text-xs text-muted-foreground">
                Default from campaign agreements:{' '}
                <span className="font-medium">
                  {format(parseISO(expiry), 'dd MMM yyyy')}
                </span>
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="ss-context">Strategic context</Label>
            <Textarea
              id="ss-context"
              rows={2}
              placeholder="Benchmark setting · sector dynamics · political context (optional)"
              value={form.strategic_context}
              onChange={(e) => setForm({ ...form, strategic_context: e.target.value })}
              disabled={!canWrite}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="ss-wf">Workforce summary</Label>
          <Textarea
            id="ss-wf"
            rows={2}
            placeholder="One-line workforce description (auto-pulled from foundational readiness)"
            value={form.workforce_summary}
            onChange={(e) => setForm({ ...form, workforce_summary: e.target.value })}
            disabled={!canWrite}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="ss-notes">Mapping notes</Label>
          <Textarea
            id="ss-notes"
            rows={2}
            placeholder="Notes on mapping gaps, priority sites, density concerns"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            disabled={!canWrite}
          />
        </div>

        {upsert.isError && (
          <p className="text-xs text-destructive">
            {(upsert.error as Error)?.message ?? 'Could not save'}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
