'use client'

/**
 * Archive / unarchive / delete for one SMS action, plus the archived
 * banner used on detail sheets and chat boards. Hub rows and campaign
 * sheets share this so confirm copy and gates cannot drift.
 */
import { useState } from 'react'
import Link from 'next/link'
import { Archive, ArchiveRestore, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { lifecycleLabel, type SmsActionInspect } from '@/lib/sms/archive-policy'
import type { SmsActionKind } from '@/lib/sms/hub-actions'
import { smsLifecycleHref } from '@/lib/sms/hub-actions'
import { useSmsActionInspect, useSmsActionOp } from '@/lib/hooks/useSmsActionOps'

export function SmsArchivedBanner({ archivedAt }: { archivedAt?: string | null }) {
  if (!archivedAt) return null
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
      This SMS action is archived. It is hidden from the default list. Un-archive
      it to bring it back — status is unchanged.
    </div>
  )
}

export function ShowArchivedToggle({
  checked,
  onCheckedChange,
  archivedCount,
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  archivedCount?: number
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        aria-label="Show archived SMS actions"
      />
      Show archived
      {archivedCount != null && archivedCount > 0 && (
        <span className="tabular-nums">({archivedCount})</span>
      )}
    </label>
  )
}

export function SmsArchiveDeleteControls({
  kind,
  id,
  campaignId,
  canWrite,
  onGone,
  compact = false,
}: {
  kind: SmsActionKind
  id: number
  campaignId?: number | null
  canWrite: boolean
  onGone?: () => void
  compact?: boolean
}) {
  const { data: inspect, isLoading } = useSmsActionInspect(kind, id, campaignId, canWrite)
  const op = useSmsActionOp()
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [unarchiveOpen, setUnarchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (!canWrite) return null
  if (isLoading && !inspect) {
    return (
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading archive options" />
    )
  }
  if (!inspect) return null

  const run = (
    next: 'archive' | 'unarchive' | 'delete',
    confirm?: string,
  ) => {
    op.mutate(
      { kind, id, campaignId, op: next, confirm },
      {
        onSuccess: (res) => {
          const extra =
            res.paired > 0
              ? ` (${res.paired} linked launch text${res.paired === 1 ? '' : 's'} too)`
              : ''
          if (next === 'delete') {
            toast.success(`Deleted${extra}`)
            onGone?.()
          } else if (next === 'archive') {
            toast.success(`Archived${extra}`)
          } else {
            toast.success(`Restored to the list${extra}`)
          }
          setArchiveOpen(false)
          setUnarchiveOpen(false)
          setDeleteOpen(false)
        },
        onError: (err: Error) => toast.error(err.message),
      },
    )
  }

  return (
    <>
      <div className={compact ? 'flex flex-wrap gap-1.5' : 'flex flex-wrap gap-2'}>
        {inspect.canArchive && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setArchiveOpen(true)}
            disabled={op.isPending}
          >
            <Archive className="mr-1.5 h-3.5 w-3.5" />
            Archive
          </Button>
        )}
        {inspect.canUnarchive && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setUnarchiveOpen(true)}
            disabled={op.isPending}
          >
            <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
            Un-archive
          </Button>
        )}
        {inspect.canDelete && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
            disabled={op.isPending}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete
          </Button>
        )}
        {!inspect.canArchive &&
          !inspect.canUnarchive &&
          inspect.blocker && (
            <LifecycleHint inspect={inspect} />
          )}
      </div>
      <ArchiveDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        inspect={inspect}
        busy={op.isPending}
        onConfirm={() => run('archive')}
      />
      <UnarchiveDialog
        open={unarchiveOpen}
        onOpenChange={setUnarchiveOpen}
        inspect={inspect}
        busy={op.isPending}
        onConfirm={() => run('unarchive')}
      />
      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        inspect={inspect}
        busy={op.isPending}
        onConfirm={(confirm) => run('delete', confirm)}
      />
    </>
  )
}

export function SmsActionOpsLauncher({
  kind,
  id,
  campaignId,
  intent,
  onClose,
  onGone,
}: {
  kind: SmsActionKind
  id: number
  campaignId?: number | null
  intent: 'archive' | 'unarchive' | 'delete' | null
  onClose: () => void
  onGone?: () => void
}) {
  const { data: inspect, isLoading, error } = useSmsActionInspect(
    kind,
    intent ? id : null,
    campaignId,
    intent != null,
  )
  const op = useSmsActionOp()

  if (!intent) return null

  const run = (next: 'archive' | 'unarchive' | 'delete', confirm?: string) => {
    op.mutate(
      { kind, id, campaignId, op: next, confirm },
      {
        onSuccess: (res) => {
          const extra =
            res.paired > 0
              ? ` (${res.paired} linked launch text${res.paired === 1 ? '' : 's'} too)`
              : ''
          if (next === 'delete') {
            toast.success(`Deleted${extra}`)
            onGone?.()
          } else if (next === 'archive') {
            toast.success(`Archived${extra}`)
          } else {
            toast.success(`Restored to the list${extra}`)
          }
          onClose()
        },
        onError: (err: Error) => toast.error(err.message),
      },
    )
  }

  if (isLoading || !inspect) {
    return (
      <AlertDialog open onOpenChange={(o) => { if (!o) onClose() }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>SMS action</AlertDialogTitle>
            <AlertDialogDescription>
              {error ? error.message : 'Checking whether this can be archived or deleted…'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  if (intent === 'archive') {
    if (!inspect.canArchive) {
      return (
        <AlertDialog open onOpenChange={(o) => { if (!o) onClose() }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cannot archive yet</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>{inspect.blocker?.message ?? 'This action cannot be archived.'}</p>
                  {inspect.blocker && (
                    <LifecycleHint inspect={inspect} />
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Close</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )
    }
    return (
      <ArchiveDialog
        open
        onOpenChange={(o) => { if (!o) onClose() }}
        inspect={inspect}
        busy={op.isPending}
        onConfirm={() => run('archive')}
      />
    )
  }

  if (intent === 'unarchive') {
    return (
      <UnarchiveDialog
        open
        onOpenChange={(o) => { if (!o) onClose() }}
        inspect={inspect}
        busy={op.isPending}
        onConfirm={() => run('unarchive')}
      />
    )
  }

  if (!inspect.canDelete) {
    return (
      <AlertDialog open onOpenChange={(o) => { if (!o) onClose() }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cannot delete</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{inspect.blocker?.message ?? 'This action cannot be deleted.'}</p>
                {inspect.blocker && <LifecycleHint inspect={inspect} />}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <DeleteDialog
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      inspect={inspect}
      busy={op.isPending}
      onConfirm={(confirm) => run('delete', confirm)}
    />
  )
}

function LifecycleHint({ inspect }: { inspect: SmsActionInspect }) {
  if (!inspect.blocker) return null
  const ref =
    inspect.kind === 'relay'
      ? { kind: 'relay' as const, id: inspect.id }
      : {
          kind: inspect.kind,
          campaignId: inspect.campaignId as number,
          id: inspect.id,
        }
  const href = smsLifecycleHref(inspect.blocker.lifecycle, ref)
  return (
    <p className="text-xs text-muted-foreground">
      {inspect.blocker.message}{' '}
      <Link href={href} className="underline underline-offset-4">
        {lifecycleLabel(inspect.blocker.lifecycle)}
      </Link>
    </p>
  )
}

function pairCopy(inspect: SmsActionInspect): string | null {
  if (inspect.pair.length === 0) return null
  const names = inspect.pair.map((p) => p.name).join(', ')
  if (inspect.kind === 'relay') {
    return `Launch texts archived or restored with this relay: ${names}.`
  }
  return `This launch text is paired with ${names}. They are archived together after the relay has ended.`
}

function ArchiveDialog({
  open,
  onOpenChange,
  inspect,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  inspect: SmsActionInspect
  busy: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {inspect.name}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                It leaves the default list. Transcripts, ratings and facts stay.
                You can un-archive it later.
              </p>
              {pairCopy(inspect) && <p>{pairCopy(inspect)}</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={onConfirm}>
            {busy ? 'Archiving…' : 'Archive'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function UnarchiveDialog({
  open,
  onOpenChange,
  inspect,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  inspect: SmsActionInspect
  busy: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Un-archive {inspect.name}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>It returns to the default list. Status does not change.</p>
              {inspect.kind === 'relay' && (
                <p>An ended relay stays ended — un-archiving does not reclaim the number.</p>
              )}
              {pairCopy(inspect) && <p>{pairCopy(inspect)}</p>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={onConfirm}>
            {busy ? 'Restoring…' : 'Un-archive'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DeleteDialog({
  open,
  onOpenChange,
  inspect,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  inspect: SmsActionInspect
  busy: boolean
  onConfirm: (confirm?: string) => void
}) {
  const [typed, setTyped] = useState('')
  const [wantExport, setWantExport] = useState(false)
  const needsType = inspect.needsTypedConfirm
  const canSubmit = !needsType || typed === 'DELETE'

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setTyped('')
          setWantExport(false)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {inspect.name}?</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-left text-sm text-muted-foreground">
              <p>This cannot be undone. Wall-chart ratings and worker facts stay.</p>
              {inspect.isBallot && (
                <p className="font-medium text-foreground">
                  This is a closed ballot. Deleting it destroys the eligibility
                  roll and audit events.
                </p>
              )}
              {inspect.factsWarning && <p>{inspect.factsWarning}</p>}
              {inspect.writesRatings && (
                <p>Ratings already written to the wall chart are kept.</p>
              )}
              {pairCopy(inspect) && <p>{pairCopy(inspect)}</p>}
              {inspect.exportHref && (
                <label className="flex items-start gap-2 text-foreground">
                  <Checkbox
                    checked={wantExport}
                    onCheckedChange={(v) => setWantExport(v === true)}
                  />
                  <span>
                    Export CSV first
                    {wantExport && (
                      <>
                        {' — '}
                        <a
                          href={inspect.exportHref}
                          download
                          className="underline underline-offset-4"
                        >
                          download now
                        </a>
                      </>
                    )}
                  </span>
                </label>
              )}
              {needsType && (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="sms-delete-confirm">Type DELETE to confirm</Label>
                  <Input
                    id="sms-delete-confirm"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!canSubmit || busy}
            onClick={() => onConfirm(needsType ? 'DELETE' : undefined)}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}