'use client'

/**
 * Streaming chat panel for the SOC wizard.
 *
 * Shows the running coaching transcript for one (session, stage, hope_frame),
 * a composer input, and a "Lock this stage" button that takes whatever the
 * organiser has consolidated as the locked content for the stage.
 *
 * Wraps the useCoachStream hook from @/lib/hooks/useSocWizard.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Send, Loader2, Lock, RotateCcw, MessageSquare, Sparkles } from 'lucide-react'
import {
  useCoachStream,
  useLockStage,
  useRegenerateStage,
  useSuggestDraft,
  type SuggestDraftFocusPhrase,
} from '@/lib/hooks/useSocWizard'
import type { HopeFrame, SocStage } from '@/lib/prompts/soc-framework'
import { STAGE_COACHING, HOPE_FRAME_COACHING } from '@/lib/prompts/soc/coaching'
import { toast } from 'sonner'
import { cn } from '@/lib/utils/cn'

interface CoachChatPanelProps {
  session_id: number
  stage_number: SocStage
  stage_name: string
  hope_frame?: HopeFrame
  population_index?: number | null
  alreadyLocked: boolean
  initialLockedContent?: string
  onLocked?: () => void
  /**
   * Optional controlled composer text. Pass when a sibling component
   * (e.g. StageSeedPanel) needs to drop text into the composer. When
   * omitted, the panel manages its own composer state.
   */
  composerText?: string
  onComposerTextChange?: (next: string) => void
}

export function CoachChatPanel({
  session_id,
  stage_number,
  stage_name,
  hope_frame,
  population_index,
  alreadyLocked,
  initialLockedContent,
  onLocked,
  composerText: composerTextProp,
  onComposerTextChange,
}: CoachChatPanelProps) {
  const [internalComposerText, setInternalComposerText] = useState('')
  const composerText = composerTextProp ?? internalComposerText
  const setComposerText = (next: string) => {
    if (onComposerTextChange) onComposerTextChange(next)
    else setInternalComposerText(next)
  }
  const [draftLocked, setDraftLocked] = useState(initialLockedContent ?? '')
  const scrollRef = useRef<HTMLDivElement>(null)

  const stream = useCoachStream({
    session_id,
    stage_number,
    hope_frame: hope_frame ?? null,
    population_index: population_index ?? null,
  })
  const lockStage = useLockStage()
  const regenerate = useRegenerateStage()
  const suggestDraft = useSuggestDraft()

  const purpose = useMemo(() => {
    if (hope_frame) {
      return HOPE_FRAME_COACHING[hope_frame].short_purpose
    }
    return STAGE_COACHING[stage_number].short_purpose
  }, [stage_number, hope_frame])

  // Auto-scroll on new turns / streaming deltas
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [stream.turns, stream.isStreaming])

  // Sync initialLockedContent when scope changes
  useEffect(() => {
    setDraftLocked(initialLockedContent ?? '')
  }, [initialLockedContent, session_id, stage_number, hope_frame, population_index])

  // ----- Last draft + coach-flagged phrases -----
  // After the coach responds, find the user's most recent draft (the turn
  // it was critiquing) and the phrases the coach quoted from it. We use
  // these to render a read-only "Your last draft" preview above the
  // composer with the flagged phrases highlighted, and to pre-fill the
  // composer with the previous draft so the user can edit rather than
  // retype.
  const {
    displayedDraft,
    structuredPhrases,
    isSuggestion,
    lastCoachReply,
    lastAssistantTurnIndex,
  } = useMemo(() => {
    const turns = stream.turns
    let draft = ''
    let coachReply = ''
    let lastIdx = -1
    let suggestion = false
    let phrases: SuggestDraftFocusPhrase[] | null = null

    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].role === 'assistant') {
        const t = turns[i]
        coachReply = t.content
        lastIdx = t.turn_index
        const meta = t.ai_metadata as Record<string, unknown> | null | undefined
        // Suggestion: use the embedded draft_text + structured focus phrases.
        if (meta && meta.kind === 'draft_suggestion' && typeof meta.draft_text === 'string') {
          draft = meta.draft_text
          suggestion = true
          if (Array.isArray(meta.focus_phrases)) {
            phrases = (meta.focus_phrases as SuggestDraftFocusPhrase[]) ?? []
          }
        } else {
          // Regular critique: use the user's most recent draft turn.
          for (let j = i - 1; j >= 0; j--) {
            if (turns[j].role === 'user') {
              draft = turns[j].content
              break
            }
          }
        }
        break
      }
    }
    return {
      displayedDraft: draft,
      structuredPhrases: phrases,
      isSuggestion: suggestion,
      lastCoachReply: coachReply,
      lastAssistantTurnIndex: lastIdx,
    }
  }, [stream.turns])

  const flaggedQuotes = useMemo(
    () => (isSuggestion ? [] : extractCoachQuotes(lastCoachReply)),
    [lastCoachReply, isSuggestion]
  )

  // Pre-fill the composer with the previous draft once a new coach turn
  // arrives, but ONLY when the composer is empty and the streaming has
  // finished (don't yank text out from under the user mid-type or
  // mid-stream). Tracked by ref so we only pre-fill once per coach turn.
  const prefilledForTurnRef = useRef<number>(-1)
  useEffect(() => {
    if (stream.isStreaming) return
    if (lastAssistantTurnIndex < 0) return
    if (prefilledForTurnRef.current === lastAssistantTurnIndex) return
    if (composerText.trim().length > 0) {
      // User is already editing — don't overwrite. Mark as handled so we
      // don't try again next render.
      prefilledForTurnRef.current = lastAssistantTurnIndex
      return
    }
    if (!displayedDraft) return
    setComposerText(displayedDraft)
    prefilledForTurnRef.current = lastAssistantTurnIndex
    // setComposerText is stable per render via a ref-like pattern; safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.isStreaming, lastAssistantTurnIndex, displayedDraft])

  async function handleSuggest() {
    if (suggestDraft.isPending || stream.isStreaming || alreadyLocked) return
    try {
      await suggestDraft.mutateAsync({
        session_id,
        stage_number,
        hope_frame,
        population_index: population_index ?? null,
      })
      // Reset the prefilled-for-turn marker so the new suggestion turn
      // pre-fills the composer if it's empty.
      prefilledForTurnRef.current = -1
      toast.success('Starting draft suggested — review the highlighted phrases.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not suggest draft')
    }
  }

  async function handleSend() {
    const text = composerText.trim()
    if (!text || stream.isStreaming) return
    setComposerText('')
    await stream.send(text)
  }

  async function handleLock() {
    // Lock whatever the user has consolidated in the composer. Skips the
    // copy-paste hop into a separate "locked content" box — what's in the
    // composer is what gets locked.
    const content = composerText.trim()
    if (!content) {
      toast.error('Type or edit your draft in the composer first, then lock it.')
      return
    }
    try {
      await lockStage.mutateAsync({
        session_id,
        stage_number,
        hope_frame,
        population_index: population_index ?? null,
        stage_name,
        locked_content: content,
      })
      setDraftLocked(content)
      toast.success(
        `Stage locked: ${stage_name}${hope_frame ? ` (${HOPE_FRAME_COACHING[hope_frame].name})` : ''}`
      )
      onLocked?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to lock stage')
    }
  }

  async function handleRegenerate() {
    if (!confirm('Regenerate this stage? This deletes the chat history and any locked content.')) return
    try {
      await regenerate.mutateAsync({ session_id, stage_number, hope_frame, population_index: population_index ?? null })
      setDraftLocked('')
      toast.success('Stage reset.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to regenerate')
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="px-4 py-3 border-b bg-slate-50">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <MessageSquare className="h-4 w-4 text-slate-500" />
              Coach
              {hope_frame && (
                <span className="text-xs font-medium text-slate-500">
                  · {HOPE_FRAME_COACHING[hope_frame].name}
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSuggest}
              disabled={suggestDraft.isPending || stream.isStreaming || alreadyLocked}
              title="Generate a starting draft from the campaign context. The AI flags phrases where your judgment matters — especially sector language and tone."
            >
              {suggestDraft.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Suggest a starting draft
            </Button>
          </div>
          <p className="text-xs text-slate-600 mt-1">{purpose}</p>
        </div>

        <div ref={scrollRef} className="max-h-[420px] min-h-[200px] overflow-y-auto px-4 py-4 space-y-3 bg-white">
          {stream.isLoading && stream.turns.length === 0 ? (
            <p className="text-xs text-slate-500 italic">Loading conversation…</p>
          ) : stream.turns.length === 0 ? (
            <p className="text-xs text-slate-500 italic">
              Type your draft language for this stage below — the coach will critique it and ask probing questions to push you to refine it.
            </p>
          ) : (
            stream.turns.map((t) => (
              <div
                key={t.turn_index}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm',
                  t.role === 'user'
                    ? 'bg-blue-50 text-slate-900 ml-8 border border-blue-100'
                    : 'bg-slate-100 text-slate-800 mr-8'
                )}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">
                  {t.role === 'user' ? 'You' : 'Coach'}
                  {t.streaming && (
                    <Loader2 className="h-3 w-3 inline ml-2 animate-spin" />
                  )}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed">{t.content}</div>
                {t.error && (
                  <div className="text-xs text-red-600 mt-1">{t.error}</div>
                )}
              </div>
            ))
          )}
        </div>

        {displayedDraft && !alreadyLocked && (
          <div className="px-4 py-3 border-t bg-amber-50/60">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-amber-800 mb-1.5 flex items-center justify-between">
              <span>
                {isSuggestion
                  ? `Coach's suggested starting draft${(structuredPhrases?.length ?? 0) > 0 ? ' — focus phrases highlighted (hover for context)' : ''}`
                  : `Your last draft${flaggedQuotes.length > 0 ? ' — phrases the coach flagged are highlighted' : ''}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setComposerText(displayedDraft)
                  prefilledForTurnRef.current = lastAssistantTurnIndex
                }}
                className="text-[10px] font-medium text-amber-700 hover:text-amber-900 underline-offset-2 hover:underline"
                title="Copy this draft into the composer below for editing"
              >
                Edit this draft ↓
              </button>
            </div>
            <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto bg-white border border-amber-200 rounded p-2">
              {isSuggestion && structuredPhrases
                ? renderHighlightedDraftStructured(displayedDraft, structuredPhrases)
                : renderHighlightedDraft(displayedDraft, flaggedQuotes)}
            </div>
          </div>
        )}

        <div className="px-4 py-3 border-t bg-slate-50">
          <Textarea
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            placeholder={`Write your draft language for this stage…  (${stream.turns.length === 0 ? 'first message starts the conversation' : 'iterate on what the coach said'})`}
            className="min-h-[80px] text-sm bg-white"
            disabled={stream.isStreaming || alreadyLocked}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
            <div className="text-[11px] text-slate-500">⌘ + Enter to send</div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={regenerate.isPending || stream.isStreaming}
                title="Reset this stage"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              {!alreadyLocked && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLock}
                  disabled={lockStage.isPending || !composerText.trim() || stream.isStreaming}
                  className="border-emerald-400 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-500"
                  title="Commit this draft as the final language for this stage"
                >
                  {lockStage.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  Lock as final
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!composerText.trim() || stream.isStreaming || alreadyLocked}
              >
                {stream.isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </Button>
            </div>
          </div>
          {!alreadyLocked && (
            <div className="text-[11px] text-slate-500 mt-2 italic leading-relaxed">
              💡 Ready to lock? {STAGE_COACHING[stage_number].closing_question}
            </div>
          )}
          {stream.error && (
            <div className="text-xs text-red-600 mt-2">{stream.error}</div>
          )}
        </div>

        {alreadyLocked && (
          <div className="px-4 py-3 border-t bg-emerald-50/50">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <div className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                Locked content for this stage
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRegenerate}
                disabled={regenerate.isPending}
                className="h-7 text-xs text-slate-600 hover:text-slate-900"
                title="Discard the locked content and chat history; start the stage over"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Reset & redo
              </Button>
            </div>
            <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap bg-white border border-emerald-200 rounded p-3">
              {draftLocked || initialLockedContent || '(empty)'}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ----- Quote extraction + highlight rendering -----

/**
 * Pull quoted phrases out of the coach's reply. The coach naturally quotes
 * back phrases from the user's draft when calling something out — those
 * are exactly the spans we want to highlight in the user's previous draft
 * preview. Matches both straight ("..." / '...') and curly quotes
 * (“...” / ‘...’). Filters out very short matches (likely false positives
 * like single words wrapped in scare quotes) and very long matches
 * (likely whole-sentence paraphrases).
 */
export function extractCoachQuotes(text: string): string[] {
  if (!text) return []
  const patterns = [
    /"([^"\n]{4,200})"/g,
    /'([^'\n]{4,200})'/g,
    /“([^“”\n]{4,200})”/g,
    /‘([^‘’\n]{4,200})’/g,
  ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const phrase = m[1].trim()
      if (phrase.length < 4) continue
      const key = phrase.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(phrase)
    }
  }
  return out
}

/**
 * Render the user's draft with the coach-quoted phrases wrapped in
 * <mark>. Matching is case-insensitive but exact otherwise — when the
 * coach paraphrases without quoting, no highlights appear (and that's
 * fine, the draft still renders cleanly).
 */
function renderHighlightedDraft(
  draft: string,
  phrases: string[]
): React.ReactNode {
  if (!phrases.length) return draft
  // Sort phrases longest-first so a longer phrase wins over a shorter
  // overlapping one (e.g. "leave it to us, mate" before "leave it").
  const sorted = [...phrases].sort((a, b) => b.length - a.length)
  // Build a single regex with all phrases as alternates, escaped.
  const escaped = sorted.map(escapeRegExp).join('|')
  const re = new RegExp(`(${escaped})`, 'gi')
  const parts: React.ReactNode[] = []
  let lastIdx = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(draft)) !== null) {
    if (m.index > lastIdx) {
      parts.push(draft.slice(lastIdx, m.index))
    }
    parts.push(
      <mark
        key={key++}
        className="bg-amber-200/70 text-slate-900 rounded px-0.5"
      >
        {m[0]}
      </mark>
    )
    lastIdx = m.index + m[0].length
    // Avoid infinite loop on zero-length matches (defensive)
    if (m[0].length === 0) re.lastIndex++
  }
  if (lastIdx < draft.length) parts.push(draft.slice(lastIdx))
  return parts
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Render a draft with structured focus phrases (from a draft suggestion).
 * Each highlight carries a tooltip with the reason + note so the user can
 * hover to see why the AI flagged it (tone, sector_language, judgment).
 *
 * Same single-amber colour as the quote-based highlighter to keep visual
 * noise low; the tooltip differentiates reasons.
 */
function renderHighlightedDraftStructured(
  draft: string,
  phrases: SuggestDraftFocusPhrase[]
): React.ReactNode {
  const valid = phrases.filter((p) => p?.phrase && draft.includes(p.phrase))
  if (valid.length === 0) return draft
  const sorted = [...valid].sort((a, b) => b.phrase.length - a.phrase.length)
  const phraseToMeta = new Map<string, SuggestDraftFocusPhrase>()
  for (const p of sorted) phraseToMeta.set(p.phrase.toLowerCase(), p)
  const escaped = sorted.map((p) => escapeRegExp(p.phrase)).join('|')
  const re = new RegExp(`(${escaped})`, 'g')
  const parts: React.ReactNode[] = []
  let lastIdx = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(draft)) !== null) {
    if (m.index > lastIdx) parts.push(draft.slice(lastIdx, m.index))
    const meta = phraseToMeta.get(m[0].toLowerCase())
    const reasonLabel = meta
      ? meta.reason === 'tone'
        ? 'Tone'
        : meta.reason === 'sector_language'
        ? 'Sector language'
        : 'Judgment'
      : 'Focus'
    const tooltip = meta ? `${reasonLabel}: ${meta.note}` : 'Focus'
    parts.push(
      <mark
        key={key++}
        title={tooltip}
        className="bg-amber-200/70 text-slate-900 rounded px-0.5 cursor-help"
      >
        {m[0]}
      </mark>
    )
    lastIdx = m.index + m[0].length
    if (m[0].length === 0) re.lastIndex++
  }
  if (lastIdx < draft.length) parts.push(draft.slice(lastIdx))
  return parts
}
