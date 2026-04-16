'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCallLists, useDeleteCallList } from '@/lib/hooks/useCallList'
import { useCallScripts } from '@/lib/hooks/useCallScripts'
import { CallCampaignReporting } from './CallCampaignReporting'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
  Phone, Plus, Play, FileText, Users, Loader2, Edit, ExternalLink, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { CallListWithStats } from '@/types/planner-types'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  paused: 'bg-amber-100 text-amber-700',
  archived: 'bg-slate-100 text-slate-500',
}

interface InlinePhoneOpsPanelProps {
  campaignId: string | number
}

export function InlinePhoneOpsPanel({ campaignId }: InlinePhoneOpsPanelProps) {
  const router = useRouter()
  const id = String(campaignId)

  const { data: scripts, isLoading: scriptsLoading } = useCallScripts(id)
  const { data: lists, isLoading: listsLoading } = useCallLists(id)
  const deleteList = useDeleteCallList(id)
  const [listPendingDelete, setListPendingDelete] = useState<CallListWithStats | null>(null)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Phone Call Operations</h3>
          <p className="text-sm text-muted-foreground">Manage scripts, call lists, and track outcomes</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/campaigns/${id}/phone/lists/new`)}
          >
            <Plus className="h-4 w-4 mr-1" />
            New Call List
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/campaigns/${id}/phone`)}
          >
            <ExternalLink className="h-4 w-4 mr-1" />
            Full Phone Ops
          </Button>
        </div>
      </div>

      {/* Scripts */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Call Scripts
          <Badge variant="secondary" className="text-xs">{scripts?.length || 0}</Badge>
        </h4>
        {scriptsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : scripts && scripts.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {scripts.map((script) => (
              <Card
                key={script.script_id}
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => router.push(`/campaigns/${id}/phone/scripts/${script.script_id}`)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{script.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {script.call_script_sections?.length || 0} sections
                      </p>
                    </div>
                    <Badge className={STATUS_COLORS[script.status] || ''} variant="secondary">
                      {script.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-4 text-center">
              <FileText className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No call scripts yet. Generate a phone script in the Campaign Plan → Capacities step.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Call Lists */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" />
          Call Lists
          <Badge variant="secondary" className="text-xs">{lists?.length || 0}</Badge>
        </h4>
        {listsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : lists && lists.length > 0 ? (
          <div className="space-y-2">
            {lists.map((list) => (
              <ListCard
                key={list.list_id}
                list={list}
                campaignId={id}
                router={router}
                onRequestDelete={setListPendingDelete}
              />
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-4 text-center">
              <Users className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">No call lists yet</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/campaigns/${id}/phone/lists/new`)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Create Call List
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Reporting — only shown when there is data */}
      <CallCampaignReporting campaignId={campaignId} />

      <AlertDialog
        open={listPendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setListPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete call list?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{listPendingDelete?.name}”, all contacts on the list, and related call attempts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteList.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteList.isPending}
              onClick={() => {
                if (!listPendingDelete) return
                void deleteList
                  .mutateAsync(listPendingDelete.list_id)
                  .then(() => {
                    toast.success('Call list deleted')
                    setListPendingDelete(null)
                  })
                  .catch((err: Error) => toast.error(err.message))
              }}
            >
              {deleteList.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ListCard({
  list,
  campaignId,
  router,
  onRequestDelete,
}: {
  list: CallListWithStats
  campaignId: string
  router: ReturnType<typeof useRouter>
  onRequestDelete: (list: CallListWithStats) => void
}) {
  const totalItems = list.total_items || 0
  const completedItems = list.completed_items || 0
  const progressPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0
  const scriptName = list.script?.title ?? null

  return (
    <Card className="hover:bg-muted/30 transition-colors">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium truncate">{list.name}</p>
              <Badge className={STATUS_COLORS[list.status] || ''} variant="secondary">
                {list.status}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{completedItems}/{totalItems} contacts</span>
              {scriptName && <span>Script: {scriptName}</span>}
            </div>
            {totalItems > 0 && (
              <Progress value={progressPct} className="h-1 mt-2" />
            )}
          </div>
          <div className="flex items-center gap-1">
            {(list.status === 'active' || list.status === 'draft') && (
              <Button
                size="sm"
                onClick={() => router.push(`/campaigns/${campaignId}/phone/call/${list.list_id}`)}
              >
                <Phone className="h-3 w-3 mr-1" />
                Call
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => router.push(`/campaigns/${campaignId}/phone/lists/${list.list_id}`)}
            >
              <Edit className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              title="Delete list"
              onClick={() => onRequestDelete(list)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
