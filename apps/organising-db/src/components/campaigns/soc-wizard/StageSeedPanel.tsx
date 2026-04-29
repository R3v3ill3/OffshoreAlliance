'use client'

/**
 * Optional per-stage seed panel. When the SOC session has a frozen
 * situation_analysis snapshot, this panel surfaces structured items
 * derived from that snapshot as clickable cards. Clicking a card drops
 * a short prompt template into the chat composer or the locked-content
 * textarea — the user still iterates with the coach before locking, so
 * the "coach critiques what the user writes" shape is preserved.
 *
 * Consumed by SocWizardSteps for Stages 3 (Identify Issues), 4 (Agitate),
 * 5 (Hope, per-frame), and 7 (Inoculation).
 */

import { Sparkles, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'
import type { HopeFrame, SocStage } from '@/lib/prompts/soc-framework'
import type {
  CampaignSituationAnalysis,
  CompanyPlaybookMove,
  TopIssue,
} from '@/lib/situation-analysis/types'

export interface SeedItem {
  id: string
  label: string
  body: string
  meta?: string
}

interface Props {
  stage: SocStage
  hopeFrame?: HopeFrame
  /** Frozen situation analysis snapshot from the SOC session. Pass null to hide the panel. */
  situation: Pick<
    CampaignSituationAnalysis,
    | 'top_issues'
    | 'company_playbook'
    | 'union_history'
    | 'leverage_and_maths'
    | 'workforce_populations'
    | 'employer_state_notes'
  > | null
  /** Drop the body into the composer (or the locked textarea, depending on the consumer). */
  onSeed: (body: string) => void
}

export function StageSeedPanel({ stage, hopeFrame, situation, onSeed }: Props) {
  const [open, setOpen] = useState(false)
  const items = situation ? deriveStageSeeds(stage, hopeFrame, situation) : []
  if (!situation || items.length === 0) return null

  return (
    <div className="border rounded-md bg-amber-50/40 border-amber-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-medium text-amber-900 hover:bg-amber-100/50 rounded-md"
      >
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" />
          Seed from situation analysis
          <Badge variant="secondary" className="text-[10px]">
            {items.length}
          </Badge>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          <p className="text-[11px] text-amber-900/70 leading-relaxed">
            Click an item to drop a starter prompt into your composer. Edit it,
            iterate with the coach, then lock the stage.
          </p>
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => onSeed(it.body)}
              className="w-full text-left rounded-md border border-amber-200 bg-white px-3 py-2 hover:bg-amber-50 transition-colors"
            >
              <div className="text-xs font-medium text-slate-900">
                {it.label}
              </div>
              {it.meta && (
                <div className="text-[10px] text-slate-500 mt-0.5">{it.meta}</div>
              )}
              <div className="text-[11px] text-slate-700 mt-1 italic line-clamp-3">
                {it.body}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Map situation-analysis facts to per-stage seed items. Pure function;
 * exposed for testing.
 */
export function deriveStageSeeds(
  stage: SocStage,
  hopeFrame: HopeFrame | undefined,
  situation: Pick<
    CampaignSituationAnalysis,
    | 'top_issues'
    | 'company_playbook'
    | 'union_history'
    | 'leverage_and_maths'
    | 'workforce_populations'
    | 'employer_state_notes'
  >
): SeedItem[] {
  const issues: TopIssue[] = (situation.top_issues || [])
    .filter((i) => i.label && i.label.trim().length > 0)
    .sort((a, b) => (b.heat ?? 0) - (a.heat ?? 0))

  const playbook: CompanyPlaybookMove[] = (situation.company_playbook || []).filter(
    (m) => m.move && m.move.trim().length > 0
  )

  switch (stage) {
    case 3: {
      // Identify Issues — surface top issues by heat, framed as questions.
      return issues.slice(0, 6).map((issue, i) => ({
        id: `issue-${i}`,
        label: issue.label,
        meta: `heat ${issue.heat}/5${issue.notes ? ` · ${truncate(issue.notes, 80)}` : ''}`,
        body: `I want to ask about ${issue.label.toLowerCase()}. How am I going to open that without leading the worker?\n\nContext from the situation analysis: ${
          issue.notes || 'no additional notes'
        }.`,
      }))
    }
    case 4: {
      // Agitate — top-heat issues paired with structural agitation hooks.
      const personals = issues.slice(0, 4).map((issue, i) => ({
        id: `agitate-personal-${i}`,
        label: `Personal: ${issue.label}`,
        meta: `heat ${issue.heat}/5`,
        body: `Personal agitation on "${issue.label}". Who decided this would be acceptable? Who benefits while this worker is dealing with it? Reframe as a question that lets the worker feel the unfairness, not me telling them about it.`,
      }))
      const structurals: SeedItem[] = []
      if (situation.leverage_and_maths?.vote_arithmetic) {
        structurals.push({
          id: 'agitate-structural-vote',
          label: 'Structural: vote arithmetic',
          meta: 'leverage & maths',
          body: `Structural agitation on the vote: ${situation.leverage_and_maths.vote_arithmetic}. How do I make a worker feel that they're being USED for someone else's maths?`,
        })
      }
      if (situation.leverage_and_maths?.timing_constraints) {
        structurals.push({
          id: 'agitate-structural-timing',
          label: 'Structural: timing of the play',
          meta: 'leverage & maths',
          body: `Structural agitation on timing: ${situation.leverage_and_maths.timing_constraints}. Why now? Who chose this moment? What does that tell us about who is in control of this process?`,
        })
      }
      if (situation.employer_state_notes) {
        structurals.push({
          id: 'agitate-structural-state',
          label: 'Structural: employer state',
          meta: 'state of play',
          body: `Structural agitation on what the employer is doing right now: "${truncate(
            situation.employer_state_notes,
            240
          )}". How do I locate responsibility on a person/decision rather than letting it sound like the weather?`,
        })
      }
      return [...personals, ...structurals]
    }
    case 5: {
      // Hope — per-frame seeds.
      if (hopeFrame === 'opportunity') {
        const seeds: SeedItem[] = []
        const ballots = situation.union_history?.prior_ballot_outcomes ?? []
        if (ballots.length > 0) {
          const b = ballots[0]
          const pct =
            b.no_pct != null && b.yes_pct != null
              ? ` (${b.no_pct}% no / ${b.yes_pct}% yes)`
              : ''
          seeds.push({
            id: 'hope-opportunity-prior',
            label: `Prior ballot result${pct}`,
            meta: 'union history',
            body: `Frame the opportunity using the prior ballot result${pct}. The crew has already made the company eat one no vote — a second one finishes the job. How do I make the worker feel they are a big player, not a small one?`,
          })
        }
        if (situation.leverage_and_maths?.regulatory_window) {
          seeds.push({
            id: 'hope-opportunity-window',
            label: 'Regulatory leverage window',
            meta: 'leverage & maths',
            body: `Frame opportunity using the regulatory window: ${situation.leverage_and_maths.regulatory_window}. Most workers never get a moment this rare or this leveraged. How do I bring that home?`,
          })
        }
        if ((situation.workforce_populations || []).length > 0) {
          seeds.push({
            id: 'hope-opportunity-leverage',
            label: 'Population leverage',
            meta: 'workforce populations',
            body: `Frame opportunity for ${situation.workforce_populations[0].name}: ticking one box on a ballot moves rates for everyone like them, for years. How do I show that without it sounding rhetorical?`,
          })
        }
        return seeds
      }
      if (hopeFrame === 'plan') {
        const seeds: SeedItem[] = []
        if (situation.leverage_and_maths?.vote_arithmetic) {
          seeds.push({
            id: 'hope-plan-arithmetic',
            label: 'Vote arithmetic → plan',
            meta: 'leverage & maths',
            body: `Build the 5-step plan around the actual vote arithmetic: ${situation.leverage_and_maths.vote_arithmetic}. Plain English, no acronyms. The worker should be able to repeat it at smoko.`,
          })
        }
        if (situation.leverage_and_maths?.regulatory_window) {
          seeds.push({
            id: 'hope-plan-regulatory',
            label: 'Regulatory mechanism → plan',
            meta: 'leverage & maths',
            body: `Build a step into the plan around the regulatory mechanism: ${situation.leverage_and_maths.regulatory_window}. Translate any legal language into something a worker can repeat.`,
          })
        }
        if (situation.leverage_and_maths?.timing_constraints) {
          seeds.push({
            id: 'hope-plan-timing',
            label: 'Timing constraint → plan',
            meta: 'leverage & maths',
            body: `Build a step into the plan around timing: ${situation.leverage_and_maths.timing_constraints}. What happens if we vote no? What does the calendar do? Plain English.`,
          })
        }
        return seeds
      }
      if (hopeFrame === 'dont_take_lolly') {
        const lollies = playbook.filter((m) =>
          /(bonus|lolly|sweetener|sign[-\s]?on)/i.test(m.move)
        )
        return lollies.map((m, i) => ({
          id: `hope-lolly-${i}`,
          label: m.move,
          meta: m.disruption_point ? `breaks at: ${m.disruption_point}` : 'company playbook',
          body: `The company is offering "${m.move}". Why now? ${
            m.why ? `(${m.why})` : ''
          }. Acknowledge the worker is right to be tempted — then reframe the maths: one-off vs years of suppressed rates. ${
            m.disruption_point ? `Where this play breaks: ${m.disruption_point}.` : ''
          }`,
        }))
      }
      return []
    }
    case 7: {
      // Inoculation — one card per company playbook move.
      return playbook.slice(0, 8).map((m, i) => ({
        id: `inoc-${i}`,
        label: m.move,
        meta: m.why ? `why: ${truncate(m.why, 80)}` : 'company playbook',
        body: `Inoculate against this move: "${m.move}". Why the company will do it: ${m.why || '(unknown)'}. ${
          m.disruption_point
            ? `Where this play breaks: ${m.disruption_point}.`
            : ''
        }\n\nDon't just describe the move — get the worker to say out loud what they will say back when it lands.`,
      }))
    }
    default:
      return []
  }
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return t.slice(0, max - 1) + '…'
}
