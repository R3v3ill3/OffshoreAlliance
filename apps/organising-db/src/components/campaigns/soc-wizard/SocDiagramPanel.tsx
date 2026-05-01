'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { SocStage } from '@/lib/prompts/soc-framework'

interface SocDiagramPanelProps {
  activeStage: SocStage | null
}

type ColorKey = 'teal' | 'amber' | 'coral' | 'purple'

interface StageConfig {
  stage: number
  name: string
  subtitle: string
  color: ColorKey
  goal: string
  points: string[]
  pitfall: string
}

interface ColorStyles {
  bar: string
  barActive: string
  info: string
  goalText: string
  dot: string
}

const COLOR_STYLES: Record<ColorKey, ColorStyles> = {
  teal: {
    bar: 'bg-[#E1F5EE] border-[#1D9E75] text-[#085041]',
    barActive: 'border-2 border-[#1D9E75] shadow-[0_0_0_2px_#1D9E7540] scale-[1.01]',
    info: 'bg-[#E1F5EE] border border-[#1D9E75]',
    goalText: 'text-[#085041]',
    dot: 'bg-[#5DCAA5]',
  },
  amber: {
    bar: 'bg-[#FAEEDA] border-[#BA7517] text-[#633806]',
    barActive: 'border-2 border-[#BA7517] shadow-[0_0_0_2px_#BA751740] scale-[1.01]',
    info: 'bg-[#FAEEDA] border border-[#BA7517]',
    goalText: 'text-[#633806]',
    dot: 'bg-[#EF9F27]',
  },
  coral: {
    bar: 'bg-[#FAECE7] border-[#993C1D] text-[#4A1B0C]',
    barActive: 'border-2 border-[#993C1D] shadow-[0_0_0_2px_#993C1D40] scale-[1.01]',
    info: 'bg-[#FAECE7] border border-[#993C1D]',
    goalText: 'text-[#4A1B0C]',
    dot: 'bg-[#D85A30]',
  },
  purple: {
    bar: 'bg-[#EEEDFE] border-[#534AB7] text-[#26215C]',
    barActive: 'border-2 border-[#534AB7] shadow-[0_0_0_2px_#534AB740] scale-[1.01]',
    info: 'bg-[#EEEDFE] border border-[#534AB7]',
    goalText: 'text-[#26215C]',
    dot: 'bg-[#7F77DD]',
  },
}

const SOC_STAGES: StageConfig[] = [
  {
    stage: 1,
    name: 'Introduction',
    subtitle: 'name, purpose, set the terms',
    color: 'teal',
    goal: "Worker relaxes and knows what this is. They don't feel ambushed.",
    points: [
      'State name, role, union, and topic upfront.',
      'Explicitly de-rate: "I\'m not here to sign you up today — just a conversation."',
      'Drop a legitimacy signal early — a name in common, a recent site win, who invited you.',
      'Set time expectations: "About 10 minutes."',
      'Get the physical environment right — no desks between you.',
    ],
    pitfall: "Don't launch into issues or union pitch here — you haven't earned it yet.",
  },
  {
    stage: 2,
    name: 'Build Rapport',
    subtitle: 'ask questions, map the worksite',
    color: 'teal',
    goal: 'Gather context, place the worker in a population, find common ground.',
    points: [
      'Ask history — how long on-site, prior stints, where they were before.',
      'Ask about crew — who they work alongside, who they trust.',
      "Ask what the recruiter told them — reveals their framing.",
      'Everything they say is intel: names, relationships, frustrations.',
      'Classify which population they belong to — this shapes everything after.',
    ],
    pitfall: "Don't be so focused on classification that you stop listening to them as a person.",
  },
  {
    stage: 3,
    name: 'Identify Issues',
    subtitle: 'surface issues, find the heat',
    color: 'amber',
    goal: 'Find the grievance or concern with the most fuel behind it.',
    points: [
      'Surface several issues before locking onto one.',
      'Signs of heat: faster speech, profanity, specific incident details, body leaning in.',
      'Different populations surface different issues — permanents → long-term conditions; experienced shutdowns → sector rates; green hats → immediate on-site concerns.',
      'Keep probing gently until you hit something personal and specific.',
    ],
    pitfall: "Don't lock onto the first issue they raise — it may not be the one with heat.",
  },
  {
    stage: 4,
    name: 'Agitate',
    subtitle: 'make the injustice felt',
    color: 'amber',
    goal: 'Convert frustration into productive anger. Apathy is the enemy.',
    points: [
      'Two layers — personal agitation (their specific situation, this week) and structural agitation (who decided, who benefits, who can change it).',
      'Personal: "How does that actually affect you — your pay, your life at home?"',
      'Structural: "Someone wrote that policy. It didn\'t just happen."',
      "Don't perform anger yourself — let them find theirs.",
      "Don't agitate into hopelessness — always move to Hope.",
    ],
    pitfall: "Agitating on an issue they don't actually care about creates noise, not fuel.",
  },
  {
    stage: 5,
    name: 'Hope',
    subtitle: 'show change is possible',
    color: 'coral',
    goal: "Show change is possible and the worker's action is decisive.",
    points: [
      'Three frames in sequence — each builds on the last.',
      'Opportunity: rare lever, 4-year benchmark, their vote is decisive — they are a big player wearing a green hat.',
      'The Plan: vote no → existing agreement expires → protected action available → real offer follows. Five plain-language steps they can repeat at smoko.',
      "Don't Take the Lolly: the bonus appeared because the straight offer already failed. It's bait designed to look large to someone here a few weeks. The dentist bill is the next four years.",
    ],
    pitfall: "If The Plan sounds like a lawyer wrote it, the worker tunes out — strip it back.",
  },
  {
    stage: 6,
    name: 'Action',
    subtitle: 'specific ask, then wait',
    color: 'coral',
    goal: 'A pinned-down commitment, not a soft yes.',
    points: [
      "Proportion the ask — low: 'vote no when the ballot lands'; medium: 'sign up on my phone tonight'; high: 'same yarn with your four crew this week'.",
      "Ask once, clearly, then wait — don't fill the silence.",
      '"Yeah alright" is not a commitment. Pin it down with a specific action and date.',
      'Use EAR (Explore, Acknowledge, Redirect) if they stall or object, then try a smaller ask.',
    ],
    pitfall: "Don't soften the ask to avoid discomfort — vagueness is a vote you won't get.",
  },
  {
    stage: 7,
    name: 'Inoculation',
    subtitle: "pre-empt the company's playbook",
    color: 'purple',
    goal: "Pre-empt the company's playbook. Rehearsing the response builds the muscle.",
    points: [
      'Cover the key moves: captive-audience meeting, bonus pitch, supervisor\'s quiet word, divide-and-conquer, "this is our final offer", risk framing.',
      'For each move: "When you hear that, what\'s your answer going to be?"',
      'Saying it out loud — not just nodding — is what makes it stick.',
      'A strong yes in Stage 6 makes inoculation more important — the worker is now visible to the company.',
      "On risk framing: votes are secret; adverse action for protected activity is unlawful; we back you up.",
    ],
    pitfall: "Don't just describe the company's tactics — make them rehearse the response. Description without rehearsal doesn't inoculate.",
  },
  {
    stage: 8,
    name: 'Close',
    subtitle: 'confirm, lock in next contact',
    color: 'purple',
    goal: 'A clean, positive close that reinforces the commitment and sets up follow-through.',
    points: [
      'Confirm in their words: "So to confirm — you\'re voting no when the ballot drops, and you\'ll yarn with [names] this week?"',
      'Lock in next contact with a specific date and channel: "I\'ll catch you at smoko Thursday — 10am?"',
      'The final beat is affirmation, not warning — inoculation goes before the close.',
      'Leave them with something they can carry: "You\'re making a real difference here."',
    ],
    pitfall: 'Leaving on a negative note undermines the commitment. Find a positive close regardless of how the conversation went.',
  },
]

const LEGEND = [
  { color: 'teal' as ColorKey, label: 'Listening / safety (1–2)' },
  { color: 'amber' as ColorKey, label: 'Surfacing / heating (3–4)' },
  { color: 'coral' as ColorKey, label: 'Challenge / commitment (5–6)' },
  { color: 'purple' as ColorKey, label: 'Protection / close (7–8)' },
]

export function SocDiagramPanel({ activeStage }: SocDiagramPanelProps) {
  const [openStage, setOpenStage] = useState<number | null>(activeStage)

  useEffect(() => {
    setOpenStage(activeStage)
  }, [activeStage])

  return (
    <div className="sticky top-0 max-h-screen overflow-y-auto pb-4">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-400 px-1 pb-2">
        SOC Framework
      </div>

      <div className="space-y-1">
        {SOC_STAGES.map((s) => {
          const styles = COLOR_STYLES[s.color]
          const isActive = activeStage === s.stage
          const isOpen = openStage === s.stage

          return (
            <div key={s.stage}>
              <button
                onClick={() => setOpenStage(isOpen ? null : s.stage)}
                className={cn(
                  'w-full text-left px-2.5 py-2 rounded border transition-all duration-150',
                  styles.bar,
                  isActive ? styles.barActive : 'opacity-75 hover:opacity-100',
                )}
              >
                <div className={cn('text-[11px] leading-tight', isActive ? 'font-semibold' : 'font-medium')}>
                  {s.stage}. {s.name}
                </div>
                <div className="text-[10px] opacity-60 leading-tight mt-0.5">
                  {s.subtitle}
                </div>
              </button>

              {isOpen && (
                <div className={cn('mt-0.5 rounded px-2.5 py-2 space-y-2', styles.info)}>
                  <div className={cn('text-[11px] font-semibold leading-snug', styles.goalText)}>
                    Goal: {s.goal}
                  </div>
                  <ul className="space-y-1.5">
                    {s.points.map((pt, i) => (
                      <li key={i} className="text-[10px] text-slate-700 leading-relaxed flex gap-1.5">
                        <span className="mt-0.5 shrink-0 opacity-40">·</span>
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="text-[10px] text-slate-500 italic border-t border-slate-200 pt-1.5">
                    <span className="not-italic font-medium text-slate-600">Pitfall: </span>
                    {s.pitfall}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-200 space-y-1 px-1">
        {LEGEND.map((l) => (
          <div key={l.color} className="flex items-center gap-1.5">
            <div className={cn('w-2.5 h-2.5 rounded-sm flex-shrink-0', COLOR_STYLES[l.color].dot)} />
            <span className="text-[10px] text-slate-500">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
