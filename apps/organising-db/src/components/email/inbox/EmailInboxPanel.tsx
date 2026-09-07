'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  AlertCircle,
  CheckSquare,
  Download,
  Eye,
  Inbox,
  Loader2,
  Mail,
  Paperclip,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils/cn'
import { createClient } from '@/lib/supabase/client'
import {
  mergeEmailDetailPages,
  useBulkEmailConversationAction,
  useEmailConversationDetail,
  useEmailConversations,
  useEmailInboxCampaigns,
  useEmailQueueCounts,
} from '@/lib/hooks/useEmailInbox'
import type {
  EmailConversationListItem,
  EmailInboxTab,
} from '@/types/email-inbox'
import { EmailThreadView, type EmailDraftState } from './EmailThreadView'
import { EmailContextSidebar } from './EmailContextSidebar'

const ALL_CAMPAIGNS = '__all__'
const UNASSIGNED = '__unassigned__'
const TABS: Array<{ value: EmailInboxTab; label: string }> = [
  { value: 'mine', label: 'Mine' },
  { value: 'needs_response', label: 'Needs response' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'triage', label: 'Triage' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'team', label: 'Team' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
]

const STATE_CLASSES: Record<string, string> = {
  needs_response: 'bg-amber-100 text-amber-900',
  triage: 'bg-purple-100 text-purple-900',
  convo: 'bg-sky-100 text-sky-900',
  messaged: 'bg-sky-100 text-sky-900',
  closed: 'bg-zinc-100 text-zinc-700',
  needs_message: 'bg-emerald-100 text-emerald-900',
}

const EMPTY_DRAFT: EmailDraftState = {
  body: '',
  subject: '',
  attachments: [],
}

function title(conversation: EmailConversationListItem): string {
  const worker = conversation.worker
  return (
    [worker?.preferred_name || worker?.first_name, worker?.last_name]
      .filter(Boolean)
      .join(' ') || conversation.email_address
  )
}

export function EmailInboxPanel({
  campaignId,
  initialConversationId,
  className,
  onCampaignIdChange,
  onConversationIdChange,
}: {
  campaignId?: string | number | null
  initialConversationId?: number | null
  className?: string
  onCampaignIdChange?: (campaignId: number | null) => void
  onConversationIdChange?: (conversationId: number | null) => void
}) {
  const controlledCampaignId =
    campaignId === undefined
      ? undefined
      : campaignId != null && Number.isFinite(Number(campaignId))
        ? Number(campaignId)
        : null
  const [tab, setTab] = useState<EmailInboxTab>(
    initialConversationId != null ? 'all' : 'needs_response',
  )
  const [localCampaignId, setLocalCampaignId] = useState<number | null>(null)
  const selectedCampaignId =
    controlledCampaignId === undefined ? localCampaignId : controlledCampaignId
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [localSelectedId, setLocalSelectedId] = useState<number | null>(null)
  const selectedId =
    initialConversationId === undefined ? localSelectedId : initialConversationId
  const [drafts, setDrafts] = useState<Record<number, EmailDraftState>>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  const { data: campaigns = [] } = useEmailInboxCampaigns()
  const { data: counts } = useEmailQueueCounts(selectedCampaignId)
  const bulkAction = useBulkEmailConversationAction()
  const { data: staff = [] } = useQuery({
    queryKey: ['email-inbox-staff'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('user_profiles')
        .select('user_id, display_name')
        .order('display_name', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })
  const filters = useMemo(
    () => ({
      inbox: tab,
      campaignId: selectedCampaignId,
      search: debouncedSearch || undefined,
      unreadOnly,
    }),
    [debouncedSearch, selectedCampaignId, tab, unreadOnly],
  )
  const conversationsQuery = useEmailConversations(filters)
  const conversations = useMemo(
    () => conversationsQuery.data?.pages.flat() ?? [],
    [conversationsQuery.data?.pages],
  )
  const detailQuery = useEmailConversationDetail(selectedId)
  const detail = useMemo(
    () => mergeEmailDetailPages(detailQuery.data?.pages),
    [detailQuery.data?.pages],
  )
  const draft = selectedId != null ? drafts[selectedId] ?? EMPTY_DRAFT : EMPTY_DRAFT

  const updateDraft = (next: EmailDraftState) => {
    if (selectedId == null) return
    setDrafts((current) => ({ ...current, [selectedId]: next }))
  }

  const openConversation = (conversationId: number) => {
    setLocalSelectedId(conversationId)
    setSidebarOpen(false)
    onConversationIdChange?.(conversationId)
  }

  const closeConversation = () => {
    setLocalSelectedId(null)
    setSidebarOpen(false)
    onConversationIdChange?.(null)
  }

  const chooseCampaign = (value: string) => {
    const next = value === ALL_CAMPAIGNS ? null : Number(value)
    const campaign = next != null && Number.isFinite(next) ? next : null
    setLocalCampaignId(campaign)
    setLocalSelectedId(null)
    onCampaignIdChange?.(campaign)
    onConversationIdChange?.(null)
  }

  const toggleSelected = (conversationId: number) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(conversationId)) next.delete(conversationId)
      else next.add(conversationId)
      return next
    })
  }

  const runBulk = (
    operation: Parameters<typeof bulkAction.mutate>[0]['operation'],
    success: string,
  ) => {
    bulkAction.mutate(
      { conversation_ids: [...selectedIds], operation },
      {
        onSuccess: ({ updated }) => {
          toast.success(`${success} (${updated})`)
          setSelectedIds(new Set())
          setSelectionMode(false)
        },
        onError: (error: Error) => toast.error(error.message),
      },
    )
  }

  const exportSelected = () => {
    const selected = conversations.filter((conversation) =>
      selectedIds.has(conversation.conversation_id),
    )
    const escape = (value: unknown) => {
      const raw = String(value ?? '')
      const spreadsheetSafe = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw
      return `"${spreadsheetSafe.replaceAll('"', '""')}"`
    }
    const csv = [
      [
        'conversation_id',
        'worker',
        'email',
        'subject',
        'campaign',
        'state',
        'unread',
        'last_message_at',
      ].join(','),
      ...selected.map((conversation) =>
        [
          conversation.conversation_id,
          title(conversation),
          conversation.email_address,
          conversation.subject,
          conversation.campaign?.name,
          conversation.state,
          conversation.unread_count,
          conversation.last_message_at,
        ]
          .map(escape)
          .join(','),
      ),
    ].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `email-inbox-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className={cn(
        'flex h-[70vh] min-h-[520px] overflow-hidden rounded-md border bg-background',
        className,
      )}
    >
      <section
        aria-label="Email conversation queue"
        className={`w-full flex-col md:flex md:w-[22rem] md:shrink-0 md:border-r ${
          selectedId != null ? 'hidden' : 'flex'
        }`}
      >
        <div className="space-y-2 border-b p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              className="h-9 pl-8 text-sm"
              aria-label="Search email conversations"
              placeholder="Search worker, email, subject or message…"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1" aria-label="Queue filters">
            {TABS.map((item) => (
              <Button
                key={item.value}
                type="button"
                size="sm"
                variant={tab === item.value ? 'default' : 'outline'}
                className="h-7 px-2 text-xs"
                onClick={() => setTab(item.value)}
              >
                {item.label}
                {counts && (
                  <span className="ml-1 text-[10px] opacity-70">
                    {counts[item.value]}
                  </span>
                )}
              </Button>
            ))}
          </div>
          <Select
            value={
              selectedCampaignId != null
                ? String(selectedCampaignId)
                : ALL_CAMPAIGNS
            }
            onValueChange={chooseCampaign}
          >
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder="All campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CAMPAIGNS}>All campaigns</SelectItem>
              <SelectGroup>
                <SelectLabel>Campaigns</SelectLabel>
                {campaigns.map((campaign) => (
                  <SelectItem
                    key={campaign.campaign_id}
                    value={String(campaign.campaign_id)}
                  >
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={unreadOnly}
                onCheckedChange={(checked) => setUnreadOnly(checked === true)}
              />
              Unread only
            </label>
            <Button
              type="button"
              variant={selectionMode ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                setSelectionMode((value) => !value)
                setSelectedIds(new Set())
              }}
            >
              {selectionMode ? (
                <X className="mr-1 h-3 w-3" />
              ) : (
                <CheckSquare className="mr-1 h-3 w-3" />
              )}
              {selectionMode ? 'Cancel' : 'Select'}
            </Button>
          </div>
          {selectionMode && selectedIds.size > 0 && (
            <div className="space-y-1.5 rounded-md border bg-muted/20 p-2">
              <p className="text-xs font-medium">
                {selectedIds.size} conversation{selectedIds.size === 1 ? '' : 's'} selected
              </p>
              <div className="grid grid-cols-2 gap-1">
                <Select
                  onValueChange={(value) =>
                    runBulk(
                      {
                        action: 'assign',
                        user_id: value === UNASSIGNED ? null : value,
                      },
                      'Assignment updated',
                    )
                  }
                >
                  <SelectTrigger className="h-7 text-[11px]">
                    <SelectValue placeholder="Assign…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {staff.map((profile) => (
                      <SelectItem key={profile.user_id} value={profile.user_id}>
                        {profile.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  onValueChange={(value) =>
                    runBulk(
                      {
                        action: 'attach',
                        campaign_id:
                          value === ALL_CAMPAIGNS ? null : Number(value),
                      },
                      'Campaign updated',
                    )
                  }
                >
                  <SelectTrigger className="h-7 text-[11px]">
                    <SelectValue placeholder="Attach…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_CAMPAIGNS}>Organisation-wide</SelectItem>
                    {campaigns.map((campaign) => (
                      <SelectItem
                        key={campaign.campaign_id}
                        value={String(campaign.campaign_id)}
                      >
                        {campaign.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => runBulk({ action: 'mark_read' }, 'Marked read')}
                >
                  <Eye className="mr-1 h-3 w-3" />
                  Read
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => runBulk({ action: 'close' }, 'Closed')}
                >
                  Close
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={exportSelected}
                >
                  <Download className="mr-1 h-3 w-3" />
                  Export
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversationsQuery.isLoading ? (
            <div className="space-y-3 p-3" aria-label="Loading conversations">
              {[0, 1, 2, 3, 4].map((item) => (
                <div key={item} className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : conversationsQuery.isError ? (
            <div className="m-3 rounded-md border border-destructive/40 p-4 text-center">
              <AlertCircle className="mx-auto mb-2 h-5 w-5 text-destructive" />
              <p className="text-sm font-medium">Could not load the inbox</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {(conversationsQuery.error as Error).message}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => conversationsQuery.refetch()}
              >
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Inbox className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium">No conversations in this queue</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try another queue, campaign, or search. New campaign replies will
                appear here automatically.
              </p>
            </div>
          ) : (
            <>
              {conversations.map((conversation) => (
                <ConversationRow
                  key={conversation.conversation_id}
                  conversation={conversation}
                  selected={conversation.conversation_id === selectedId}
                  selectionMode={selectionMode}
                  checked={selectedIds.has(conversation.conversation_id)}
                  onCheckedChange={() =>
                    toggleSelected(conversation.conversation_id)
                  }
                  onClick={() =>
                    selectionMode
                      ? toggleSelected(conversation.conversation_id)
                      : openConversation(conversation.conversation_id)
                  }
                />
              ))}
              {conversationsQuery.hasNextPage && (
                <div className="flex justify-center p-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={conversationsQuery.isFetchingNextPage}
                    onClick={() => conversationsQuery.fetchNextPage()}
                  >
                    {conversationsQuery.isFetchingNextPage && (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    )}
                    Load more conversations
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <main
        aria-label="Selected email conversation"
        className={`min-w-0 flex-1 flex-col md:flex ${
          selectedId != null ? 'flex' : 'hidden'
        }`}
      >
        {detail && selectedId != null ? (
          <EmailThreadView
            detail={detail}
            draft={draft}
            onDraftChange={updateDraft}
            onBack={closeConversation}
            onOpenSidebar={() => setSidebarOpen(true)}
            onLoadOlder={() => detailQuery.fetchNextPage()}
            loadingOlder={detailQuery.isFetchingNextPage}
          />
        ) : detailQuery.isError ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-sm text-center">
              <AlertCircle className="mx-auto mb-2 h-6 w-6 text-destructive" />
              <p className="font-medium">Could not load this conversation</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {(detailQuery.error as Error).message}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => detailQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          </div>
        ) : selectedId != null ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="hidden flex-1 items-center justify-center md:flex">
            <div className="text-center text-sm text-muted-foreground">
              <Mail className="mx-auto mb-2 h-6 w-6" />
              Select a conversation to read and reply.
            </div>
          </div>
        )}
      </main>

      <div className="hidden w-80 shrink-0 border-l xl:flex xl:flex-col">
        {detail ? (
          <EmailContextSidebar
            detail={detail}
            draft={draft}
            onInsertSavedReply={(body) => updateDraft({ ...draft, body })}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
            Worker, campaign and workflow details appear here.
          </div>
        )}
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto p-0">
          <SheetHeader className="border-b p-3">
            <SheetTitle className="text-sm">Worker and campaign details</SheetTitle>
          </SheetHeader>
          {detail && (
            <EmailContextSidebar
              detail={detail}
              draft={draft}
              onInsertSavedReply={(body) => {
                updateDraft({ ...draft, body })
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
  conversation,
  selected,
  selectionMode,
  checked,
  onCheckedChange,
  onClick,
}: {
  conversation: EmailConversationListItem
  selected: boolean
  selectionMode: boolean
  checked: boolean
  onCheckedChange: () => void
  onClick: () => void
}) {
  return (
    <div
      className={`flex w-full items-start border-b hover:bg-muted/40 ${
        selected ? 'bg-muted/60' : ''
      }`}
    >
      {selectionMode && (
        <div className="pl-3 pt-3.5">
          <Checkbox
            checked={checked}
            aria-label={`Select ${title(conversation)}`}
            onCheckedChange={onCheckedChange}
          />
        </div>
      )}
      <button
        type="button"
        aria-pressed={selected}
        onClick={onClick}
        className="flex min-w-0 flex-1 items-start gap-2 px-3 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">
              {title(conversation)}
            </p>
            {conversation.last_message_at && (
              <time
                dateTime={conversation.last_message_at}
                className="shrink-0 text-xs text-muted-foreground"
              >
                {formatDistanceToNow(new Date(conversation.last_message_at), {
                  addSuffix: true,
                })}
              </time>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-foreground">
            {conversation.subject || '(no subject)'}
          </p>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {conversation.last_message_preview || conversation.email_address}
          </p>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge
              variant="secondary"
              className={`text-[11px] ${STATE_CLASSES[conversation.state] || ''}`}
            >
              {conversation.state.replaceAll('_', ' ')}
            </Badge>
            {conversation.campaign && (
              <span className="max-w-40 truncate text-xs text-muted-foreground">
                {conversation.campaign.name}
              </span>
            )}
            {conversation.assignee_user_id && (
              <span className="text-xs text-muted-foreground">Assigned</span>
            )}
              {conversation.is_overdue && (
              <span className="text-xs font-medium text-destructive">
                Waiting 24h+
              </span>
            )}
            {conversation.last_message_preview?.includes('attachment') && (
              <Paperclip className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        </div>
        {conversation.unread_count > 0 && (
          <Badge className="h-6 min-w-6 justify-center rounded-full px-1.5 text-xs">
            {conversation.unread_count}
          </Badge>
        )}
      </button>
    </div>
  )
}
