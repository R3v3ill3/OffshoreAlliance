'use client'

/**
 * SMS inbox — three-pane desktop (queue | thread | member sidebar,
 * brief §7.3), collapsing on mobile to list ↔ full-screen thread with
 * the sidebar in a bottom Sheet.
 *
 * Queue tabs: Mine / Needs response / Unassigned / Triage / Escalated /
 * All (the escalation inbox is sticky — brief §3.1 item 5). Rendered
 * inside the campaign SMS sub-tab with a campaign-scope toggle; also
 * usable unscoped.
 */
import { useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ArrowUpRight, Inbox, Loader2, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  useSmsConversationDetail,
  useSmsConversations,
  type SmsConversationListItem,
  type SmsInboxTab,
} from '@/lib/hooks/useSmsInbox'
import { SmsThreadView } from './SmsThreadView'
import { SmsMemberSidebar } from './SmsMemberSidebar'
import { CONVERSATION_STATE_COLORS, conversationTitle } from './sms-inbox-shared'

const TABS: Array<{ value: SmsInboxTab; label: string }> = [
  { value: 'mine', label: 'Mine' },
  { value: 'needs_response', label: 'Needs response' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'triage', label: 'Triage' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'all', label: 'All' },
]

interface SmsInboxPanelProps {
  /** When set, the queue defaults to this campaign with an "all" toggle. */
  campaignId?: string | number
}

export function SmsInboxPanel({ campaignId }: SmsInboxPanelProps) {
  const cid = campaignId != null ? Number(campaignId) : null
  const [tab, setTab] = useState<SmsInboxTab>('needs_response')
  const [scope, setScope] = useState<'campaign' | 'all'>(
    cid != null ? 'campaign' : 'all',
  )
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const filters = useMemo(
    () => ({
      inbox: tab,
      campaignId: scope === 'campaign' ? cid : null,
      search: search.trim() || undefined,
    }),
    [tab, scope, cid, search],
  )
  const { data: conversations, isLoading } = useSmsConversations(filters)
  const { data: detail } = useSmsConversationDetail(selectedId)

  const openConversation = (id: number) => {
    setSelectedId(id)
    setDraft('')
    setSidebarOpen(false)
  }

  return (
    <div className="flex h-[70vh] min-h-[480px] overflow-hidden rounded-md border bg-background">
      {/* Queue list */}
      <div
        className={`w-full flex-col md:flex md:w-80 md:shrink-0 md:border-r ${
          selectedId != null ? 'hidden' : 'flex'
        }`}
      >
        <div className="space-y-2 border-b p-2">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-8 pl-7 text-xs"
              placeholder="Search name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <Button
                key={t.value}
                size="sm"
                variant={tab === t.value ? 'default' : 'outline'}
                className="h-6 px-2 text-[11px]"
                onClick={() => setTab(t.value)}
              >
                {t.label}
              </Button>
            ))}
          </div>
          {cid != null && (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={scope === 'campaign' ? 'secondary' : 'ghost'}
                className="h-6 px-2 text-[11px]"
                onClick={() => setScope('campaign')}
              >
                This campaign
              </Button>
              <Button
                size="sm"
                variant={scope === 'all' ? 'secondary' : 'ghost'}
                className="h-6 px-2 text-[11px]"
                onClick={() => setScope('all')}
              >
                All conversations
              </Button>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (conversations ?? []).length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-muted-foreground">
              <Inbox className="mx-auto mb-2 h-6 w-6" />
              No conversations here yet. Inbound replies and blast threads
              land in this inbox.
            </div>
          ) : (
            (conversations ?? []).map((conv) => (
              <ConversationRow
                key={conv.conversation_id}
                conv={conv}
                selected={conv.conversation_id === selectedId}
                onClick={() => openConversation(conv.conversation_id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Thread */}
      <div
        className={`min-w-0 flex-1 flex-col md:flex ${
          selectedId != null ? 'flex' : 'hidden'
        }`}
      >
        {detail && selectedId != null ? (
          <SmsThreadView
            detail={detail}
            draft={draft}
            onDraftChange={setDraft}
            onBack={() => setSelectedId(null)}
            onOpenSidebar={() => setSidebarOpen(true)}
          />
        ) : selectedId != null ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="hidden flex-1 items-center justify-center text-sm text-muted-foreground md:flex">
            Select a conversation.
          </div>
        )}
      </div>

      {/* Member sidebar — inline on xl+, bottom sheet below. */}
      <div className="hidden w-80 shrink-0 border-l xl:flex xl:flex-col">
        {detail ? (
          <SmsMemberSidebar
            detail={detail}
            draft={draft}
            onInsertCanned={(body) => setDraft(body)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
            Member details show here.
          </div>
        )}
      </div>
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="bottom" className="h-[80vh] overflow-y-auto p-0">
          <SheetHeader className="border-b p-3">
            <SheetTitle className="text-sm">Member details</SheetTitle>
          </SheetHeader>
          {detail && (
            <SmsMemberSidebar
              detail={detail}
              draft={draft}
              onInsertCanned={(body) => {
                setDraft(body)
                setSidebarOpen(false)
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ConversationRow({
  conv,
  selected,
  onClick,
}: {
  conv: SmsConversationListItem
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full border-b px-3 py-2 text-left hover:bg-muted/40 ${
        selected ? 'bg-muted/60' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {conversationTitle(conv)}
        </p>
        {conv.unread_count > 0 && (
          <Badge className="h-5 min-w-5 justify-center rounded-full bg-primary px-1.5 text-[10px]">
            {conv.unread_count}
          </Badge>
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        <Badge
          variant="secondary"
          className={`text-[10px] ${CONVERSATION_STATE_COLORS[conv.state] || ''}`}
        >
          {conv.state.replace('_', ' ')}
        </Badge>
        {conv.escalated_to_user_id && (
          <Badge
            variant="secondary"
            className="bg-orange-100 text-[10px] text-orange-800"
          >
            <ArrowUpRight className="mr-0.5 h-2.5 w-2.5" />
            escalated
          </Badge>
        )}
        {conv.campaign && (
          <span className="truncate text-[10px] text-muted-foreground">
            {conv.campaign.name}
          </span>
        )}
        {conv.last_message_at && (
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(conv.last_message_at), {
              addSuffix: true,
            })}
          </span>
        )}
      </div>
    </button>
  )
}
