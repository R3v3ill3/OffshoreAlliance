export interface TemplateVariable {
  key: string
  label: string
  description: string
  tier: 'campaign' | 'recipient'
}

export const CAMPAIGN_CONTEXT_VARIABLES: TemplateVariable[] = [
  { key: 'employer_name', label: 'Employer Name', description: 'Primary employer on the campaign agreement', tier: 'campaign' },
  { key: 'agreement_name', label: 'Agreement Name', description: 'Enterprise agreement name', tier: 'campaign' },
  { key: 'worksite_name', label: 'Worksite Name', description: 'Primary worksite name', tier: 'campaign' },
  { key: 'campaign_name', label: 'Campaign Name', description: 'Campaign name / identifier', tier: 'campaign' },
  { key: 'organiser_name', label: 'Organiser Name', description: 'Lead organiser for the campaign', tier: 'campaign' },
  { key: 'organiser_phone', label: 'Organiser Phone', description: 'Lead organiser phone number', tier: 'campaign' },
  { key: 'staff_name', label: 'Staff Name', description: 'Logged-in organiser name', tier: 'campaign' },
  { key: 'staff_email', label: 'Staff Email', description: 'Logged-in organiser email', tier: 'campaign' },
  { key: 'staff_phone', label: 'Staff Phone', description: 'Logged-in organiser phone', tier: 'campaign' },
  { key: 'staff_role', label: 'Staff Role', description: 'Logged-in organiser role title', tier: 'campaign' },
  { key: 'date', label: 'Date', description: 'Current date (formatted)', tier: 'campaign' },
]

export const RECIPIENT_VARIABLES: TemplateVariable[] = [
  { key: 'first_name', label: 'First Name', description: 'Recipient first name (resolved by Action Network at send time)', tier: 'recipient' },
  { key: 'last_name', label: 'Last Name', description: 'Recipient last name (resolved by Action Network at send time)', tier: 'recipient' },
]

export const ALL_TEMPLATE_VARIABLES: TemplateVariable[] = [
  ...RECIPIENT_VARIABLES,
  ...CAMPAIGN_CONTEXT_VARIABLES,
]

export const ALL_VARIABLE_KEYS = ALL_TEMPLATE_VARIABLES.map((v) => v.key)

export const INSERT_VARIABLES = ALL_TEMPLATE_VARIABLES.map((v) => `{{${v.key}}}`)

export const AN_VARIABLE_MAP: Record<string, string> = {
  first_name: '[contact.first_name]',
  last_name: '[contact.last_name]',
}

export const SAMPLE_DATA: Record<string, string> = {
  first_name: 'Alex',
  last_name: 'Mitchell',
  agreement_name: 'Woodside FPSO EA 2026',
  employer_name: 'Woodside Energy',
  worksite_name: 'North West Shelf',
  organiser_name: 'Sarah Chen',
  organiser_phone: '0412 345 678',
  date: '15 April 2026',
  campaign_name: 'NWS Bargaining 2026',
  staff_name: 'Sarah Chen',
  staff_email: 'sarah.chen@example.com',
  staff_phone: '0412 345 678',
  staff_role: 'Lead Organiser',
}

export function resolveTemplateVariables(
  text: string,
  campaignContext: Record<string, string | undefined>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in AN_VARIABLE_MAP) return match
    const value = campaignContext[key]
    return value || match
  })
}

export function translateToActionNetwork(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return AN_VARIABLE_MAP[key] || match
  })
}

export function applyVariableReplacements(
  text: string,
  replacements: Array<{ original_text: string; variable: string; accepted: boolean }>,
): string {
  let result = text
  for (const r of replacements) {
    if (!r.accepted) continue
    result = result.split(r.original_text).join(`{{${r.variable}}}`)
  }
  return result
}
