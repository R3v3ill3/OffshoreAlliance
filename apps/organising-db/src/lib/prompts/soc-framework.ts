/**
 * Structured Organising Conversation (SOC) framework — the canonical reference
 * text injected into AI system prompts when generating campaign communications.
 *
 * Imported by draft-prompts.ts and included as background context for all
 * platforms (email, SMS, phone script). The preamble varies per platform;
 * the framework constant itself is platform-agnostic.
 */

export const SOC_FRAMEWORK = `
STRUCTURED ORGANISING CONVERSATION (SOC) FRAMEWORK
====================================================
The following framework describes how organisers build relationships and move
workers to action. Use it as contextual background when crafting communications
— you do NOT need to reproduce every step in every draft. Draw on whichever
elements are most relevant to the campaign stage, audience, tone, and platform.

1. INTRODUCTION & RAPPORT BUILDING
   - Brief introductory statement about who you are and why you are reaching out.
   - Questions of curiosity — make the person feel comfortable and genuinely
     interested in what they think and have to say.

2. ISSUES
   - Discover what they care about.
   - Ask questions to find out what is going on for them at work.
   - Is there something they would like to be different?

3. EDUCATE  (uses the AHA framework)
   Take the issue they care about and educate them on how being union would
   help make a difference. Sometimes it takes all three steps to reach the
   "aha!" moment:
     • Agitate  — "How can we change this? What would it be like if that
                    issue was fixed?"
     • Hope     — "Do you think we could change things if we …? What if we
                    stood together on this?"
     • Action   — "Being union, standing together could help."

4. ASK  (uses the EAR framework for objections)
   Ask them to do something specific — be concrete about what it means to be
   part of the union plan. When the worker raises an objection:
     • Explore      — Ask a question to find out WHY they object.
     • Acknowledge  — Validate how they feel.
     • Redirect     — Bring the conversation back to their issue:
                       "What will change if we don't stand together?"

5. CLOSE  (optionally uses Inoculation)
   Finish on a good note, whatever the outcome — you may need to talk to them
   again. If they decide to join:
     • Inoculation  — Ask how they think their manager will react. Reassure
                       them that this is a normal reaction and take the sting
                       out of it.
`

export const SOC_FRAMEWORK_PREAMBLE_PHONE = `
The script should follow the Structured Organising Conversation (SOC) methodology
outlined below. Adapt the depth and order of steps to the campaign stage and tone —
not every step needs equal weight in every call.`

export const SOC_FRAMEWORK_PREAMBLE_EMAIL = `
This email is one touchpoint within a broader Structured Organising Conversation.
You do not need to cover every step of the conversation in a single email — focus
on the elements most relevant to the campaign stage, audience, and selected tone.
The SOC framework below provides context for the emotional register, persuasion
strategy, and call-to-action framing you should use.`

export const SOC_FRAMEWORK_PREAMBLE_SMS = `
This SMS is one brief touchpoint within a broader Structured Organising Conversation.
A single SMS will typically carry only one moment from the framework — an agitation
question, a hope statement, a concrete action ask, or a redirect. The framework
below provides context so you choose the right register and intent.`
