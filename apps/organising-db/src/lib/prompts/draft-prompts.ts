import type { CommsDraftRequest } from '@/types/planner-types'
import {
  SOC_FRAMEWORK,
  SOC_FRAMEWORK_PREAMBLE_EMAIL,
  SOC_FRAMEWORK_PREAMBLE_SMS,
  SOC_FRAMEWORK_PREAMBLE_PHONE,
} from './soc-framework'
import { CAMPAIGN_CONTEXT_VARIABLES, RECIPIENT_VARIABLES } from '@/lib/comms/template-variables'

export const OA_CONTEXT = `You are a communications specialist for the Offshore Alliance (OA), a joint union initiative between the AWU (Australian Workers' Union) and the MUA (Maritime Union of Australia) operating in Australia's offshore oil and gas sector.

The OA uses a structured, high-intensity organising model based on:
- Structured contact networks with monitorable 2-way communication
- Member-driven, shared-responsibility approach ("want more, do more")
- Stage-and-gate progression: 6 stages from Contact ID through to Bargaining to Win
- Enterprise bargaining campaigns for offshore workers (FIFO, marine, catering, maintenance)
- Key themes: fair pay, job security, no blacklists, expanded delegate rights, same job same pay`

/**
 * Authoritative glossary of template variables, built from the same source as the
 * resolver (`CAMPAIGN_CONTEXT_VARIABLES` / `RECIPIENT_VARIABLES`). Injected into every
 * system prompt so Claude treats `{{agreement_name}}`, `{{organiser_name}}`,
 * `{{staff_name}}` etc. as distinct entities and does not swap one for another.
 */
export const VARIABLE_GLOSSARY = `VARIABLE GLOSSARY — each placeholder refers to a distinct entity. NEVER substitute one for another:
${[...CAMPAIGN_CONTEXT_VARIABLES, ...RECIPIENT_VARIABLES]
  .map((v) => `- {{${v.key}}} = ${v.description}`)
  .join('\n')}

CRITICAL VARIABLE RULES:
- Preserve the EXACT placeholder text. Do NOT inline real values — they are substituted at send time.
- {{agreement_name}} is the ENTERPRISE AGREEMENT (a document/instrument) — it is NEVER a person's name.
- {{organiser_name}} is the LEAD ORGANISER for the campaign (a person, distinct from the sender).
- {{staff_name}} is the SENDING STAFF MEMBER (the person whose name signs off the comm).
- These three are independent — do not swap {{agreement_name}} ↔ {{organiser_name}} ↔ {{staff_name}} under any circumstance.
- If you cannot find a sensible home for a variable, omit it rather than substitute a different one.`

export function buildEmailPrompt(request: CommsDraftRequest): { system: string; user: string } {
  const system = `${OA_CONTEXT}

You are generating a campaign email draft. The email should:
- Be professional but warm, using plain language workers can relate to
- Reflect the selected narrative tone
- Be appropriate for the campaign stage
- Include template variables in {{variable_name}} format where personalisation is needed
- Include a clear call to action appropriate to the stage
- Be formatted in both HTML and plain text

${VARIABLE_GLOSSARY}
${SOC_FRAMEWORK_PREAMBLE_EMAIL}
${SOC_FRAMEWORK}
Respond in JSON format:
{
  "subject": "string",
  "body_text": "string (plain text version)",
  "body_html": "string (HTML version with basic formatting - p, strong, em, ul, li, a tags only)",
  "variables_used": ["string"],
  "tone_applied": "string (which tone was used)",
  "audience_targeted": "string (who this is aimed at)",
  "estimated_character_count": number
}`

  const user = buildUserMessage(request)
  return { system, user }
}

export function buildSmsPrompt(request: CommsDraftRequest): { system: string; user: string } {
  const system = `${OA_CONTEXT}

You are generating an SMS message for a campaign communication via the Mobile Message SMS platform. The SMS should:
- Be concise: ideally under 160 characters (1 SMS segment), maximum 320 characters (2 segments)
- Use a direct, clear tone appropriate to the campaign stage
- Include a clear call to action (reply, click link, attend meeting, etc.)
- Use template variables in {{variable_name}} format sparingly (they count toward character limit)
- Sign off with "- Offshore Alliance" or "- OA"
- NOT include HTML or rich formatting

${VARIABLE_GLOSSARY}
${SOC_FRAMEWORK_PREAMBLE_SMS}
${SOC_FRAMEWORK}
Respond in JSON format:
{
  "body_text": "string (the SMS message)",
  "variables_used": ["string"],
  "tone_applied": "string",
  "audience_targeted": "string",
  "estimated_character_count": number
}`

  const user = buildUserMessage(request)
  return { system, user }
}

export function buildPhoneScriptPrompt(request: CommsDraftRequest): { system: string; user: string } {
  const system = `${OA_CONTEXT}

You are generating a phone call script for an organiser making 1-on-1 calls to workers.
${SOC_FRAMEWORK_PREAMBLE_PHONE}
${SOC_FRAMEWORK}
The script should:
- Feel natural and conversational, not robotic
- Structure sections around the 8 SOC stages (Introduction, Build Rapport, Identify Issues, Agitate, Hope, Action, Inoculation, Close) — using clear section headings. Collapse stages where appropriate to suit a phone call's pace, but keep the order.
- Within the Hope stage, draw on whichever of the three Hope frames fit (Opportunity of a Lifetime, The Plan, Don't Take the Lolly).
- Include suggested responses to common objections using the EAR framework (Explore, Acknowledge, Redirect)
- Treat Inoculation as a full stage in its own right — walk through what the company will say next and prompt the worker to rehearse their response
- Be appropriate for the campaign stage and selected tone
- Include notes/tips in [square brackets] for the organiser
- Use {{variable_name}} for personalisation

${VARIABLE_GLOSSARY}

Respond in JSON format:
{
  "body_text": "string (the full script with sections clearly marked)",
  "variables_used": ["string"],
  "tone_applied": "string",
  "audience_targeted": "string",
  "estimated_character_count": number
}`

  const user = buildUserMessage(request)
  return { system, user }
}

function buildUserMessage(request: CommsDraftRequest): string {
  const ctx = request.campaign_context
  const wtp = request.wtp_selections

  const contextLines: string[] = [
    `Agreement Name: ${ctx.agreement_name}`,
    `Employer: ${ctx.employer_name}`,
    `Sector: ${ctx.sector}`,
    `Worksites: ${ctx.worksite_names.join(', ') || 'Not specified'}`,
    `Stage: ${request.stage_number} — ${request.stage_name}`,
  ]
  if (ctx.campaign_type) contextLines.push(`Campaign type: ${ctx.campaign_type}`)
  if (ctx.agreement_expiry) contextLines.push(`Agreement Expiry: ${ctx.agreement_expiry}`)
  if (ctx.organiser_name) contextLines.push(`Lead Organiser (the {{organiser_name}}): ${ctx.organiser_name}`)
  if (ctx.organiser_phone) contextLines.push(`Lead Organiser Phone (the {{organiser_phone}}): ${ctx.organiser_phone}`)
  if (ctx.staff_name) contextLines.push(`Sending Staff Member (the {{staff_name}}): ${ctx.staff_name}`)
  if (ctx.staff_email) contextLines.push(`Sending Staff Email (the {{staff_email}}): ${ctx.staff_email}`)
  if (ctx.staff_phone) contextLines.push(`Sending Staff Phone (the {{staff_phone}}): ${ctx.staff_phone}`)
  if (ctx.staff_role) contextLines.push(`Sending Staff Role (the {{staff_role}}): ${ctx.staff_role}`)

  let msg = `${contextLines.join('\n')}

NARRATIVE TONE (from Where to Play selections):
${wtp.tone.length > 0 ? wtp.tone.map(t => `- ${t}`).join('\n') : 'Not specified — use a balanced, informative tone'}

TARGET AUDIENCE:
${wtp.audience.length > 0 ? wtp.audience.map(a => `- ${a}`).join('\n') : 'All campaign contacts'}

COMMUNICATION PLATFORMS SELECTED:
${wtp.platforms.map(p => `- ${p}`).join('\n')}

${wtp.engagement_intensity ? `ENGAGEMENT INTENSITY: ${wtp.engagement_intensity}` : ''}
${wtp.contact_method_priority?.length ? `CONTACT METHOD PRIORITY:\n${wtp.contact_method_priority.map(c => `- ${c}`).join('\n')}` : ''}`

  if (request.situation_analysis_context) {
    // Organiser-confirmed campaign context. Predicted employer playbook moves
    // become inoculation lines; top issues become agitation hooks; workforce
    // populations drive audience pacing. Treat anything here as factual
    // background, but don't quote it back to workers verbatim.
    msg += `\n\n${request.situation_analysis_context}`
  }

  if (request.template_examples?.length) {
    msg += `\n\nREFERENCE TEMPLATES (use these as style/tone examples, do NOT copy them verbatim):\n`
    request.template_examples.forEach((t, i) => {
      msg += `\n--- Template ${i + 1}: ${t.title} ---\n`
      if (t.subject_line) msg += `Subject: ${t.subject_line}\n`
      msg += `${t.body_text}\n`
    })
  }

  if (request.custom_instructions) {
    msg += `\n\nADDITIONAL INSTRUCTIONS:\n${request.custom_instructions}`
  }

  msg += `\n\nPlease generate the ${request.platform === 'phone_script' ? 'phone script' : request.platform === 'sms' ? 'SMS message' : 'email'} draft for this campaign stage.`

  return msg
}

/**
 * I3. Build the `custom_instructions` string for phone-script variation
 * generation. Previously duplicated in PhoneWizardSteps.tsx and
 * ScriptVariationsPanel.tsx — single source from here.
 *
 * @param segmentLabel   Human-readable segment name, e.g. "Crane operators"
 * @param callObjective  Optional override call purpose text
 */
export function buildVariationInstructions(segmentLabel: string, callObjective?: string | null): string {
  return [
    callObjective ? `Call purpose: ${callObjective}` : '',
    `Generate a TARGETED VARIATION for: ${segmentLabel} workers.`,
    `Keep the same overall structure and call purpose as the reference script. Adapt opening, issues, and ask for ${segmentLabel}.`,
  ].filter(Boolean).join('\n')
}
