'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import { FileText, Search, Loader2, CheckCircle } from 'lucide-react'
import { useCallScripts } from '@/lib/hooks/useCallScripts'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string | number
  listId: number
  alreadyLinkedScriptIds: number[]
  currentScriptId: number | null | undefined
}

export function LinkListToScriptDialog({
  open,
  onOpenChange,
  campaignId,
  listId,
  alreadyLinkedScriptIds,
  currentScriptId,
}: Props) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const { data: scripts, isLoading } = useCallScripts(campaignId)

  const linked = new Set(alreadyLinkedScriptIds)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = scripts ?? []
    if (!term) return list
    return list.filter((s) => (s.title ?? '').toLowerCase().includes(term))
  }, [scripts, search])

  const linkMutation = useMutation({
    mutationFn: async ({
      scriptId,
      setCurrent,
    }: {
      scriptId: number
      setCurrent: boolean
    }) => {
      const res = await fetch(
        `/api/campaigns/${campaignId}/call-lists/${listId}/link-script`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script_id: scriptId, set_current: setCurrent }),
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }))
        throw new Error(err.error || 'Failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['call-list', String(campaignId), String(listId)],
      })
      queryClient.invalidateQueries({ queryKey: ['call-lists', String(campaignId)] })
    },
  })

  const handleLink = async (scriptId: number, setCurrent: boolean) => {
    try {
      await linkMutation.mutateAsync({ scriptId, setCurrent })
      toast.success(setCurrent ? 'Script linked & set as current' : 'Script linked')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to link')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Link a script to this list
          </DialogTitle>
          <DialogDescription>
            Choose a campaign script to attach to this list. You can link multiple
            scripts over time and switch which one is current for each call session.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search scripts..."
            className="pl-8 h-9 text-sm"
          />
        </div>

        <ScrollArea className="h-[320px] -mx-1 px-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              {scripts?.length === 0
                ? 'No scripts in this campaign yet.'
                : 'No scripts match your search.'}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((s) => {
                const isLinked = linked.has(s.script_id)
                const isCurrent = currentScriptId === s.script_id
                return (
                  <div
                    key={s.script_id}
                    className="group flex items-center gap-3 p-3 rounded-lg border bg-background hover:bg-muted/40 transition-colors"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{s.title}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {s.status}
                        </Badge>
                        {isCurrent && (
                          <Badge
                            variant="default"
                            className="text-[10px] bg-primary/15 text-primary border-primary/30"
                          >
                            Current
                          </Badge>
                        )}
                        {isLinked && !isCurrent && (
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <CheckCircle className="h-2.5 w-2.5" />
                            Already linked
                          </Badge>
                        )}
                      </div>
                      {s.call_objective && (
                        <p className="text-xs text-muted-foreground truncate">
                          {s.call_objective}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!isCurrent && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={linkMutation.isPending}
                          onClick={() => handleLink(s.script_id, true)}
                        >
                          Set as current
                        </Button>
                      )}
                      {!isLinked && (
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={linkMutation.isPending}
                          onClick={() => handleLink(s.script_id, false)}
                        >
                          Link
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
