'use client'

/**
 * ConversationThreadDialog — shows the full email thread for a given
 * Microsoft Graph conversationId, fetched from our API proxy.
 *
 * Opened from EmailHistorySection when the user clicks "View thread".
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, Loader2, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'

interface GraphMessage {
  id: string
  subject: string
  receivedDateTime: string
  from: { emailAddress: { address: string; name?: string } }
  toRecipients: { emailAddress: { address: string; name?: string } }[]
  body: { content: string; contentType: string }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversationId: string
}

export function ConversationThreadDialog({
  open,
  onOpenChange,
  conversationId,
}: Props) {
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['conversation-thread', conversationId],
    queryFn: async () => {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}`,
      )
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(
          (json as { error?: string }).error ?? `HTTP ${res.status}`,
        )
      }
      return (await res.json()) as { messages: GraphMessage[] }
    },
    enabled: open && !!conversationId,
    staleTime: 60_000,
  })

  const messages = data?.messages ?? []
  const lastMsg = messages[messages.length - 1]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate text-base">
            {messages[0]?.subject ?? 'Email thread'}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center flex-1 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <p className="text-sm text-destructive">
              Could not load the thread. Make sure your Outlook connection is
              active and this email is accessible.
            </p>
          </div>
        )}

        {!isLoading && !isError && messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No messages found in this conversation.
          </p>
        )}

        {!isLoading && !isError && messages.length > 0 && (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {messages.map((msg) => {
              const isSelected = selectedMsgId === msg.id
              const fromLabel =
                msg.from.emailAddress.name || msg.from.emailAddress.address
              return (
                <div
                  key={msg.id}
                  className="rounded-md border text-sm overflow-hidden"
                >
                  <button
                    type="button"
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
                    onClick={() =>
                      setSelectedMsgId(isSelected ? null : msg.id)
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium truncate">{fromLabel}</span>
                      <span className="text-muted-foreground ml-2 text-[11px]">
                        {format(
                          new Date(msg.receivedDateTime),
                          'dd MMM yyyy HH:mm',
                        )}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {isSelected ? 'Collapse' : 'Expand'}
                    </Badge>
                  </button>
                  {isSelected && (
                    <div className="border-t bg-background">
                      {msg.body.contentType === 'html' ? (
                        <iframe
                          srcDoc={msg.body.content}
                          sandbox="allow-same-origin"
                          className="w-full min-h-[200px] max-h-[400px]"
                          title={`Message from ${fromLabel}`}
                        />
                      ) : (
                        <pre className="p-3 text-xs whitespace-pre-wrap font-sans">
                          {msg.body.content}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {lastMsg && (
          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <a
                href={`https://outlook.office.com/mail/deeplink/compose?inReplyTo=${encodeURIComponent(lastMsg.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Reply in Outlook
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
