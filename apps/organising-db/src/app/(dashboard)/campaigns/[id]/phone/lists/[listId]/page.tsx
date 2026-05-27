'use client'

import { useState, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useCallList,
  useCallListItems,
  useUpdateCallList,
  useDeleteCallList,
} from '@/lib/hooks/useCallList'
import { createClient } from '@/lib/supabase/client'
import { fetchApi } from '@/lib/api/fetch-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft, Phone, Play, Pause, Users, Loader2, CheckCircle,
  SkipForward, Clock, AlertCircle, Trash2, Filter, Pencil, Share2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { CallListStatus } from '@/types/planner-types'
import { CallListLinkedScripts } from '@/components/phone/CallListLinkedScripts'
import { IssueLinkDialog, type IssueLinkResult } from '@/components/share/issue-link-dialog'
import { IssuedLinkResultDialog } from '@/components/share/issued-link-result-dialog'
import { WorkerPicker } from '@/components/campaigns/shared/worker-picker'
import { EditCallSetupDialog } from '@/components/phone/orchestrator/EditCallSetupDialog'

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3 w-3 text-slate-500" />,
  in_progress: <Play className="h-3 w-3 text-blue-500" />,
  completed: <CheckCircle className="h-3 w-3 text-green-500" />,
  skipped: <SkipForward className="h-3 w-3 text-slate-400" />,
  deferred: <Clock className="h-3 w-3 text-purple-500" />,
}

export default function CallListDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const campaignId = params.id as string
  const listId = params.listId as string
  const supabase = createClient()
  const queryClient = useQueryClient()
  const actionId = useMemo(() => {
    const raw = searchParams.get('action_id')
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }, [searchParams])
  const [showEditSetup, setShowEditSetup] = useState(false)
  const returnTo = searchParams.get('returnTo')
    ? decodeURIComponent(searchParams.get('returnTo')!)
    : null
  // Default back target: when arriving via the orchestrator (action_id
  // set) without an explicit returnTo, fall back to the campaign page
  // rather than the Phone Ops tab so back retraces the breadcrumb.
  const backHref =
    returnTo ?? (actionId != null ? `/campaigns/${campaignId}` : `/campaigns/${campaignId}/phone`)
  const callUrl = actionId != null
    ? `/campaigns/${campaignId}/phone/call/${listId}?action_id=${actionId}&returnTo=${encodeURIComponent(typeof window === 'undefined' ? '' : window.location.pathname + window.location.search)}`
    : `/campaigns/${campaignId}/phone/call/${listId}`

  const { data: list, isLoading: listLoading } = useCallList(campaignId, listId)
  const { data: items, isLoading: itemsLoading } = useCallListItems(campaignId, listId)
  const updateList = useUpdateCallList(campaignId)
  const deleteList = useDeleteCallList(campaignId)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingDetails, setEditingDetails] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [issueResult, setIssueResult] = useState<IssueLinkResult | null>(null)
  const [bindLeader, setBindLeader] = useState(false)
  const [leaderWorkerIds, setLeaderWorkerIds] = useState<number[]>([])

  const { data: activeShareTokens = [] } = useQuery({
    queryKey: ['call-share-tokens', listId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_share_tokens')
        .select(
          `token_id, token_hash, leader_worker_id, expires_at, last_used_at, revoked_at,
           leader:workers!call_share_tokens_leader_worker_id_fkey(first_name, last_name)`
        )
        .eq('list_id', Number(listId))
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Array<{
        token_id: number
        token_hash: string
        leader_worker_id: number | null
        expires_at: string
        last_used_at: string | null
        leader: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null
      }>
    },
    enabled: !!listId,
    refetchInterval: 30_000,
  })

  const { data: currentCallers = [] } = useQuery({
    queryKey: ['call-share-current-callers', listId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_list_items')
        .select(
          `item_id, claimed_at, claimed_by_session_label, claimed_by_worker_id,
           worker:workers!call_list_items_worker_id_fkey(first_name, last_name, phone),
           claimer:workers!call_list_items_claimed_by_worker_id_fkey(first_name, last_name)`
        )
        .eq('list_id', Number(listId))
        .eq('status', 'in_progress')
        .not('claimed_at', 'is', null)
        .order('claimed_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Array<{
        item_id: number
        claimed_at: string
        claimed_by_session_label: string | null
        claimed_by_worker_id: number | null
        worker: { first_name: string; last_name: string; phone: string | null } | { first_name: string; last_name: string; phone: string | null }[] | null
        claimer: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null
      }>
    },
    enabled: !!listId,
    refetchInterval: 30_000,
  })

  const revokeShareToken = useMutation({
    mutationFn: async (tokenId: number) => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/call-lists/${listId}/share-tokens/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Failed to revoke link')
      }
    },
    onSuccess: () => {
      toast.success('Mobile link revoked')
      queryClient.invalidateQueries({ queryKey: ['call-share-tokens', listId] })
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to revoke link'),
  })

  type ListWithLinks = typeof list & {
    call_list_scripts?: Array<{
      script_id: number
      is_current: boolean
      wave_label: string | null
      linked_at: string
      call_scripts: {
        script_id: number
        title: string
        status: string
      } | null
    }>
  }
  const listWithLinks = list as ListWithLinks | undefined
  const linkedScripts = listWithLinks?.call_list_scripts ?? []

  const handleStatusChange = async (newStatus: CallListStatus) => {
    try {
      await updateList.mutateAsync({ listId: parseInt(listId), status: newStatus })
      toast.success(`List ${newStatus}`)
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleStartEditDetails = () => {
    setEditName(list?.name ?? '')
    setEditDescription(list?.description ?? '')
    setEditingDetails(true)
  }

  const handleSaveDetails = async () => {
    try {
      await updateList.mutateAsync({
        listId: parseInt(listId),
        name: editName,
        description: editDescription || null,
      })
      toast.success('List updated')
      setEditingDetails(false)
    } catch {
      toast.error('Failed to update list')
    }
  }

  if (listLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!list) {
    return <div className="text-center py-20 text-muted-foreground">List not found</div>
  }

  const progressPct = list.total_items > 0
    ? Math.round((list.completed_items / list.total_items) * 100)
    : 0
  const remainingItems = Math.max(0, (list.total_items ?? 0) - (list.completed_items ?? 0))
  const hasActiveScript = !!list.script_id
  const canShareMobile = hasActiveScript && remainingItems > 0
  const shareDisabledReason = !hasActiveScript
    ? 'Link an active script before sharing'
    : remainingItems === 0
      ? 'There are no remaining contacts to call'
      : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">{list.name}</h2>
          {list.description && (
            <p className="text-sm text-muted-foreground">{list.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={list.status === 'active' ? 'default' : 'secondary'}>
            {list.status}
          </Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleStartEditDetails}
          >
            <Pencil className="h-4 w-4 mr-1" />
            Edit details
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              router.push(
                `/campaigns/${campaignId}/phone/lists/new?edit_list_id=${listId}`
              )
            }
          >
            <Filter className="h-4 w-4 mr-1" />
            Edit filters
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canShareMobile}
            title={shareDisabledReason ?? 'Share this call list for mobile calling'}
            onClick={() => setShareOpen(true)}
          >
            <Share2 className="h-4 w-4 mr-1" />
            Share for mobile calling
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      {editingDetails && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Edit list details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditingDetails(false)}
                disabled={updateList.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveDetails}
                disabled={!editName.trim() || updateList.isPending}
              >
                {updateList.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : null}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats and actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Contacts</p>
            <p className="text-2xl font-bold">{list.total_items}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold">{list.completed_items}</p>
            <Progress value={progressPct} className="h-1 mt-1" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Strategy</p>
            <p className="text-sm font-medium mt-1">{list.priority_strategy.replace(/_/g, ' ')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex gap-2">
              {(list.status === 'draft' || list.status === 'paused') && (
                <Button size="sm" onClick={() => handleStatusChange('active')}>
                  <Play className="h-3 w-3 mr-1" />
                  Activate
                </Button>
              )}
              {list.status === 'active' && (
                <Button variant="outline" size="sm" onClick={() => handleStatusChange('paused')}>
                  <Pause className="h-3 w-3 mr-1" />
                  Pause
                </Button>
              )}
            </div>
            {actionId != null && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setShowEditSetup(true)}
              >
                Configure call setup
              </Button>
            )}
            {(list.status === 'active' || list.status === 'draft') && (
              <Button
                size="sm" className="w-full"
                onClick={() => router.push(callUrl)}
              >
                <Phone className="h-3 w-3 mr-1" />
                Start Calling
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Scripts linked to this list */}
      <CallListLinkedScripts
        campaignId={campaignId}
        listId={parseInt(listId)}
        links={linkedScripts}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Active mobile-call links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeShareTokens.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active mobile-call links.</p>
            ) : (
              activeShareTokens.map((token) => {
                const leaderRel = token.leader
                const leader = Array.isArray(leaderRel) ? leaderRel[0] : leaderRel
                return (
                  <div key={token.token_id} className="flex items-center justify-between gap-3 rounded border p-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium">Link ...{token.token_hash.slice(-8)}</p>
                      <p className="text-muted-foreground">
                        {leader ? `${leader.first_name} ${leader.last_name}`.trim() : 'Unbound link'}
                        {' · '}expires {new Date(token.expires_at).toLocaleString()}
                      </p>
                      <p className="text-muted-foreground">
                        {token.last_used_at ? `Last used ${new Date(token.last_used_at).toLocaleString()}` : 'Not used yet'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={revokeShareToken.isPending}
                      onClick={() => revokeShareToken.mutate(token.token_id)}
                    >
                      Revoke
                    </Button>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Currently calling</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {currentCallers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No contacts are currently claimed.</p>
            ) : (
              currentCallers.map((claim) => {
                const workerRel = claim.worker
                const worker = Array.isArray(workerRel) ? workerRel[0] : workerRel
                const claimerRel = claim.claimer
                const claimer = Array.isArray(claimerRel) ? claimerRel[0] : claimerRel
                const callerName =
                  claim.claimed_by_session_label ||
                  (claimer ? `${claimer.first_name} ${claimer.last_name}`.trim() : 'Unknown caller')
                return (
                  <div key={claim.item_id} className="rounded border p-2 text-xs">
                    <p className="font-medium">{callerName}</p>
                    <p className="text-muted-foreground">
                      Calling {worker ? `${worker.first_name} ${worker.last_name}`.trim() : `item #${claim.item_id}`}
                      {worker?.phone ? ` · ${worker.phone}` : ''}
                    </p>
                    <p className="text-muted-foreground">
                      Since {new Date(claim.claimed_at).toLocaleString()}
                    </p>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Contact list table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            Contacts ({items?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {itemsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items && items.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Worker &amp; phone</TableHead>
                    <TableHead>Employer</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                    <TableHead className="w-16">Calls</TableHead>
                    <TableHead>Last Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, i) => (
                    <TableRow key={item.item_id}>
                      <TableCell className="text-xs text-muted-foreground align-top pt-3">
                        {i + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                          <span className="text-base font-semibold">
                            {item.worker?.first_name} {item.worker?.last_name}
                          </span>
                          {item.worker?.phone ? (
                            <a
                              href={`tel:${item.worker.phone}`}
                              className="text-base font-semibold font-mono text-primary hover:underline"
                            >
                              {item.worker.phone}
                            </a>
                          ) : (
                            <span className="text-base font-semibold font-mono text-muted-foreground">
                              — no phone —
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.worker?.employer_name || '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {STATUS_ICONS[item.status] || null}
                          <span className="text-xs">{item.status}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        {item.attempts_count}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {item.best_disposition?.replace(/_/g, ' ') || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <AlertCircle className="h-6 w-6 mx-auto mb-2" />
              No contacts on this list yet
            </div>
          )}
        </CardContent>
      </Card>

      <IssueLinkDialog
        title="Share for mobile calling"
        target={
          shareOpen
            ? {
                title: list.name,
                contextLabel: 'For call list',
                endpoint: `/api/campaigns/${campaignId}/call-lists/${listId}/share-token`,
              }
            : null
        }
        workerSearchEndpoint={`/api/campaigns/${campaignId}/workers`}
        passwordHelp="You can share this one link with multiple callers — each person picks their name on sign-in and the system stops anyone from calling the same contact twice."
        extraPayload={{
          leaderWorkerId: bindLeader ? leaderWorkerIds[0] : undefined,
        }}
        extraFields={
          <div className="space-y-2 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={bindLeader}
                onChange={(event) => setBindLeader(event.target.checked)}
              />
              Bind to a specific leader
            </label>
            {bindLeader ? (
              <WorkerPicker
                campaignId={campaignId}
                initialSelected={leaderWorkerIds}
                onChange={(ids) => setLeaderWorkerIds(ids.slice(0, 1))}
                hideNotes
              />
            ) : null}
          </div>
        }
        onClose={() => setShareOpen(false)}
        onIssued={(result) => {
          setShareOpen(false)
          setIssueResult(result)
          queryClient.invalidateQueries({ queryKey: ['call-share-tokens', listId] })
        }}
      />

      <IssuedLinkResultDialog
        title="Mobile-call link ready"
        result={issueResult}
        onClose={() => setIssueResult(null)}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this call list?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the list, all contacts on it, and related call attempts. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteList.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteList.isPending}
              onClick={() => {
                void deleteList
                  .mutateAsync(parseInt(listId, 10))
                  .then(() => {
                    toast.success('Call list deleted')
                    router.push(`/campaigns/${campaignId}/phone`)
                  })
                  .catch((err: Error) => toast.error(err.message))
              }}
            >
              {deleteList.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {actionId != null && (
        <EditCallSetupDialog
          open={showEditSetup}
          onOpenChange={setShowEditSetup}
          campaignId={campaignId}
          actionId={actionId}
        />
      )}
    </div>
  )
}
