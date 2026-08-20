/**
 * POST /api/campaigns/[id]/email-audience/import
 *
 * One-shot email audience upload (the email counterpart of the SMS
 * audience import, collapsed to a single request — pilot-scale files):
 * parse CSV/XLSX → validate rows → match on workers.email → create
 * missing workers (email_consent_source 'import', consent attestation
 * required) → ensure campaign membership → optionally create an
 * email_lists row containing everyone imported.
 *
 * multipart/form-data fields:
 *   file            — .csv / .xlsx / .xls with first name, last name, email
 *   consent_basis   — one of CONSENT_BASES
 *   consent_attested— must be "true"
 *   list_name       — optional; when present an email list (status
 *                     'draft') is created with the imported workers
 */

import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import {
  CONSENT_BASES,
  parseEmailAudienceRows,
  mapEmailHeaders,
  type ConsentBasis,
  type ParsedEmailRow,
} from '@/lib/email/audience-import'

const MAX_ROWS = 10_000

function cellToString(v: string | number | Date | null | undefined): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) {
    const y = v.getUTCFullYear()
    const m = String(v.getUTCMonth() + 1).padStart(2, '0')
    const d = String(v.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(v).trim()
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const campaignId = Number(id)
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json(
      { success: false, error: 'Invalid campaign ID' },
      { status: 400 },
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()
  if (!profile || profile.role === 'viewer') {
    return NextResponse.json(
      { success: false, error: 'Insufficient permissions' },
      { status: 403 },
    )
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const consentBasis = String(formData.get('consent_basis') ?? '')
    const consentAttested = String(formData.get('consent_attested') ?? '')
    const listName = String(formData.get('list_name') ?? '').trim()

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 },
      )
    }
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      return NextResponse.json(
        { success: false, error: 'Only .csv, .xlsx and .xls files are supported' },
        { status: 400 },
      )
    }
    if (!(CONSENT_BASES as readonly string[]).includes(consentBasis)) {
      return NextResponse.json(
        { success: false, error: 'consent_basis required' },
        { status: 400 },
      )
    }
    if (consentAttested !== 'true') {
      return NextResponse.json(
        { success: false, error: 'Consent attestation is required' },
        { status: 400 },
      )
    }

    // ── Parse the spreadsheet (shape of sms-audience/import/parse) ──
    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(
      sheet,
      { header: 1, defval: null },
    )

    let headerRow: (string | number | Date | null)[] | undefined
    let headerRowIdx = -1
    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i]
      if (!row) continue
      const nonEmpty = row.filter(
        (c) => c !== null && c !== undefined && String(c).trim() !== '',
      ).length
      if (nonEmpty >= 2) {
        headerRow = row
        headerRowIdx = i
        break
      }
    }
    if (!headerRow) {
      return NextResponse.json(
        { success: false, error: 'No data found in file' },
        { status: 400 },
      )
    }

    const headers: string[] = []
    const headerIdxByCol: number[] = []
    headerRow.forEach((c, idx) => {
      const h = cellToString(c)
      if (h) {
        headers.push(h)
        headerIdxByCol.push(idx)
      }
    })

    const { missing } = mapEmailHeaders(headers)
    if (missing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Missing required columns: ${missing.join(', ')}. Expected columns for first name, last name and email.`,
        },
        { status: 400 },
      )
    }

    const dataRows: Record<string, string>[] = []
    for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
      const row = rawRows[i]
      if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === '')) {
        continue
      }
      const obj: Record<string, string> = {}
      headers.forEach((h, hi) => {
        obj[h] = cellToString(row[headerIdxByCol[hi]])
      })
      if (Object.values(obj).some((v) => v !== '')) dataRows.push(obj)
      if (dataRows.length > MAX_ROWS) {
        return NextResponse.json(
          { success: false, error: `File has more than ${MAX_ROWS} rows` },
          { status: 400 },
        )
      }
    }

    const parsed = parseEmailAudienceRows(dataRows, headers)

    // ── Match / create / link ────────────────────────────────
    const results: Array<{
      worker_id: number
      email: string
      action: 'matched' | 'created'
      email_opt_out: boolean
    }> = []
    const errors: Array<{ key: string; email?: string; reason: string }> = []

    const matchByEmail = async (
      row: ParsedEmailRow,
    ): Promise<{
      worker_id: number
      email_opt_out: boolean
      email_consent_source: string | null
    } | null> => {
      const { data } = await supabase
        .from('workers')
        .select('worker_id, email_opt_out, email_consent_source')
        .ilike('email', row.email)
        .limit(1)
        .maybeSingle()
      return (data as {
        worker_id: number
        email_opt_out: boolean
        email_consent_source: string | null
      } | null) ?? null
    }

    for (const row of parsed.rows) {
      try {
        const existing = await matchByEmail(row)
        if (existing) {
          await supabase.from('campaign_worker_membership').upsert(
            { campaign_id: campaignId, worker_id: existing.worker_id },
            { onConflict: 'campaign_id,worker_id', ignoreDuplicates: true },
          )
          // Never overwrite an existing consent trail or opt-out.
          if (!existing.email_consent_source) {
            await supabase
              .from('workers')
              .update({ email_consent_source: 'import' })
              .eq('worker_id', existing.worker_id)
              .is('email_consent_source', null)
          }
          results.push({
            worker_id: existing.worker_id,
            email: row.email,
            action: 'matched',
            email_opt_out: existing.email_opt_out ?? false,
          })
          continue
        }

        const { data: inserted, error: insErr } = await supabase
          .from('workers')
          .insert({
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            email_consent_source: 'import',
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .select('worker_id')
          .single()
        if (insErr || !inserted) {
          errors.push({
            key: row.key,
            email: row.email,
            reason: insErr?.message ?? 'Worker insert failed',
          })
          continue
        }
        await supabase.from('campaign_worker_membership').upsert(
          { campaign_id: campaignId, worker_id: inserted.worker_id as number },
          { onConflict: 'campaign_id,worker_id', ignoreDuplicates: true },
        )
        results.push({
          worker_id: inserted.worker_id as number,
          email: row.email,
          action: 'created',
          email_opt_out: false,
        })
      } catch (rowErr) {
        errors.push({
          key: row.key,
          email: row.email,
          reason: rowErr instanceof Error ? rowErr.message : 'Row failed',
        })
      }
    }

    // ── Optional email list ──────────────────────────────────
    let listId: number | null = null
    if (listName && results.length > 0) {
      const { data: list, error: listErr } = await supabase
        .from('email_lists')
        .insert({
          campaign_id: campaignId,
          name: listName.slice(0, 300),
          description: `Uploaded from ${file.name} (consent: ${consentBasis as ConsentBasis})`,
          status: 'draft',
          source_filters: { source: 'upload', file_name: file.name },
          total_items: results.length,
          created_by: user.id,
        })
        .select('list_id')
        .single()
      if (listErr || !list) {
        errors.push({ key: 'list', reason: listErr?.message ?? 'List create failed' })
      } else {
        listId = list.list_id as number
        const itemRows = results.map((r, i) => ({
          list_id: listId as number,
          worker_id: r.worker_id,
          email: r.email,
          sort_order: i,
          status: r.email_opt_out ? 'unsubscribed' : 'pending',
          send_status_detail: r.email_opt_out
            ? 'Worker has unsubscribed from email'
            : null,
        }))
        for (let i = 0; i < itemRows.length; i += 500) {
          const { error: itemErr } = await supabase
            .from('email_list_items')
            .insert(itemRows.slice(i, i + 500))
          if (itemErr) {
            errors.push({ key: 'list-items', reason: itemErr.message })
            break
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      total_rows: dataRows.length,
      accepted: parsed.rows.length,
      rejected: parsed.rejected,
      matched: results.filter((r) => r.action === 'matched').length,
      created: results.filter((r) => r.action === 'created').length,
      opted_out: results.filter((r) => r.email_opt_out).length,
      worker_ids: results.map((r) => r.worker_id),
      list_id: listId,
      errors,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unknown error occurred'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
