'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Phone,
  Search,
  Plus,
  Link2,
  CheckCircle,
  Star,
  ListChecks,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { fetchApi } from '@/lib/api/fetch-api'
import type { CallListWithStats } from '@/types/planner-types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string | number
  scriptId: number
  scriptTitle?: string
}

type Mode = 'pick' | 'new'

export function LinkScriptToListDialog({
  open,
  onOpenChange,
  campaignId,
  scriptId,
  scriptTitle,
}: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<Mode>('pick')
  const [search, setSearch] = useState('')

  const { data: lists, isLoading } = useQuery({
    queryKey: ['call-lists-for-script', String(campaignId), String(scriptId)],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/call-lists?script_id=${scriptId}`
      )
      if (!res.ok) throw new Error('Failed to fetch call lists')
      return (await res.json()) as CallListWithStats[]
    },
    enabled: open,
  })

  const linkMutation = useMutation({
    mutationFn: async ({
      listId,
      setCurrent,
    }: {
      listId: number
      setCurrent: boolean
    }) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/call-lists/${listId}/link-script`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script_id: scriptId, set_current: setCurrent }),
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(err.error || 'Failed to link script')
      }
      return res.json() as Promise<{ success: true }>
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['call-lists', String(campaignId)] })
      queryClient.invalidateQueries({
        queryKey: ['call-lists-for-script', String(campaignId), String(scriptId)],
      })
      queryClient.invalidateQueries({
        queryKey: ['call-list', String(campaignId), String(vars.listId)],
      })
    },
  })

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return lists ?? []
    return (lists ?? []).filter(
      (l) =>
        l.name?.toLowerCase().includes(term) ||
        (l.description ?? '').toLowerCase().includes(term)
    )
  }, [lists, search])

  const handlePickAndGoToList = async (listId: number, setCurrent: boolean) => {
    try {
      await linkMutation.mutateAsync({ listId, setCurrent })
      toast.success(
        setCurrent
          ? 'Script set as current for this list'
          : 'Script linked to list'
      )
      onOpenChange(false)
      router.push(`/campaigns/${campaignId}/phone/lists/${listId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to link')
    }
  }

  const handleCreateNew = () => {
    onOpenChange(false)
    router.push(`/campaigns/${campaignId}/phone/lists/new?script_id=${scriptId}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Use this script on a call list
          </DialogTitle>
          <DialogDescription>
            {scriptTitle
              ? `Link "${scriptTitle}" to an existing call list or create a new one.`
              : 'Link this script to an existing call list or create a new one.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 border-b">
          <button
            className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              mode === 'pick'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setMode('pick')}
          >
            <Link2 className="h-3.5 w-3.5 mr-1 inline" />
            Link to existing list
          </button>
          <button
            className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              mode === 'new'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setMode('new')}
          >
            <Plus className="h-3.5 w-3.5 mr-1 inline" />
            Create new list
          </button>
        </div>

        {mode === 'pick' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search existing lists by name or description..."
                className="pl-8 h-9 text-sm"
              />
            </div>

            <ScrollArea className="h-[320px] -mx-1 px-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  {lists?.length === 0
                    ? 'No call lists in this campaign yet.'
                    : 'No lists match your search.'}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filtered.map((list) => {
                    const isCurrent = list.is_current_for_script
                    const wasLinked = list.previously_linked && !isCurrent
                    return (
                      <div
                        key={list.list_id}
                        className="group flex items-center gap-3 p-3 rounded-lg border bg-background hover:bg-muted/40 transition-colors"
                      >
                        <ListChecks className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium truncate">
                              {list.name}
                            </p>
                            {isCurrent && (
                              <Badge
                                variant="default"
                                className="text-[10px] bg-primary/15 text-primary border-primary/30 gap-1"
                              >
                                <Star className="h-2.5 w-2.5" />
                                Current script
                              </Badge>
                            )}
                            {wasLinked && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] gap-1"
                              >
                                <CheckCircle className="h-2.5 w-2.5" />
                                Previously linked
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {list.total_items ?? 0} contacts
                            {list.description ? ` · ${list.description}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!isCurrent && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={linkMutation.isPending}
                              onClick={() =>
                                handlePickAndGoToList(list.list_id, true)
                              }
                            >
                              Set as current
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={linkMutation.isPending}
                            onClick={() =>
                              handlePickAndGoToList(list.list_id, isCurrent ?? false)
                            }
                          >
                            Open list
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        )}

        {mode === 'new' && (
          <div className="py-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Opens the list builder wizard pre-populated with this script
              attached. You&apos;ll choose filters, call order, and a name on the next
              screens.
            </p>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Tip:</span> you can
              always link this script to additional lists later, or switch the
              current script for any list from its detail page.
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {mode === 'new' && (
            <Button onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-1" />
              Continue to builder
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
