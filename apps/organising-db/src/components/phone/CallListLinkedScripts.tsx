'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  FileText,
  Star,
  Link2,
  Trash2,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { fetchApi } from '@/lib/api/fetch-api'
import { LinkListToScriptDialog } from './LinkListToScriptDialog'

interface LinkedScript {
  script_id: number
  is_current: boolean
  wave_label: string | null
  linked_at: string
  call_scripts: {
    script_id: number
    title: string
    status: string
  } | null
}

interface Props {
  campaignId: string | number
  listId: number
  links: LinkedScript[]
}

export function CallListLinkedScripts({ campaignId, listId, links }: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)

  const setCurrent = useMutation({
    mutationFn: async (scriptId: number) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/call-lists/${listId}/link-script`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script_id: scriptId, set_current: true }),
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

  const unlink = useMutation({
    mutationFn: async (scriptId: number) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/call-lists/${listId}/link-script?script_id=${scriptId}`,
        { method: 'DELETE' }
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

  const sorted = [...links]
    .filter((l) => l.call_scripts)
    .sort((a, b) => {
      if (a.is_current !== b.is_current) return a.is_current ? -1 : 1
      return (b.linked_at || '').localeCompare(a.linked_at || '')
    })

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Scripts used with this list ({sorted.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2">
            No scripts attached to this list yet.
          </div>
        ) : (
          sorted.map((link) => (
            <div
              key={link.script_id}
              className="flex items-center gap-2 p-2.5 rounded-lg border bg-background"
            >
              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">
                    {link.call_scripts?.title}
                  </p>
                  {link.is_current && (
                    <Badge
                      variant="default"
                      className="text-[10px] bg-primary/15 text-primary border-primary/30 gap-1"
                    >
                      <Star className="h-2.5 w-2.5" />
                      Current
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {link.call_scripts?.status}
                  </Badge>
                  {link.wave_label && (
                    <span className="text-[10px] text-muted-foreground">
                      {link.wave_label}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Linked {new Date(link.linked_at).toLocaleDateString('en-AU')}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!link.is_current && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={setCurrent.isPending}
                    onClick={() =>
                      setCurrent
                        .mutateAsync(link.script_id)
                        .then(() => toast.success('Set as current script'))
                        .catch((e: Error) => toast.error(e.message))
                    }
                  >
                    <Star className="h-3 w-3 mr-1" />
                    Set current
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() =>
                    router.push(
                      `/campaigns/${campaignId}/phone/scripts/${link.script_id}`
                    )
                  }
                >
                  Open editor
                </Button>
                {!link.is_current && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive"
                    disabled={unlink.isPending}
                    onClick={() =>
                      unlink
                        .mutateAsync(link.script_id)
                        .then(() => toast.success('Script unlinked'))
                        .catch((e: Error) => toast.error(e.message))
                    }
                  >
                    {unlink.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => setLinkDialogOpen(true)}
          >
            <Link2 className="h-3 w-3 mr-1" />
            Link another script
          </Button>
        </div>
      </CardContent>

      <LinkListToScriptDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        campaignId={campaignId}
        listId={listId}
        alreadyLinkedScriptIds={sorted.map((l) => l.script_id)}
        currentScriptId={sorted.find((l) => l.is_current)?.script_id ?? null}
      />
    </Card>
  )
}
