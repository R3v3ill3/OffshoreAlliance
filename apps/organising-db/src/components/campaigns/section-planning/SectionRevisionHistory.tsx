'use client'

import { format, parseISO } from 'date-fns'
import { History } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useSectionRevisions } from '@/lib/hooks/useSectionWorkplan'

export function SectionRevisionHistory({
  sectionPlanId,
}: {
  sectionPlanId: number
}) {
  const { data: revisions = [], isLoading } = useSectionRevisions(sectionPlanId)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" />
          Revision history
        </CardTitle>
        <CardDescription>
          Append-only audit of subject edits in this section plan. Latest 50.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && revisions.length === 0 && (
          <p className="text-sm text-muted-foreground">No revisions recorded.</p>
        )}
        {revisions.length > 0 && (
          <ul className="space-y-2">
            {revisions.map((r) => (
              <li
                key={r.revision_id}
                className="rounded-md border p-2.5 space-y-1 text-sm"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">{r.subject_kind}</Badge>
                  {r.subject_id != null && (
                    <span className="text-xs text-muted-foreground">
                      #{r.subject_id}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {format(parseISO(r.revised_at), 'dd MMM yyyy HH:mm')}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{r.change_summary}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
