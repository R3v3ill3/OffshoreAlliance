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
import { Send, Loader2, Lock, RotateCcw, MessageSquare } from 'lucide-react'
import { useCoachStream, useLockStage, useRegenerateStage } from '@/lib/hooks/useSocWizard'
import type { HopeFrame, SocStage } from '@/lib/prompts/soc-framework'
import { STAGE_COACHING, HOPE_FRAME_COACHING } from '@/lib/prompts/soc/coaching'
import { toast } from 'sonner'
import { cn } from '@/lib/utils/cn'

interface CoachChatPanelProps {
  session_id: number
  stage_number: SocStage
  stage_name: string
  hope_frame?: HopeFrame
  alreadyLocked: boolean
  initialLockedContent?: string
  onLocked?: () => void
}

export function CoachChatPanel({
  session_id,
  stage_number,
  stage_name,
  hope_frame,
  alreadyLocked,
  initialLockedContent,
  onLocked,
}: CoachChatPanelProps) {
  const [composerText, setComposerText] = useState('')
  const [draftLocked, setDraftLocked] = useState(initialLockedContent ?? '')
  const scrollRef = useRef<HTMLDivElement>(null)

  const stream = useCoachStream({
    session_id,
    stage_number,
    hope_frame: hope_frame ?? null,
  })
  const lockStage = useLockStage()
  const regenerate = useRegenerateStage()

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
  }, [initialLockedContent, session_id, stage_number, hope_frame])

  async function handleSend() {
    const text = composerText.trim()
    if (!text || stream.isStreaming) return
    setComposerText('')
    await stream.send(text)
  }

  async function handleLock() {
    const content = draftLocked.trim()
    if (!content) {
      toast.error('Write what you want to lock for this stage first.')
      return
    }
    try {
      await lockStage.mutateAsync({
        session_id,
        stage_number,
        hope_frame,
        stage_name,
        locked_content: content,
      })
      toast.success(`Stage locked: ${stage_name}${hope_frame ? ` (${HOPE_FRAME_COACHING[hope_frame].name})` : ''}`)
      onLocked?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to lock stage')
    }
  }

  async function handleRegenerate() {
    if (!confirm('Regenerate this stage? This deletes the chat history and any locked content.')) return
    try {
      await regenerate.mutateAsync({ session_id, stage_number, hope_frame })
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
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MessageSquare className="h-4 w-4 text-slate-500" />
            Coach
            {hope_frame && (
              <span className="text-xs font-medium text-slate-500">
                · {HOPE_FRAME_COACHING[hope_frame].name}
              </span>
            )}
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
          <div className="flex items-center justify-between mt-2">
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
          {stream.error && (
            <div className="text-xs text-red-600 mt-2">{stream.error}</div>
          )}
        </div>

        <div className="px-4 py-3 border-t bg-white">
          <div className="text-xs font-semibold text-slate-700 mb-1">
            Locked content for this stage
          </div>
          <p className="text-[11px] text-slate-500 mb-2">
            When you and the coach are happy with the language, paste or type the final version here and lock the stage.
          </p>
          <Textarea
            value={draftLocked}
            onChange={(e) => setDraftLocked(e.target.value)}
            placeholder="Final language for this stage…"
            className="min-h-[100px] text-sm"
            disabled={alreadyLocked}
          />
          <div className="mt-2 flex items-center justify-between">
            {alreadyLocked ? (
              <div className="text-xs text-emerald-700 inline-flex items-center gap-1">
                <Lock className="h-3 w-3" /> Locked. Use Reset above to start over.
              </div>
            ) : (
              <div className="text-[11px] text-slate-500">
                {STAGE_COACHING[stage_number].closing_question}
              </div>
            )}
            <Button
              size="sm"
              onClick={handleLock}
              disabled={lockStage.isPending || !draftLocked.trim() || alreadyLocked}
            >
              {lockStage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              {alreadyLocked ? 'Locked' : 'Lock stage'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
