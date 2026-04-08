import type { CommsDraftRequest } from '@/types/planner-types'

const OA_CONTEXT = `You are a communications specialist for the Offshore Alliance (OA), a joint union initiative between the AWU (Australian Workers' Union) and the MUA (Maritime Union of Australia) operating in Australia's offshore oil and gas sector.

The OA uses a structured, high-intensity organising model based on:
- Structured contact networks with monitorable 2-way communication
- Member-driven, shared-responsibility approach ("want more, do more")
- Stage-and-gate progression: 6 stages from Contact ID through to Bargaining to Win
- Enterprise bargaining campaigns for offshore workers (FIFO, marine, catering, maintenance)
- Key themes: fair pay, job security, no blacklists, expanded delegate rights, same job same pay`

export function buildEmailPrompt(request: CommsDraftRequest): { system: string; user: string } {
  const system = `${OA_CONTEXT}

You are generating a campaign email draft. The email should:
- Be professional but warm, using plain language workers can relate to
- Reflect the selected narrative tone
- Be appropriate for the campaign stage
- Include template variables in {{variable_name}} format where personalisation is needed
- Include a clear call to action appropriate to the stage
- Be formatted in both HTML and plain text

Standard variables available: {{first_name}}, {{last_name}}, {{agreement_name}}, {{employer_name}}, {{worksite_name}}, {{organiser_name}}, {{organiser_phone}}, {{staff_name}}, {{staff_email}}, {{staff_phone}}, {{staff_role}}

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

You are generating an SMS message for a campaign communication via the Yabbr SMS platform. The SMS should:
- Be concise: ideally under 160 characters (1 SMS segment), maximum 320 characters (2 segments)
- Use a direct, clear tone appropriate to the campaign stage
- Include a clear call to action (reply, click link, attend meeting, etc.)
- Use template variables in {{variable_name}} format sparingly (they count toward character limit)
- Sign off with "- Offshore Alliance" or "- OA"
- NOT include HTML or rich formatting

Standard variables: {{first_name}}, {{agreement_name}}, {{organiser_name}}, {{staff_name}}, {{staff_email}}, {{staff_phone}}, {{staff_role}}

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

You are generating a phone call script for an organiser making 1-on-1 calls to workers. The script should follow the Structured Organising Conversation (SOC) methodology:

1. OPENER: Brief, friendly introduction establishing who you are and why you're calling
2. LISTEN: Open-ended question to understand the worker's situation and concerns
3. AGITATE: Connect their concerns to the broader campaign issue
4. KEY POINTS: 2-3 specific talking points relevant to the campaign stage and tone
5. INOCULATE: Pre-empt likely employer counter-arguments with factual responses
6. CALL TO ACTION: Specific ask appropriate to the campaign stage
7. CLOSE: Next steps, how to stay in touch, thank them

The script should:
- Feel natural and conversational, not robotic
- Include suggested responses to common objections
- Be appropriate for the campaign stage and selected tone
- Include notes/tips in [square brackets] for the organiser
- Use {{variable_name}} for personalisation
- Standard variables include: {{first_name}}, {{last_name}}, {{agreement_name}}, {{employer_name}}, {{worksite_name}}, {{organiser_name}}, {{organiser_phone}}, {{staff_name}}, {{staff_email}}, {{staff_phone}}, {{staff_role}}

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

  let msg = `Campaign: ${ctx.agreement_name}
Employer: ${ctx.employer_name}
Sector: ${ctx.sector}
Worksites: ${ctx.worksite_names.join(', ') || 'Not specified'}
Stage: ${request.stage_number} — ${request.stage_name}
${ctx.campaign_type ? `Campaign type: ${ctx.campaign_type}` : ''}
${ctx.agreement_expiry ? `Agreement Expiry: ${ctx.agreement_expiry}` : ''}

NARRATIVE TONE (from Where to Play selections):
${wtp.tone.length > 0 ? wtp.tone.map(t => `- ${t}`).join('\n') : 'Not specified — use a balanced, informative tone'}

TARGET AUDIENCE:
${wtp.audience.length > 0 ? wtp.audience.map(a => `- ${a}`).join('\n') : 'All campaign contacts'}

COMMUNICATION PLATFORMS SELECTED:
${wtp.platforms.map(p => `- ${p}`).join('\n')}

${wtp.engagement_intensity ? `ENGAGEMENT INTENSITY: ${wtp.engagement_intensity}` : ''}
${wtp.contact_method_priority?.length ? `CONTACT METHOD PRIORITY:\n${wtp.contact_method_priority.map(c => `- ${c}`).join('\n')}` : ''}`

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
