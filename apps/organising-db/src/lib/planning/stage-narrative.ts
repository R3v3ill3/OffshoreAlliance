import type { StageNumber } from '@/types/planner-types'

/** One-line context shown next to the stage title on the stage plan page. */
export const STAGE_HEADER_BLURB: Record<StageNumber, string> = {
  1: 'Build an accurate picture of who you represent, where they work, and how the site is organised.',
  2: 'Start conversations, raise awareness of the campaign, and grow basic understanding of bargaining and rights.',
  3: 'Turn interest into participation—structures, leaders, and measurable engagement across the workforce.',
  4: 'Shape the agenda: claims development, membership strength, and readiness for formal bargaining steps.',
  5: 'Secure mandate, alignment, and timing so the team enters bargaining with authority and clarity.',
  6: 'Execute at the table and beyond—keeping pressure, discipline, and member voice central until you win.',
}

/** Longer generic guidance for the per-stage info dialog (1–3 paragraphs each). */
export const STAGE_INFO_BODY: Record<StageNumber, string[]> = {
  1: [
    'This phase is about getting the facts straight before you scale activity. Reliable contact data, role clarity, and a sensible map of worksites and crews reduce wasted effort later and help you prioritise where organisers spend time.',
    'Use Playing to Win in this stage to set ambitions that are specific and measurable—what “good” looks like for identification coverage, mapping accuracy, or leadership visibility. That makes the next gates honest rather than aspirational.',
    'You do not need perfection; you need a baseline you can improve. Document assumptions, note gaps, and treat this stage as the foundation for every comms and mobilisation plan that follows.',
  ],
  2: [
    'Early communication frames the campaign: why bargaining matters, what members can expect, and how they can get involved. The goal is informed curiosity—not full agreement on every detail.',
    'Ambitions here often relate to reach, comprehension, or participation in education activities. Pair those with “where to play” choices so messaging matches the audiences and channels that actually exist on site.',
    'Keep feedback loops open. What members misunderstand now will surface again at claims or endorsement unless you adjust tone, language, and messengers while the campaign is still forming.',
  ],
  3: [
    'Mobilisation is where latent support becomes visible structures: delegates, committees, chats, meetings, and actions that prove the workforce is paying attention.',
    'Your ambitions should stress depth as well as breadth—quality of engagement, not only headcounts. Hard and soft gates help the team decide when moving forward is responsible versus premature.',
    'Capacities matter here as much as slogans. If you need more organisers, translators, or comms capacity, name it now so Stage 4 is not fought on an empty tank.',
  ],
  4: [
    'This stage connects grassroots energy to a serious bargaining program: developing or refining claims, strengthening membership where it counts, and sequencing MSD or equivalent milestones if your rules require them.',
    'Be explicit about trade-offs in the theory of winning—what you are trying to maximise, what you might concede, and what is non-negotiable for members. Ambitions should line up with those choices.',
    'Treat claims development as a campaign activity, not a paperwork step. Participation levels and clarity of demand directly affect leverage when you move to endorsement and formal processes.',
  ],
  5: [
    'Endorsement is the bridge between informal support and a formal mandate to bargain. Ambitions often cover ballot thresholds, meeting quorums, or documented approvals depending on your context.',
    'Alignment across sites, roles, and unions (where relevant) prevents last-minute fractures. Management systems—meeting rhythm, decision records, escalation paths—are as important as the comms narrative.',
    'Use this stage to rehearse the story members will tell themselves entering bargaining: what winning means, what risks exist, and how they will know the team is listening.',
  ],
  6: [
    'Bargaining is where strategy meets endurance: proposals, responses, industrial pressure, and member communication in real time. Plans made earlier should now translate into disciplined execution.',
    'Ambitions in this phase may include strike readiness, interim wins, or engagement metrics that show the workforce still backs the team. Refresh theory of winning as facts change—stale stories erode trust.',
    'Celebrate progress visibly, protect leaders from burnout, and keep gates honest. The objective is a durable outcome members recognise as theirs, not a quiet settlement that unravels on the first shift.',
  ],
}

export function isStageNumber(n: number): n is StageNumber {
  return n >= 1 && n <= 6
}

export function stageHeaderBlurb(stageNumber: number): string | undefined {
  if (!isStageNumber(stageNumber)) return undefined
  return STAGE_HEADER_BLURB[stageNumber]
}

export function stageInfoBody(stageNumber: number): string[] | undefined {
  if (!isStageNumber(stageNumber)) return undefined
  return STAGE_INFO_BODY[stageNumber]
}

export type StepId = 'ambitions' | 'where-to-play' | 'theory' | 'capacities' | 'management'

export const STEP_NAMES: Record<StepId, string> = {
  'ambitions': 'Ambitions',
  'where-to-play': 'Where to Play',
  'theory': 'Theory of Winning',
  'capacities': 'Capacities',
  'management': 'Management Systems',
}

export const STEP_HEADER_BLURB: Record<StepId, string> = {
  'ambitions': 'Define what success looks like and the metrics that will prove you have achieved it.',
  'where-to-play': 'Choose which sites, employers, and groups of workers to focus your resources on.',
  'theory': 'Develop the logical sequence of events that leads to victory based on your leverage.',
  'capacities': 'Identify the skills, structures, and resources needed to execute your theory of winning.',
  'management': 'Establish the systems, meetings, and reviews that keep the campaign on track.',
}

export const STEP_INFO_BODY: Record<StepId, string[]> = {
  'ambitions': [
    'Ambitions define the measurable outcomes you need to achieve by the end of this stage.',
    'Focus on clear targets: numbers, percentages, or specific completed actions. Every ambition should help answer the question, "How will we know we are ready for the next stage?"',
    'Set whether each ambition is a "Hard Gate" (must be completed to proceed) or "Soft Gate" (desirable, but not strictly required if other factors compensate).'
  ],
  'where-to-play': [
    'Where to Play focuses your limited resources on the areas that matter most for this stage.',
    'You cannot be everywhere at once. Decide which employers, worksites, and workgroups are critical for your current objectives.',
    'In early stages, this might mean mapping specific sites. In later stages, it could mean focusing on sites with the highest density or strategic leverage.'
  ],
  'theory': [
    'Your Theory of Winning connects your current position to your ambitions through a logical sequence of cause and effect.',
    'It takes the form of an "If we do X, then Y will happen, resulting in Z" statement.',
    'This is the core hypothesis of your campaign. If it is flawed or relying on assumptions you cannot prove, your ambitions will be at risk.'
  ],
  'capacities': [
    'Capacities are the capabilities, structures, and resources you need to make your Theory of Winning work.',
    'These could be physical resources (like flyers or data access), skills (like trained delegates), or structures (like a functioning committee).',
    'Identifying required capacities early helps you spot gaps before they cause your strategy to fail.'
  ],
  'management': [
    'Management Systems are the routines, meetings, and tracking methods that keep the campaign disciplined and on schedule.',
    'A strategy is useless without execution. Decide how often the team will meet, what data you will review, and who is accountable for moving the work forward.',
    'Effective management systems ensure that when assumptions in your Theory of Winning turn out to be wrong, you notice quickly and adapt.'
  ]
}

export function stepHeaderBlurb(stepId: StepId): string | undefined {
  return STEP_HEADER_BLURB[stepId]
}

export function stepInfoBody(stepId: StepId): string[] | undefined {
  return STEP_INFO_BODY[stepId]
}
