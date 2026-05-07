'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Save, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/supabase/auth-context'
import {
  useSocRecordingGrid,
  useUpsertSocRecording,
  type SocRecordingGridRow,
} from '@/lib/hooks/useSectionTheoryAndSoc'

interface RowDraft {
  no_vote: string
  pabo: string
  member: string
  notes: string
}

function rowToDraft(r: SocRecordingGridRow): RowDraft {
  return {
    no_vote: r.no_vote_rating != null ? String(r.no_vote_rating) : '',
    pabo: r.pabo_rating != null ? String(r.pabo_rating) : '',
    member: r.member_status_confirmed ?? '',
    notes: r.notes ?? '',
  }
}

function draftMatchesRow(d: RowDraft, r: SocRecordingGridRow) {
  return (
    d.no_vote === (r.no_vote_rating != null ? String(r.no_vote_rating) : '') &&
    d.pabo === (r.pabo_rating != null ? String(r.pabo_rating) : '') &&
    d.member === (r.member_status_confirmed ?? '') &&
    d.notes === (r.notes ?? '')
  )
}

export function RepWalkthroughRecordingGrid({
  socId,
  paboInScope,
}: {
  socId: number
  paboInScope: boolean
}) {
  const { canWrite } = useAuth()
  const { data: rows = [], isLoading } = useSocRecordingGrid(socId)
  const upsert = useUpsertSocRecording()
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({})
  const [search, setSearch] = useState('')
  const debounceRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  // Initialise / refresh drafts when rows load.
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<number, RowDraft> = {}
      for (const r of rows) {
        next[r.worker_id] = prev[r.worker_id] ?? rowToDraft(r)
      }
      return next
    })
  }, [rows])

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.trim().toLowerCase()
    return rows.filter((r) => r.worker_name.toLowerCase().includes(q))
  }, [rows, search])

  const dirtyCount = useMemo(() => {
    let n = 0
    for (const r of rows) {
      const d = drafts[r.worker_id]
      if (d && !draftMatchesRow(d, r)) n++
    }
    return n
  }, [rows, drafts])

  const persistRow = (workerId: number) => {
    const r = rows.find((x) => x.worker_id === workerId)
    if (!r) return
    const d = drafts[workerId]
    if (!d) return
    if (draftMatchesRow(d, r)) return
    upsert.mutate({
      soc_id: socId,
      worker_id: workerId,
      activity_event_id: r.activity_event_id ?? null,
      no_vote_rating: d.no_vote ? Number(d.no_vote) : null,
      pabo_rating: d.pabo ? Number(d.pabo) : null,
      member_status_confirmed: d.member || null,
      notes: d.notes || null,
    })
  }

  const updateDraft = (workerId: number, partial: Partial<RowDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [workerId]: { ...(prev[workerId] ?? { no_vote: '', pabo: '', member: '', notes: '' }), ...partial },
    }))
    // Debounced save per row
    if (debounceRef.current[workerId]) clearTimeout(debounceRef.current[workerId])
    debounceRef.current[workerId] = setTimeout(() => persistRow(workerId), 800)
  }

  const saveAll = () => {
    for (const r of rows) {
      const d = drafts[r.worker_id]
      if (d && !draftMatchesRow(d, r)) persistRow(r.worker_id)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative w-full md:w-64">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter worker"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          {dirtyCount > 0 && <Badge variant="warning">{dirtyCount} pending save</Badge>}
          {canWrite && (
            <Button size="sm" variant="outline" onClick={saveAll} disabled={dirtyCount === 0}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Save all
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No workers in scope yet. Allocate workers to this campaign for them
          to appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead className="w-20 text-right">Current</TableHead>
                <TableHead className="w-20 text-right">No vote</TableHead>
                {paboInScope && <TableHead className="w-20 text-right">PABO</TableHead>}
                <TableHead className="w-32">Member status</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const d = drafts[r.worker_id] ?? rowToDraft(r)
                const dirty = !draftMatchesRow(d, r)
                return (
                  <TableRow key={r.worker_id}>
                    <TableCell>
                      <div className="font-medium">{r.worker_name}</div>
                      {dirty && <Badge variant="warning" className="text-[10px]">unsaved</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.current_rating ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        max={5}
                        value={d.no_vote}
                        onChange={(e) => updateDraft(r.worker_id, { no_vote: e.target.value })}
                        onBlur={() => persistRow(r.worker_id)}
                        disabled={!canWrite}
                        className="h-8 text-right"
                      />
                    </TableCell>
                    {paboInScope && (
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          max={5}
                          value={d.pabo}
                          onChange={(e) => updateDraft(r.worker_id, { pabo: e.target.value })}
                          onBlur={() => persistRow(r.worker_id)}
                          disabled={!canWrite}
                          className="h-8 text-right"
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Input
                        value={d.member}
                        onChange={(e) => updateDraft(r.worker_id, { member: e.target.value })}
                        onBlur={() => persistRow(r.worker_id)}
                        disabled={!canWrite}
                        placeholder="member / non / pending"
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={d.notes}
                        onChange={(e) => updateDraft(r.worker_id, { notes: e.target.value })}
                        onBlur={() => persistRow(r.worker_id)}
                        disabled={!canWrite}
                        placeholder="Concerns, objections, context"
                        className="h-8"
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {upsert.isError && (
        <p className="text-xs text-destructive">
          Save failed: {(upsert.error as Error)?.message}
        </p>
      )}
    </div>
  )
}
