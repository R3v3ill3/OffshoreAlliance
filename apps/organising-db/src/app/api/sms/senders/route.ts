/**
 * Active SMS sender numbers for the composer's sender select.
 *
 * Returns sms_numbers (status='active') with the owning organiser's
 * name, plus `is_mine` when the organiser's email matches the signed-in
 * user (brief §7.0: default a blast's sender to the organiser's own
 * number when assigned).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: numbers, error } = await supabase
      .from('sms_numbers')
      .select('number_id, phone_e164, label, purpose, organiser_id, status')
      .eq('status', 'active')
      .order('number_id', { ascending: true })
    if (error) throw error

    const organiserIds = [
      ...new Set(
        (numbers ?? [])
          .map((n) => n.organiser_id)
          .filter((v): v is number => v != null),
      ),
    ]
    const organiserById = new Map<number, { name: string; email: string | null }>()
    if (organiserIds.length > 0) {
      const { data: organisers, error: orgErr } = await supabase
        .from('organisers')
        .select('organiser_id, organiser_name, email')
        .in('organiser_id', organiserIds)
      if (orgErr) throw orgErr
      for (const o of organisers ?? []) {
        organiserById.set(o.organiser_id, {
          name: o.organiser_name,
          email: o.email,
        })
      }
    }

    const userEmail = (user.email ?? '').toLowerCase()
    const result = (numbers ?? []).map((n) => {
      const org = n.organiser_id ? organiserById.get(n.organiser_id) : undefined
      return {
        number_id: n.number_id,
        phone_e164: n.phone_e164,
        label: n.label,
        purpose: n.purpose,
        organiser_id: n.organiser_id,
        organiser_name: org?.name ?? null,
        is_mine:
          !!userEmail && !!org?.email && org.email.toLowerCase() === userEmail,
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('GET sms senders error:', error)
    return errorResponse('Failed to fetch sender numbers', error)
  }
}
