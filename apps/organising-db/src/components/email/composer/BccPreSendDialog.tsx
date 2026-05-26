'use client'

/**
 * BccPreSendDialog — pre-send confirmation when the user dispatches a
 * shared BCC draft (via Outlook OAuth or via mailto/.eml).
 *
 * Classifies each merge token in the body as resolvable / varying / missing,
 * surfaces resolved values for auto-resolvable ones, and prompts the user
 * to pick a substitution for the rest. The "Apply and continue" button
 * hands a transformed (subject, body) string back to the caller, who then
 * dispatches via the original BCC path with body/subject overrides.
 */

import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, MinusCircle } from 'lucide-react'
import {
  analyzeBodyTokens,
  applyTokenDecisions,
  defaultDecision,
  type AnalysedRecipient,
  type TokenAnalysis,
  type TokenDecision,
} from '@/lib/comms/bcc-token-analysis'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  subject: string
  bodyHtml: string
  bodyText: string
  recipients: AnalysedRecipient[]
  campaignContext: Record<string, string | undefined>
  /** Called when user clicks "Apply and continue". */
  onApply: (input: {
    subjectOverride: string
    bodyHtmlOverride: string
    bodyTextOverride: string
  }) => void
  /** Label of the action that opened the dialog — used in the title. */
  actionLabel?: string
}

export function BccPreSendDialog({
  open,
  onOpenChange,
  subject,
  bodyHtml,
  bodyText,
  recipients,
  campaignContext,
  onApply,
  actionLabel = 'shared BCC draft',
}: Props) {
  // Analyse the combined surface (subject + body) so subject-tokens are
  // surfaced in the same dialog instead of silently surviving into the draft.
  const combined = `${subject}\n\n${bodyHtml || bodyText}`

  const analyses = useMemo(
    () => analyzeBodyTokens(combined, recipients, campaignContext),
    [combined, recipients, campaignContext],
  )

  // React's recommended pattern for "reset derived state when a prop key
  // changes": compare the previous key to the current one inside the
  // render body, and reset state synchronously when they differ.
  // Triggered by the dialog (re-)opening with a new token set.
  const tokenKey = useMemo(
    () => `${open ? '1' : '0'}|${analyses.map((a) => a.token).join('|')}`,
    [open, analyses],
  )
  const [decisions, setDecisions] = useState<Record<string, TokenDecision>>({})
  const [previousTokenKey, setPreviousTokenKey] = useState<string | null>(null)
  if (tokenKey !== previousTokenKey) {
    setPreviousTokenKey(tokenKey)
    const seed: Record<string, TokenDecision> = {}
    for (const a of analyses) seed[a.token] = defaultDecision(a)
    setDecisions(seed)
  }
  const [autoSectionOpen, setAutoSectionOpen] = useState(false)

  const resolvable = analyses.filter((a) => a.kind === 'resolvable')
  const varying = analyses.filter((a) => a.kind === 'varying')
  const missing = analyses.filter((a) => a.kind === 'missing')

  function setDecision(token: string, decision: TokenDecision) {
    setDecisions((prev) => ({ ...prev, [token]: decision }))
  }

  function handleApply() {
    const subjectOverride = applyTokenDecisions(subject, analyses, decisions)
    const bodyHtmlOverride = applyTokenDecisions(bodyHtml, analyses, decisions)
    const bodyTextOverride = applyTokenDecisions(bodyText, analyses, decisions)
    onApply({ subjectOverride, bodyHtmlOverride, bodyTextOverride })
  }

  // If there are no tokens at all, render a slim confirmation only.
  const totalTokens = analyses.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            Review variables before {actionLabel}
          </DialogTitle>
          <DialogDescription className="text-xs">
            BCC sends one shared email body to all {recipients.length} recipients.
            We&apos;ll auto-resolve any variables that have a single value across the
            list. For variables that differ per recipient, choose how to handle them.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          {totalTokens === 0 && (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No merge variables found in this draft — ready to send.
            </div>
          )}

          {resolvable.length > 0 && (
            <section className="space-y-2">
              <button
                type="button"
                onClick={() => setAutoSectionOpen((v) => !v)}
                className="w-full flex items-center gap-2 text-xs font-medium text-green-700 hover:text-green-800"
              >
                {autoSectionOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                <CheckCircle2 className="h-3.5 w-3.5" />
                Auto-resolved ({resolvable.length})
              </button>
              {autoSectionOpen && (
                <ul className="space-y-1.5 pl-6">
                  {resolvable.map((a) => (
                    <li
                      key={a.token}
                      className="text-xs flex items-center gap-2"
                    >
                      <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">
                        {`{{${a.token}}}`}
                      </code>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">{a.resolvedValue}</span>
                      {a.occurrences > 1 && (
                        <Badge variant="outline" className="text-[9px] py-0">
                          ×{a.occurrences}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {varying.length > 0 && (
            <section className="space-y-3">
              <div className="text-xs font-medium text-amber-700 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                Variables that vary across recipients ({varying.length})
              </div>
              <p className="text-[11px] text-muted-foreground -mt-2">
                These can&apos;t be personalised when one body goes to everyone.
                Pick a substitution per token below.
              </p>
              {varying.map((a) => (
                <TokenRow
                  key={a.token}
                  analysis={a}
                  decision={decisions[a.token] ?? defaultDecision(a)}
                  onChange={(d) => setDecision(a.token, d)}
                />
              ))}
            </section>
          )}

          {missing.length > 0 && (
            <section className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <MinusCircle className="h-3.5 w-3.5" />
                Variables with no value ({missing.length})
              </div>
              <p className="text-[11px] text-muted-foreground -mt-2">
                These have no data in the campaign or selected recipients.
                We&apos;ll remove them by default; switch to keep them literal
                or replace with custom text.
              </p>
              {missing.map((a) => (
                <TokenRow
                  key={a.token}
                  analysis={a}
                  decision={decisions[a.token] ?? defaultDecision(a)}
                  onChange={(d) => setDecision(a.token, d)}
                />
              ))}
            </section>
          )}
        </div>

        <DialogFooter className="border-t pt-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleApply}>
            Apply and continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface TokenRowProps {
  analysis: TokenAnalysis
  decision: TokenDecision
  onChange: (d: TokenDecision) => void
}

function TokenRow({ analysis, decision, onChange }: TokenRowProps) {
  const customValue =
    decision.kind === 'custom' ? decision.value : ''
  const collectiveValue =
    decision.kind === 'collective'
      ? decision.value ?? analysis.suggestedCollective ?? ''
      : analysis.suggestedCollective ?? ''

  const distinctPreview =
    analysis.distinctValues.length > 0
      ? analysis.distinctValues.slice(0, 5).join(', ') +
        (analysis.distinctValues.length > 5
          ? ` +${analysis.distinctValues.length - 5} more`
          : '')
      : 'none'

  return (
    <div className="rounded-md border p-3 space-y-2 bg-muted/20">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <code className="bg-background border px-1.5 py-0.5 rounded text-[11px] font-mono">
            {`{{${analysis.token}}}`}
          </code>
          <span className="text-xs text-muted-foreground">{analysis.label}</span>
          {analysis.occurrences > 1 && (
            <Badge variant="outline" className="text-[9px] py-0">
              appears ×{analysis.occurrences}
            </Badge>
          )}
        </div>
      </div>
      {analysis.kind === 'varying' && (
        <p className="text-[10px] text-muted-foreground">
          Across recipients: {distinctPreview}
        </p>
      )}

      <RadioGroup
        value={decision.kind}
        onValueChange={(kind) => {
          if (kind === 'collective') {
            onChange({ kind: 'collective', value: collectiveValue })
          } else if (kind === 'custom') {
            onChange({ kind: 'custom', value: customValue })
          } else if (kind === 'remove') {
            onChange({ kind: 'remove' })
          } else if (kind === 'keep') {
            onChange({ kind: 'keep' })
          } else if (kind === 'auto') {
            onChange({ kind: 'auto' })
          }
        }}
        className="space-y-1"
      >
        {analysis.suggestedCollective && (
          <Label className="flex items-start gap-2 cursor-pointer py-0.5">
            <RadioGroupItem value="collective" className="mt-0.5" />
            <span className="text-xs">
              Replace with{' '}
              <Input
                value={collectiveValue}
                onChange={(e) =>
                  onChange({ kind: 'collective', value: e.target.value })
                }
                onFocus={() =>
                  decision.kind !== 'collective' &&
                  onChange({ kind: 'collective', value: collectiveValue })
                }
                className="inline-block h-6 px-1.5 text-xs w-32 align-middle"
                placeholder={analysis.suggestedCollective}
              />{' '}
              <span className="text-muted-foreground">(collective phrase)</span>
            </span>
          </Label>
        )}
        <Label className="flex items-start gap-2 cursor-pointer py-0.5">
          <RadioGroupItem value="custom" className="mt-0.5" />
          <span className="text-xs">
            Custom text:{' '}
            <Input
              value={customValue}
              onChange={(e) => onChange({ kind: 'custom', value: e.target.value })}
              onFocus={() =>
                decision.kind !== 'custom' &&
                onChange({ kind: 'custom', value: customValue })
              }
              className="inline-block h-6 px-1.5 text-xs w-40 align-middle"
              placeholder="Type a replacement…"
            />
          </span>
        </Label>
        <Label className="flex items-center gap-2 cursor-pointer py-0.5">
          <RadioGroupItem value="remove" />
          <span className="text-xs">Remove the variable</span>
        </Label>
        <Label className="flex items-center gap-2 cursor-pointer py-0.5">
          <RadioGroupItem value="keep" />
          <span className="text-xs text-muted-foreground">
            Keep literal (recipients see <code>{`{{${analysis.token}}}`}</code>)
          </span>
        </Label>
      </RadioGroup>
    </div>
  )
}
