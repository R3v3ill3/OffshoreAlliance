import type { StepId } from '@/lib/planning/stage-narrative'
import type { Phase2StageNumber } from '@/types/planner-types'

// ---------------------------------------------------------------------------
// PHASE 2 PRINCIPLES PREAMBLE
// ---------------------------------------------------------------------------

export const PHASE2_PRINCIPLES_PREAMBLE: string[] = [
  'Full transparency: workers deserve to know the full state of play, not a managed narrative. Share the employer\'s counter-offers, the time-lines, the legal constraints, and the risks—unfiltered. When organisers curate information to protect morale, members cannot make informed decisions and trust erodes the moment reality diverges from the story they were told.',
  'Shared responsibility: the outcome of bargaining is determined by workers\' collective choices, not organisers\' heroics. The organiser\'s job is to create the conditions—information, structures, confidence—in which workers choose to act. Campaigns that rely on a small group of leaders to "carry" the result are fragile; campaigns where workers own the outcome are durable.',
  '"Strong" means strike-ready, not just card-signed: a strong campaign is one where workers have demonstrated willingness to take the specific industrial actions listed in the seed pack—not one where members have signed cards, attended meetings, or verbally expressed support. Enthusiasm is not leverage; demonstrated willingness to act is.',
  'Be alert to the nine-month intractable bargaining trap: under s235 of the Fair Work Act, either party may apply to the Fair Work Commission for an intractable bargaining declaration if bargaining has been on foot for nine months or more and genuine attempts to reach agreement have failed. If the Commission makes that declaration it may arbitrate the agreement—removing the union\'s ability to win at the table. Organisers should set an internal alarm at six months and treat the nine-month mark as a hard strategic deadline.',
]

// ---------------------------------------------------------------------------
// STAGE HEADER BLURBS  (one line per stage)
// ---------------------------------------------------------------------------

/** One-line context shown next to the stage title on the bargaining stage plan page. */
export const BARGAINING_STAGE_HEADER_BLURB: Record<Phase2StageNumber, string> = {
  7: 'Open the formal bargaining process: the employer issues the NERR, bargaining representatives are confirmed, and the intractable bargaining clock starts.',
  8: 'Exchange initial proposals, read the employer\'s posture, and deepen organising through structured floor activity and comms discipline.',
  9: 'Take a formal strike-readiness snapshot against the seven criteria and decide: escalate to industrial action or loop back to capacity-building.',
  10: 'File the PABO, win the ballot, and execute a disciplined escalating industrial-action ladder to move the employer.',
  11: 'Reach in-principle agreement, run the employee ratification vote, secure FWC approval, and transition the campaign into post-settlement mode.',
}

// ---------------------------------------------------------------------------
// STAGE INFO BODIES  (3–4 paragraphs per stage)
// ---------------------------------------------------------------------------

/** Longer guidance for the per-stage info dialog (3–4 paragraphs each). */
export const BARGAINING_STAGE_INFO_BODY: Record<Phase2StageNumber, string[]> = {
  7: [
    'Bargaining Commences once the employer issues the Notice of Employee Representational Rights (NERR) under s173 of the Fair Work Act, and the bargaining agent has been notified under s176. The date of that first formal meeting marks the commencement of bargaining—this is the legal reference point from which the nine-month s235 intractable bargaining clock begins. Record this date precisely and flag it in all planning documents.',
    'Carry forward the situation analysis developed in Stage 6 of Phase 1. The organising map, delegate structure, membership density data, and identified leverage points are the foundation on which the Phase 2 plan is built. Do not treat the transition to formal bargaining as a reset—continuity of analysis is a strategic asset, not administrative tidiness.',
    'Scope the first claim package in collaboration with delegates and the broader claims committee. Delegates should be formally appointed as bargaining representatives where possible, giving them standing at the table and legal protection for their bargaining activity. Establish the comms cadence for swing-roster workforces at this stage: information that needs to reach workers on rotating shifts must travel on rotation change days, not on fixed weekly cycles that miss entire crews.',
    'Key FWA references for this stage: s174 (NERR notification obligations), s176 (bargaining representatives—who qualifies, how they are notified, and their rights), and s181 (employee approval requirements for enterprise agreements, which sets the frame for the ratification stage ahead).',
  ],
  8: [
    'Testing the Employer is the stage of first contact and pattern recognition. Initial counter-offers reveal the employer\'s posture, risk appetite, and tactical preferences. Map every response against the three-scenario playbook: "Good Offer" (employer moves meaningfully and quickly), "Drags On" (employer uses procedure and delay as strategy), or "Employer Launches" (employer applies for an employer-initiated ballot under s437, believing it has a majority for a specific proposal). Identifying which scenario is emerging early allows the team to shift resources and messaging before the campaign is behind the curve.',
    'Do not let the formality of the table slow floor organising. Bargaining is won by building power simultaneously at and away from the table. Deepen the organising work carried forward from Phase 1: convert passive members into active participants, extend delegate coverage into under-organised crews, and maintain the structured engagement ambitions from the previous stage. In offshore and FIFO contexts, this means maintaining strict comms discipline across rotation groups—crews on different swing rosters receive different messages at different times, and inconsistency breeds rumour and anxiety.',
    'If the employer launches an s437 ballot, the campaign faces a choice point. A "Yes" vote by workers effectively resolves bargaining under the "Good Offer" scenario—treat it as a win-if-it-is-one and transition to Stage 11 ratification processes. A "No" vote confirms that workers reject the employer\'s proposal and restores momentum to the union\'s campaign; loop immediately back to capacity-building and deepen the analysis of what further pressure is needed before the next escalation. The organiser\'s job in a "No" ballot is to make the question clear: workers are not voting for or against the union, they are voting on a specific proposal.',
    'Key FWA references: s437 (employer-initiated ballot application—conditions, notice, FWC oversight) and s181 (employee approval requirements—the same test that will apply to any eventual agreement reached at the table).',
  ],
  9: [
    'Strength Assessment and Decision is a formal gate, not a morale check. A trained organiser or lead organiser takes a structured snapshot against seven criteria—typically covering density of active members, delegate readiness, comms reach across all rotation groups, willingness to take specific listed actions, presence of workplace structures (committees, chats, toolbox delegates), absence of fear or employer intimidation, and clarity of the ask. The assessment must be conducted on the basis of evidence, not optimism. The purpose is auditability: if a later decision to escalate is challenged, the assessment record demonstrates the basis on which that decision was made.',
    '"Strong" is a specific threshold, not a political declaration. A campaign is strong when workers have demonstrated—through actions already taken, not through promises or card-signs—that they are willing to take the particular industrial steps in the seed pack. A strong rating routes the campaign to Stage 10 (PABO filing and industrial escalation). A weak rating routes the campaign back to Stage 8 for another capacity-building round. A return to Stage 8 is not a failure; it is the system working. Premature escalation that collapses is the failure.',
    'Offshore and facility-specific factors weigh heavily in this assessment. Workers on offshore facilities face AMSA reporting obligations for any work stoppages that affect vessel or platform safety. NOPSEMA notification requirements apply to industrial action that touches safety-critical systems on offshore petroleum facilities. These legal and regulatory constraints must be factored into the assessment of what actions workers can realistically and legally take before a PABO is even filed.',
    'Stage 10 is a hard gate: it becomes accessible only after a "strong" assessment has been formally recorded. This is not a bureaucratic formality—it protects workers and the campaign from escalation that the workforce is not ready to sustain, and it protects the union from making industrial commitments it cannot back. Under s443 of the Fair Work Act, a PABO application requires that the industrial action is genuinely being sought by workers who are covered by the agreement; an honest strength assessment is the evidentiary foundation for that claim.',
  ],
  10: [
    'Protected Industrial Action begins with a PABO application under s443 of the Fair Work Act, heard by the Fair Work Commission. If the Commission is satisfied that the prerequisites under s413 have been met—that the parties are genuinely trying to reach an agreement, that good-faith bargaining obligations are being observed, and that the action will be authorised by a protected action ballot—the Commission orders a ballot. The ballot is administered by the Australian Electoral Commission (AEC). A PABO is valid for 30 days from the date of the declaration (s459); if industrial action is not commenced within that window the union must apply again.',
    'The notice period for protected industrial action on offshore facilities is three working days under s414 of the Fair Work Act. Check the current enterprise agreement (or any applicable order) for enterprise-specific notice requirements—some CBAs have negotiated different notice periods. Execute industrial action on a disciplined escalating ladder: work bans and overtime bans first (lowest disruption, tests employer resolve), then four-hour stoppages, then swing stoppages (which remove entire rotation crews from a facility), then 24-hour, 48-hour, and if necessary indefinite strike action. Each step on the ladder must be preceded by a new notice. After each action, assess participation rates honestly—if participation falls short of what was claimed in the strength assessment, do not escalate further until a new capacity-building round has been completed.',
    'The intractable bargaining risk becomes acute in this stage. If bargaining has been on foot for nine months or more and the employer applies for an s235 declaration, the Fair Work Commission may find that the bargaining is intractable and move to arbitration. Arbitration removes the union\'s ability to negotiate a voluntary outcome; the Commission determines the agreement. Alert organisers when bargaining reaches six months, and treat every week after month seven as operating under heightened legal risk. FWC assistance under s240A (application for FWC to deal with a bargaining dispute) may be used as a pre-emptive tool to demonstrate good faith and slow an intractable bargaining application.',
    'Key FWA references: s443 (PABO application), s413 (prerequisites for protected industrial action), s414 (notice period—three working days for offshore), s459 (PABO validity—30 days from declaration), s235 (intractable bargaining declaration), s240A (FWC assistance with bargaining disputes). All industrial action on offshore petroleum facilities must be notified to AMSA and, where safety-critical systems are involved, to NOPSEMA before the action commences.',
  ],
  11: [
    'Settlement and Ratification is the culmination of the bargaining campaign. An in-principle agreement is reached when both parties agree on all terms at the table. Before the employee vote is held, the draft agreement must be circulated to all employees who will be covered, with a reasonable explanation of its terms and a reasonable opportunity to seek representation. This is an obligation under s180 of the Fair Work Act, and failure to comply is grounds for the Fair Work Commission to refuse approval.',
    'The employee approval vote is governed by s181: a majority of eligible employees who cast a valid vote must approve the agreement. For enterprise agreements covering large offshore and FIFO workforces, running a valid ballot across multiple rotation groups and remote locations requires careful logistical planning. The window for the vote must be set when the maximum number of workers across all rotations can participate—not just the onshore or currently-resident crews.',
    'FWC approval under s185 requires the Commission to be satisfied that the agreement passes the Better Off Overall Test (BOOT) under s253—that each award-covered employee and each prospective award-covered employee is better off overall under the agreement than under the applicable modern award. The Commission also checks that no term of the agreement contravenes the National Employment Standards, and that the agreement was made and approved in accordance with the Act. Commencement of the approved agreement occurs seven days after FWC approval, per s54, unless the agreement specifies a later date.',
    'Post-settlement transition is a distinct phase of work. Move the campaign record to post_settlement status. Formally acknowledge delegates and bargaining representatives—their names, contributions, and decisions should be documented, not just celebrated. Capture a structured debrief: what was in the seed pack, what was won, what was traded, what the employer resisted, and what the organising team would do differently. This debrief is the seed pack for Phase 3, and it is also the historical record the union will draw on when bargaining opens again. Begin Phase 3 planning immediately—the best time to set up the next campaign is when the workforce is still connected, delegates are still active, and the employer\'s patterns are fresh.',
  ],
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

export function isBargainingStageNumber(n: number): n is Phase2StageNumber {
  return n >= 7 && n <= 11
}

export function bargainingStageHeaderBlurb(stageNumber: number): string | undefined {
  if (!isBargainingStageNumber(stageNumber)) return undefined
  return BARGAINING_STAGE_HEADER_BLURB[stageNumber]
}

export function bargainingStageInfoBody(stageNumber: number): string[] | undefined {
  if (!isBargainingStageNumber(stageNumber)) return undefined
  return BARGAINING_STAGE_INFO_BODY[stageNumber]
}

// ---------------------------------------------------------------------------
// STEP HEADER BLURBS  (bargaining-context framing, one line each)
// ---------------------------------------------------------------------------

/** One-line bargaining-context framing shown next to the step name in Phase 2 plans. */
export const BARGAINING_STEP_HEADER_BLURB: Record<StepId, string> = {
  'ambitions': 'What specific outcomes do we need workers to achieve to win this agreement?',
  'where-to-play': 'Which levers—table, floor, regulator, community—are most powerful in this phase?',
  'theory': 'Why will our employer move? What is our theory of leverage at this stage?',
  'capacities': 'What structures and skills does the organising team need for this phase of escalation?',
  'management': 'What systems keep our delegates informed and workers accountable at swing-roster scale?',
}

// ---------------------------------------------------------------------------
// STEP INFO BODIES  (bargaining context, 2–3 paragraphs per step)
// ---------------------------------------------------------------------------

/** Longer bargaining-context guidance for the per-step info dialog (2–3 paragraphs each). */
export const BARGAINING_STEP_INFO_BODY: Record<StepId, string[]> = {
  'ambitions': [
    'In bargaining, ambitions are the specific, measurable outcomes you need workers to achieve—not claims language, but evidence of movement. Examples include: "80% of covered workers can name the three key log of claims without prompting", "delegates in all four vessel rotations have received and redistributed the latest employer counter-offer within 48 hours of tabling", or "protected action ballot returns a Yes vote of at least 85%". Each ambition should connect directly to the leverage theory for the current stage.',
    'Offshore and FIFO campaigns require ambitions that account for rotation structure. A target that makes sense for a site-based workforce—weekly meeting attendance, for example—may be structurally impossible for a crew that is offshore for 14 days and unavailable for in-person contact. Set ambitions in swing-cycle units rather than calendar units, and design the measurement system to capture data from crews as they rotate on and off.',
    'Hard and soft gate discipline matters even more in bargaining than in Phase 1, because the costs of premature escalation are higher. An ambition that is a hard gate—such as a minimum participation rate in a protected action ballot—should never be waived because the timeline is uncomfortable. If the gate cannot be cleared honestly, loop back and build the capacity. The gate is what keeps the campaign from overcommitting.',
  ],
  'where-to-play': [
    'In bargaining, "where to play" is a question of leverage geography. The table is the formal arena, but the employer\'s actual decision-making is driven by cost, operational disruption, regulatory risk, reputational exposure, and shareholder or board pressure. Identify which of these levers is most accessible to your campaign in the current stage. In offshore petroleum, operational disruption is often the dominant lever—a swing stoppage that removes an entire rotation crew from a platform can be more persuasive than months of table negotiation.',
    'Consider the regulatory and community dimensions. NOPSEMA and AMSA are not just notification recipients—they are audiences. Industrial action that raises safety questions will attract regulator attention; use that strategically by ensuring your communications frame workers\' concerns in terms of safety as well as pay. Community and shareholder pressure is less direct but can be effective for major offshore operators with listed parent companies or government contracts. The WA resources sector has both characteristics.',
    'Comms geography matters for FIFO and remote workforces. Workers on different rotations are, in effect, in different information environments at the same time. "Where to play" includes the question of which rotation group receives which message first, and whether the helicopter day—the day workers fly on or off the facility—can be used as a structured comms moment. Design your floor-level organising around the physical and temporal structure of the roster, not around the calendar.',
  ],
  'theory': [
    'The theory of leverage in bargaining must answer a specific question: why will this employer make a decision to move on the outstanding issues, and when? Employers move when the cost of not settling exceeds the cost of settling. Your theory must specify what that cost is, how it is being imposed, and what the tipping point looks like. A theory that says "we will keep pressuring them until they move" is not a theory—it is a wish. A theory that says "four consecutive swing stoppages will trigger a force majeure declaration on the LNG offtake contract, which generates $X in penalties, which exceeds the NPV of the disputed wage increase over the agreement term" is a theory.',
    'Reassess the theory at each stage transition. Employer behaviour in Stages 8 and 9 will reveal whether the initial theory was accurate. If the employer has shown that operational disruption does not move them—because they have production redundancy, or because the market has shifted—the theory must be revised before further action is taken. Stale theories that no longer match the facts are one of the most common causes of campaigns that escalate and then collapse.',
    'In offshore and multi-site FIFO campaigns, the theory of leverage may be different for different worksites or vessels. A platform that is producing at nameplate capacity has different vulnerability than one that is already running maintenance outages. Build a site-specific theory of leverage for the highest-priority sites, and design the escalating action ladder so that the most vulnerable sites are used to set precedents that apply across the enterprise.',
  ],
  'capacities': [
    'Bargaining-phase capacities are different from the mobilisation capacities of Phase 1. You still need density, delegate coverage, and communication structures—but you now also need workers who can read and respond to a draft enterprise agreement clause, delegates who can represent workers in formal bargaining sessions without inadvertently making binding commitments, and an organising team that can manage legal process (PABO applications, FWC hearings, notice periods) alongside floor-level work.',
    'Offshore contexts impose specific capacity requirements. Delegates on rotating shifts cannot attend every bargaining session in person—ensure they receive briefings within their rotation window and have a clear escalation path to the lead organiser when issues arise at the facility. Translation and accessibility capacity matters for workforces with significant NESB representation, which is common in the offshore catering and services streams on WA platforms. If a delegate is not across the claims in a language a crew member understands, that crew member is not genuinely represented.',
    'Legal capacity is not a luxury in Phase 2. The campaign will encounter PABO hearings, potential s240A conciliation, employer applications under s437, and possibly s235 intractable bargaining proceedings. Ensure that industrial legal support is scoped and budgeted from the start of Phase 2, not retrieved in a crisis. Legal advisers should be briefed on the bargaining record and the strength assessment documentation so they can move quickly when proceedings are initiated.',
  ],
  'management': [
    'Management systems in bargaining must operate at swing-roster scale and legal-process speed simultaneously. The minimum viable management structure for a Phase 2 campaign includes: a weekly bargaining team meeting (table reps, lead organiser, legal), a fortnightly rotation-based delegate briefing (timed to rotation changeover), a real-time comms channel for urgent updates (secure messaging platform, not email), a documented decision register (every significant decision recorded with the date, who made it, and the reasoning), and a legal timeline tracker (PABO validity windows, notice periods, s235 risk date).',
    'Rotation changeover days are the highest-value organising moments in an offshore or FIFO campaign. Workers who are rotating off are accessible, relatively relaxed, and about to spend time in a non-workplace environment where they can process information without employer oversight. Workers rotating on are receptive to messages that frame what they are returning to. Design your management systems so that significant communications and delegate check-ins are planned for rotation days—not improvised.',
    'Document everything during bargaining. Meeting notes, counter-offer records, assessment snapshots, ballot results, and action participation data are not administrative busywork—they are the evidentiary record that protects the union in FWC proceedings, demonstrates good faith under s228, and provides the foundation for the post-settlement debrief and Phase 3 planning. A campaign that wins at the table but has no documented record of how it won has not fully transferred its knowledge to the next cycle.',
  ],
}
