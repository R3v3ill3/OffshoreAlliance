'use client'

/**
 * Roster rail — the left pane of the 3-pane chat workspace (Phase 10,
 * decision 8c).
 *
 * Each row is two lines: the member's name as the loudest text, then
 * state, time since their last reply, unread count and rating chip. The
 * WHOLE row background carries the conversation state, and a row with
 * unread inbound pulses slowly amber.
 *
 * Palette rule (brief §E0): row tints are deliberately desaturated and
 * come from a different family than RATING_LEVELS, which means *rating*
 * everywhere else in the app. A green row must never ambiguously mean
 * both "supportive" and "replied", so the rating rides as a separate
 * saturated chip.
 *
 * Select mode turns rows into checkboxes and docks the wave-send bar at
 * the foot, reusing the board's existing selection helpers unchanged.
 */
import { useMemo, useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { CheckSquare, Search, Square, Loader2, Send } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { RATING_LEVELS } from '@/types/planner-types'
import {
  P2P_SEND_CAP,
  filterP2pItems,
  isP2pSendable,
  selectNextN,
} from '@/lib/sms/p2p'
import {
  deriveRailState,
  isActionable,
  railStateRank,
  shouldPulse,
  type SmsRailState,
} from '@/lib/sms/chat-rail-state'
import type { SmsP2pBoardItem } from '@/types/sms'

/**
 * Desaturated state tints. Distinct from RATING_LEVELS by construction:
 * these are 50/100-weight washes, ratings are saturated pills.
 */
const RAIL_TINT: Record<SmsRailState, string> = {
  not_messaged: 'bg-slate-50',
  sending: 'bg-sky-50',
  messaged: 'bg-sky-50',
  // new_reply's background comes from the .sms-rail-pulse animation.
  new_reply: '',
  needs_response: 'bg-amber-50',
  in_conversation: 'bg-emerald-50',
  closed: 'bg-slate-100',
  opted_out: 'bg-rose-50',
  failed: 'bg-red-50',
}

const RAIL_LABEL: Record<SmsRailState, string> = {
  not_messaged: 'Not messaged',
  sending: 'Sending',
  messaged: 'Messaged',
  new_reply: 'New reply',
  needs_response: 'Needs response',
  in_conversation: 'In conversation',
  closed: 'Closed',
  opted_out: 'Opted out',
  failed: 'Failed',
}

function ratingChipClass(rating: number | null): string {
  if (rating == null) return 'bg-muted text-foreground'
  return RATING_LEVELS.find((r) => r.value === rating)?.tailwindBg ?? 'bg-muted'
}

export interface SmsChatRailProps {
  boardName: string
  items: SmsP2pBoardItem[]
  selectedItemId: number | null
  onSelectItem: (item: SmsP2pBoardItem) => void
  /** Wave sending — omitted when the board is closed. */
  onSend?: (itemIds: number[]) => void
  sending?: boolean
  boardClosed?: boolean
}

export function SmsChatRail({
  boardName,
  items,
  selectedItemId,
  onSelectItem,
  onSend,
  sending = false,
  boardClosed = false,
}: SmsChatRailProps) {
  const [search, setSearch] = useState('')
  const [needsReplyOnly, setNeedsReplyOnly] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [nextN, setNextN] = useState('10')

  const rows = useMemo(() => {
    const filtered = filterP2pItems(items, { search, status: 'all' })
      .map((item) => ({ item, state: deriveRailState(item) }))
      .filter((row) => !needsReplyOnly || isActionable(row.state))
    // Actionable rows first; board order within a state so the
    // organiser's own ordering still shows through.
    return filtered.sort(
      (a, b) =>
        railStateRank(a.state) - railStateRank(b.state) ||
        a.item.sort_order - b.item.sort_order ||
        a.item.item_id - b.item.item_id,
    )
  }, [items, search, needsReplyOnly])

  const actionableCount = useMemo(
    () => items.filter((i) => isActionable(deriveRailState(i))).length,
    [items],
  )
  const sentCount = useMemo(
    () => items.filter((i) => ['sent', 'delivered'].includes(i.status)).length,
    [items],
  )

  const toggle = (item: SmsP2pBoardItem) => {
    if (!isP2pSendable(item)) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(item.item_id)) next.delete(item.item_id)
      else if (next.size < P2P_SEND_CAP) next.add(item.item_id)
      return next
    })
  }

  const exitSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="space-y-1.5 border-b p-2">
        <p className="truncate text-xs font-medium" title={boardName}>
          {boardName}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {sentCount}/{items.length} messaged
          {actionableCount > 0 ? ` · ${actionableCount} to reply` : ''}
        </p>
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
          <Input
            className="h-7 pl-6 text-[11px]"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant={needsReplyOnly ? 'default' : 'outline'}
            className="h-6 px-1.5 text-[10px]"
            aria-pressed={needsReplyOnly}
            onClick={() => setNeedsReplyOnly((v) => !v)}
          >
            Needs reply {actionableCount > 0 ? actionableCount : ''}
          </Button>
          {!boardClosed && onSend && (
            <Button
              size="sm"
              variant={selectMode ? 'default' : 'outline'}
              className="h-6 px-1.5 text-[10px]"
              aria-pressed={selectMode}
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            >
              {selectMode ? 'Done' : 'Select'}
            </Button>
          )}
        </div>
      </div>

      {/* Rows */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 && (
          <p className="p-3 text-center text-[11px] text-muted-foreground">
            {needsReplyOnly
              ? 'Nobody is waiting on a reply.'
              : 'No one matches that search.'}
          </p>
        )}
        {rows.map(({ item, state }) => {
          const pulsing = shouldPulse(state)
          const isSelected = item.item_id === selectedItemId
          const sendable = isP2pSendable(item) && !boardClosed
          return (
            <div
              key={item.item_id}
              className={`flex items-start gap-1.5 border-b border-l-[3px] px-2 py-1.5 ${
                RAIL_TINT[state]
              } ${pulsing ? 'sms-rail-pulse' : ''} ${
                isSelected
                  ? 'border-l-primary ring-1 ring-inset ring-primary/40'
                  : 'border-l-transparent'
              }`}
            >
              {selectMode && (
                <Checkbox
                  className="mt-1"
                  checked={selected.has(item.item_id)}
                  disabled={!sendable}
                  aria-label={`Select ${item.worker_name}`}
                  onCheckedChange={() => toggle(item)}
                />
              )}
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onSelectItem(item)}
              >
                {/* Name is the loudest text in the row. Opted-out rows
                    are struck through rather than dimmed — dimming the
                    whole row destroys legibility. */}
                <p
                  className={`truncate text-[13px] font-medium text-foreground ${
                    state === 'opted_out' ? 'line-through' : ''
                  }`}
                >
                  {item.worker_name}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="truncate">{RAIL_LABEL[state]}</span>
                  {item.last_inbound_at && (
                    <span className="shrink-0">
                      {formatDistanceToNowStrict(new Date(item.last_inbound_at))}
                    </span>
                  )}
                  {item.unread_count > 0 && (
                    <Badge className="h-4 min-w-4 shrink-0 justify-center rounded-full bg-orange-600 px-1 text-[10px] text-white">
                      {item.unread_count}
                    </Badge>
                  )}
                  {item.rating_summary && (
                    <span
                      className={`shrink-0 rounded-full px-1.5 text-[10px] text-foreground ${ratingChipClass(
                        item.rating_summary.rating,
                      )}`}
                      title="Recorded rating"
                    >
                      {item.rating_summary.rating ??
                        item.rating_summary.binary_value}
                    </span>
                  )}
                </div>
              </button>
            </div>
          )
        })}
      </div>

      {/* Wave-send bar — Select mode only. */}
      {selectMode && onSend && (
        <div className="space-y-1.5 border-t p-2">
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 px-1.5 text-[10px]"
              onClick={() =>
                setSelected(
                  selectNextN(
                    rows.map((r) => r.item),
                    selected,
                    parseInt(nextN, 10) || 0,
                  ),
                )
              }
            >
              <CheckSquare className="mr-1 h-3 w-3" />
              Select next
            </Button>
            <Input
              className="h-7 w-12 text-[10px]"
              type="number"
              min={1}
              max={P2P_SEND_CAP}
              value={nextN}
              onChange={(e) => setNextN(e.target.value)}
              aria-label="How many to select"
            />
          </div>
          {selected.size > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-full text-[10px]"
              onClick={() => setSelected(new Set())}
            >
              <Square className="mr-1 h-3 w-3" />
              Clear
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 w-full text-[11px]"
            disabled={selected.size === 0 || sending}
            onClick={() => {
              onSend([...selected])
              setSelected(new Set())
            }}
          >
            {sending ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Send className="mr-1 h-3 w-3" />
            )}
            Send to {selected.size}
          </Button>
          {selected.size >= P2P_SEND_CAP && (
            <p className="text-[10px] text-amber-700">
              Capped at {P2P_SEND_CAP} per send.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
