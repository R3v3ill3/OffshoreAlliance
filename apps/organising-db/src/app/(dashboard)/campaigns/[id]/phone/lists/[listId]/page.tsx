'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  useCallList,
  useCallListItems,
  useUpdateCallList,
  useDeleteCallList,
} from '@/lib/hooks/useCallList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft, Phone, Play, Pause, Users, Loader2, CheckCircle,
  SkipForward, Clock, AlertCircle, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { CallListStatus } from '@/types/planner-types'

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
  const campaignId = params.id as string
  const listId = params.listId as string

  const { data: list, isLoading: listLoading } = useCallList(campaignId, listId)
  const { data: items, isLoading: itemsLoading } = useCallListItems(campaignId, listId)
  const updateList = useUpdateCallList(campaignId)
  const deleteList = useDeleteCallList(campaignId)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const handleStatusChange = async (newStatus: CallListStatus) => {
    try {
      await updateList.mutateAsync({ listId: parseInt(listId), status: newStatus })
      toast.success(`List ${newStatus}`)
    } catch {
      toast.error('Failed to update status')
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/campaigns/${campaignId}/phone`)}>
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
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      </div>

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
            {(list.status === 'active' || list.status === 'draft') && (
              <Button
                size="sm" className="w-full"
                onClick={() => router.push(`/campaigns/${campaignId}/phone/call/${listId}`)}
              >
                <Phone className="h-3 w-3 mr-1" />
                Start Calling
              </Button>
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
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Employer</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                    <TableHead className="w-16">Calls</TableHead>
                    <TableHead>Last Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, i) => (
                    <TableRow key={item.item_id}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-sm font-medium">
                        {item.worker?.first_name} {item.worker?.last_name}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {item.worker?.phone || '—'}
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
    </div>
  )
}
