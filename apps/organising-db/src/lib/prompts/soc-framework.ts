/**
 * Structured Organising Conversation (SOC) framework — v3, 8-stage.
 *
 * Canonical reference text injected into AI system prompts when generating
 * campaign communications and when coaching SOC sessions. Imported by
 * draft-prompts.ts (email / SMS / phone) and by the SOC wizard's coach API
 * route. The preamble varies per platform; the framework constant itself
 * is platform-agnostic.
 *
 * Companion modules under ./soc/ provide additional, SOC-wizard-specific
 * material (per-stage coaching directives, population segmentation helpers).
 */

export const SOC_FRAMEWORK = `
STRUCTURED ORGANISING CONVERSATION (SOC) — 8-STAGE FRAMEWORK
================================================================
Use this as background context when crafting communications or coaching
organisers. You do NOT need to reproduce every stage in every draft — draw
on whichever elements fit the campaign stage, audience, tone, and platform.

1. INTRODUCTION
   - Brief, low-stakes statement of who you are, why you are reaching out,
     and what the conversation will and won't be. Set time expectations.
   - Goal: the worker relaxes and knows what this is.

2. BUILD RAPPORT
   - Open questions of curiosity — history, crew, where they were before,
     how they're finding it. Genuine interest, not interrogation.
   - Listen for who they are and which population segment they belong to
     (organisers identify and classify discrete populations on each campaign;
     these vary per situation).
   - Goal: gather context; place the worker; find common ground.

3. IDENTIFY ISSUES
   - Surface what actually has heat for THIS worker. Different populations
     surface different issues — calibrate prompts accordingly.
   - Listen for the issue with the most charge behind it. That's the
     issue you'll agitate on.
   - Goal: find the grievance or concern that fuels the next stages.

4. AGITATE
   - Make the injustice felt, not just understood. Convert frustration
     into productive anger. Two layers:
       • Personal agitation — on the worker's specific grievance
       • Structural agitation — on the bigger trap (who benefits, who
                                 decided, why now)
   - Move the worker from intellectual recognition to emotional
     engagement. Without this fuel, the rest of the conversation has
     nothing to run on.
   - Don't agitate yourself; let the worker feel theirs. Don't
     agitate into hopelessness — agitation must open onto Hope.

5. HOPE — three frames
   The bridge from agitation to action. Without hope, an agitated worker
   becomes a despondent one. Use whichever frames land. Often all three
   in sequence:

   5a. OPPORTUNITY OF A LIFETIME
       - Show that this moment is rare and leverage is high. The
         agreement benchmarks rates for years; the mechanism is simple
         (vote / sign / show up); the worker's input is decisive.
       - The worker is not a small player — they are a big player who
         happens to be wearing a green hat.

   5b. THE PLAN
       - A credible, simple, step-by-step path to winning. Five plain-
         language steps a worker can repeat at smoko. No jargon, no
         acronyms, no lawyer talk.
       - The plan must answer: what happens if we vote no? What happens
         next? What does the company actually have to do?
       - If the plan sounds like a lawyer wrote it, the worker tunes
         out. Strip it back.

   5c. DON'T TAKE THE LOLLY
       - Reframe the company's sweetener (sign-on bonus, one-off
         payment, etc.) as bait. Compare a one-off to years of
         suppressed rates. The cheapest thing the company can add is
         what they will add — and they will add it because the
         straight offer already failed.
       - "The lolly tastes good. The dentist bill is the next four years."

6. ACTION — the Call to Action (CTA)
   - Specific. Time-bound. Proportionate. Pinned down.
     • "When the ballot lands, will you vote no?"
     • "Will you sign up tonight, on my phone, before I leave?"
     • "Will you have the same yarn with the four blokes on your crew
       this week?"
   - Don't accept a soft yes. "Yeah alright" is not a commitment —
     pin it down with a specific action by a specific date.
   - Order: open questions early, closed questions late. Reverse this
     and the conversation collapses.

7. INOCULATION
   - Walk the worker through what the company will say and do next, so
     the playbook can't catch them off guard. Common moves to inoculate
     against:
     • Captive-audience meeting (sales pitch dressed as information)
     • Supervisor's quiet word ("the boys are all on board, mate")
     • Sign-on bonus pitch (compare to years of suppressed rates)
     • Divide-and-conquer (between segments of the workforce)
     • "This is the best offer" (companies don't put their best first,
       especially after a no vote)
     • "Risk" framing (votes are secret; adverse action for protected
       activity is unlawful; we back you up)
   - Critical: don't just describe the company's tactics — get the
     worker to say out loud how they will respond. Make them rehearse.
   - The stronger the yes in stage 6, the more important inoculation —
     the worker is now visible to the company's campaign.

8. CLOSE + NEXT STEPS
   - Confirm the commitment in plain language: "So to confirm — you're
     voting no when the ballot drops, you're signing up tonight, and
     you'll have the same yarn with [names] this week."
   - Bridge to the next contact point. "I'll catch you at smoko on
     Thursday and we'll see how the conversations went."
   - Leave on a positive note, whatever the outcome.

KEY PRINCIPLES (run underneath every stage):
- Worker talks 2/3, organiser 1/3. The silence is doing the work.
- Ask questions; don't lecture. Open early, closed late.
- Agitate before educating. Without agitation, the rest has no fuel.
- Pace is safe → challenging. Front-load pressure and the worker
  shuts down. Stay safe the whole way and you never get a commitment.
- Watch the worker, not the script. Read body language. If they're
  going quiet, slow down and listen. If they're leaning in and swearing
  about the company, you have permission to push harder.
- Skip a stage and the conversation collapses. A worker who hasn't been
  agitated won't feel urgency; one who hasn't been given hope retreats
  into apathy; one who hasn't been inoculated folds at the captive-
  audience meeting.

POPULATIONS:
Every SOC is shaped by who the worker is. Organisers identify discrete
worker populations for each campaign — they vary by sector, employer,
and moment. The pitch that lands with one population may not land with
another. Calibrate language, pacing, and emphasis to the population you
are talking to. The wizard captures the populations relevant to each
SOC; do not assume a fixed list.

OBJECTION HANDLING — EAR:
When a worker objects:
- EXPLORE     — ask a question to find out WHY they object. Don't argue.
- ACKNOWLEDGE — validate how they feel; don't concede the point.
- REDIRECT    — bring the conversation back to their issue and the plan.
                "What will change if we don't stand together?"

COMMON PITFALLS to avoid:
- Over-talking. New organisers fill silence.
- Anti-union talk yourself, even to build rapport. Costs legitimacy.
- Solving instead of organising. Use the issue to build their capacity,
  not to demonstrate yours.
- Skipping inoculation because the yes felt strong.
- Overselling. Underclaim and overdeliver.
- Promising "leave it to us, mate." The worker is the plan.
- Recruiting on perks (t-shirt, pub night). Recruit on the issue.
- Treating all populations the same.
- Agitating on an issue they don't actually care about.
- Agitating into hopelessness — always move to Hope.
- Performing anger yourself. Let them feel theirs.
`

export const SOC_FRAMEWORK_PREAMBLE_PHONE = `
The script should follow the Structured Organising Conversation (SOC)
methodology outlined below. Adapt the depth and order of stages to the
campaign stage, audience, and tone — not every stage needs equal weight
in every call. Structure the script using the 8 SOC stages as section
headings; collapse stages where appropriate but keep the order.`

export const SOC_FRAMEWORK_PREAMBLE_EMAIL = `
This email is one touchpoint within a broader Structured Organising
Conversation. You do not need to cover every stage of the conversation
in a single email — focus on the elements most relevant to the campaign
stage, audience, and selected tone. The SOC framework below provides
context for the emotional register, persuasion strategy, and call-to-
action framing you should use.`

export const SOC_FRAMEWORK_PREAMBLE_SMS = `
This SMS is one brief touchpoint within a broader Structured Organising
Conversation. A single SMS will typically carry only one moment from the
framework — an agitation question, a hope statement, a concrete action
ask, an inoculation against the company's next move, or a redirect. The
framework below provides context so you choose the right register and
intent.`

/**
 * SOC stage identifier. The 8-stage v3 framework uses 1..8.
 * Stage 5 (Hope) has three sub-frames; see {@link HopeFrame}.
 */
export type SocStage = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/**
 * Names for each of the 8 SOC stages, in order.
 * Used by the wizard UI and the API for human-readable labels.
 */
export const SOC_STAGE_NAMES: Record<SocStage, string> = {
  1: 'Introduction',
  2: 'Build Rapport',
  3: 'Identify Issues',
  4: 'Agitate',
  5: 'Hope',
  6: 'Action',
  7: 'Inoculation',
  8: 'Close',
}

/**
 * Stage 5 (Hope) sub-frame identifiers. A SOC may use any combination
 * of these — typically all three in sequence.
 */
export type HopeFrame = 'opportunity' | 'plan' | 'dont_take_lolly'

export const HOPE_FRAME_NAMES: Record<HopeFrame, string> = {
  opportunity: 'Opportunity of a Lifetime',
  plan: 'The Plan',
  dont_take_lolly: "Don't Take the Lolly",
}
