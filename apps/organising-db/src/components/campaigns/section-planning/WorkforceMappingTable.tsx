'use client'

import { useState } from 'react'
import { RefreshCw, Pencil, X } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/lib/supabase/auth-context'
import {
  useDeleteWorkforceOverride,
  useSectionWorkforceMapping,
  useUpsertWorkforceOverride,
  type WorkforceMappingRow,
} from '@/lib/hooks/useSectionWorkforceMapping'

interface WorkforceMappingTableProps {
  sectionPlanId: number
  campaignId: number
}

interface EditState {
  open: boolean
  row?: WorkforceMappingRow
  workers: string
  members: string
  density: string
  note: string
}

const EMPTY_EDIT: EditState = {
  open: false,
  workers: '',
  members: '',
  density: '',
  note: '',
}

export function WorkforceMappingTable({
  sectionPlanId,
  campaignId,
}: WorkforceMappingTableProps) {
  const { canWrite } = useAuth()
  const { rows, isLoading, isFetching, error, refetch } = useSectionWorkforceMapping(
    sectionPlanId,
    campaignId,
  )
  const upsert = useUpsertWorkforceOverride()
  const remove = useDeleteWorkforceOverride()
  const [edit, setEdit] = useState<EditState>(EMPTY_EDIT)

  const totalWorkers = rows.reduce((s, r) => s + r.workers_effective, 0)
  const totalMembers = rows.reduce((s, r) => s + r.members_effective, 0)
  const totalDensity =
    totalWorkers > 0 ? Math.round((1000 * totalMembers) / totalWorkers) / 10 : null

  const openEdit = (row: WorkforceMappingRow) => {
    setEdit({
      open: true,
      row,
      workers:
        row.workers_effective !== row.workers_count
          ? String(row.workers_effective)
          : '',
      members:
        row.members_effective !== row.members_count
          ? String(row.members_effective)
          : '',
      density:
        row.density_effective !== row.density_pct && row.density_effective != null
          ? String(row.density_effective)
          : '',
      note: row.override_note ?? '',
    })
  }

  const closeEdit = () => setEdit(EMPTY_EDIT)

  const saveOverride = async () => {
    if (!edit.row) return
    await upsert.mutateAsync({
      section_plan_id: sectionPlanId,
      worksite_ou_id: edit.row.worksite_ou_id,
      workers_override: edit.workers ? Number(edit.workers) : null,
      members_override: edit.members ? Number(edit.members) : null,
      density_override: edit.density ? Number(edit.density) : null,
      note: edit.note.trim() || null,
    })
    closeEdit()
  }

  const clearOverride = async () => {
    if (!edit.row) return
    await remove.mutateAsync({
      section_plan_id: sectionPlanId,
      worksite_ou_id: edit.row.worksite_ou_id,
    })
    closeEdit()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <CardTitle className="text-base">Workforce Mapping</CardTitle>
            <CardDescription>
              Per-worksite worker / member / density. Pulled live from
              organising units; per-section overrides stay scoped to this
              section plan and don't change campaign data.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh from data
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">
            Could not load mapping: {(error as Error).message}
          </p>
        )}

        {!isLoading && !error && rows.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">
            No worksite organising units found for this campaign. Add units of
            type "worksite" via the campaign wizard or universe to populate
            this table.
          </p>
        )}

        {!isLoading && rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worksite / Location</TableHead>
                <TableHead className="text-right">Workers</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead className="text-right">Density</TableHead>
                <TableHead className="text-right">Non-members</TableHead>
                <TableHead className="text-right">Unrated</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.worksite_ou_id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.worksite_name}</span>
                      {r.has_override && (
                        <Badge variant="warning" className="text-[10px]">
                          override
                        </Badge>
                      )}
                    </div>
                    {r.override_note && (
                      <div className="text-xs text-muted-foreground">{r.override_note}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.workers_effective}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.members_effective}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.density_effective != null ? `${r.density_effective}%` : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.non_member_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.unrated_count}
                  </TableCell>
                  <TableCell>
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Override row for this section plan"
                        onClick={() => openEdit(r)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold border-t-2">
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{totalWorkers}</TableCell>
                <TableCell className="text-right tabular-nums">{totalMembers}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {totalDensity != null ? `${totalDensity}%` : '—'}
                </TableCell>
                <TableCell />
                <TableCell />
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={edit.open} onOpenChange={(o) => !o && closeEdit()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Override row — {edit.row?.worksite_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Leave a field blank to fall back to the live campaign value
              ({edit.row?.workers_count} workers · {edit.row?.members_count} members ·{' '}
              {edit.row?.density_pct ?? '—'}% density).
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ovr-w">Workers</Label>
                <Input
                  id="ovr-w"
                  type="number"
                  value={edit.workers}
                  onChange={(e) => setEdit({ ...edit, workers: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ovr-m">Members</Label>
                <Input
                  id="ovr-m"
                  type="number"
                  value={edit.members}
                  onChange={(e) => setEdit({ ...edit, members: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ovr-d">Density %</Label>
                <Input
                  id="ovr-d"
                  type="number"
                  step="0.1"
                  value={edit.density}
                  onChange={(e) => setEdit({ ...edit, density: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ovr-note">Note</Label>
              <Textarea
                id="ovr-note"
                rows={2}
                placeholder="Why this row is overridden"
                value={edit.note}
                onChange={(e) => setEdit({ ...edit, note: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="flex justify-between">
            {edit.row?.has_override ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearOverride}
                disabled={remove.isPending}
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Clear override
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={closeEdit}>
                Cancel
              </Button>
              <Button onClick={saveOverride} disabled={upsert.isPending}>
                {upsert.isPending ? 'Saving…' : 'Save override'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
