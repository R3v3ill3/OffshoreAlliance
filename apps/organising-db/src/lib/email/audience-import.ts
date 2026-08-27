/**
 * Email audience CSV/XLSX import helpers — the email counterpart of
 * lib/sms/audience-import. Pure functions; the route does the DB work.
 *
 * Consent: uploaded lists carry a consent attestation (same
 * CONSENT_BASES as SMS) and created workers are stamped
 * email_consent_source = 'import'.
 */

export const CONSENT_BASES = [
  'membership_form',
  'workplace_signup',
  'direct_request',
  'other',
] as const

export type ConsentBasis = (typeof CONSENT_BASES)[number]

const FIRST_NAME_HEADERS = [
  'first name',
  'firstname',
  'first',
  'given name',
  'given names',
  'fname',
]
const LAST_NAME_HEADERS = [
  'last name',
  'lastname',
  'last',
  'surname',
  'family name',
  'lname',
]
const EMAIL_HEADERS = [
  'email',
  'email address',
  'e-mail',
  'e-mail address',
  'emailaddress',
  'work email',
  'personal email',
]

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ')
}

export interface HeaderMapping {
  firstName: string | null
  lastName: string | null
  email: string | null
  missing: string[]
}

/** Map free-form spreadsheet headers to the fields we need. */
export function mapEmailHeaders(headers: string[]): HeaderMapping {
  const find = (candidates: string[]): string | null => {
    for (const h of headers) {
      if (candidates.includes(normaliseHeader(h))) return h
    }
    return null
  }
  const firstName = find(FIRST_NAME_HEADERS)
  const lastName = find(LAST_NAME_HEADERS)
  const email = find(EMAIL_HEADERS)
  const missing: string[] = []
  if (!firstName) missing.push('first name')
  if (!lastName) missing.push('last name')
  if (!email) missing.push('email')
  return { firstName, lastName, email, missing }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export interface ParsedEmailRow {
  key: string
  first_name: string
  last_name: string
  email: string
}

export interface RejectedEmailRow {
  row: Record<string, string>
  reason: string
}

export interface ParseEmailRowsResult {
  rows: ParsedEmailRow[]
  rejected: RejectedEmailRow[]
}

/**
 * Validate + normalise data rows: valid address required, names
 * required, duplicates (by address) collapsed to the first occurrence.
 */
export function parseEmailAudienceRows(
  dataRows: Record<string, string>[],
  headers: string[],
): ParseEmailRowsResult {
  const mapping = mapEmailHeaders(headers)
  const rows: ParsedEmailRow[] = []
  const rejected: RejectedEmailRow[] = []
  const seen = new Set<string>()

  dataRows.forEach((row, idx) => {
    const first = mapping.firstName ? (row[mapping.firstName] ?? '').trim() : ''
    const last = mapping.lastName ? (row[mapping.lastName] ?? '').trim() : ''
    const emailRaw = mapping.email ? (row[mapping.email] ?? '').trim() : ''
    const email = emailRaw.toLowerCase()

    if (!email) {
      rejected.push({ row, reason: 'Missing email address' })
      return
    }
    if (!EMAIL_RE.test(email)) {
      rejected.push({ row, reason: `Invalid email address: ${emailRaw}` })
      return
    }
    if (!first || !last) {
      rejected.push({ row, reason: 'Missing first or last name' })
      return
    }
    if (seen.has(email)) {
      rejected.push({ row, reason: `Duplicate email in file: ${email}` })
      return
    }
    seen.add(email)
    rows.push({
      key: `row-${idx}`,
      first_name: first,
      last_name: last,
      email,
    })
  })

  return { rows, rejected }
}
