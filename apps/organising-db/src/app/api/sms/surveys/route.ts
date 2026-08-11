/**
 * GET /api/sms/surveys — org-wide SMS survey catalogue for duplication.
 *
 * Authenticated staff can read every sms_surveys row (SELECT USING true);
 * returns a compact list with campaign name + question count so a draft
 * in one campaign can clone a definition from any other.
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

    const { data: surveys, error } = await supabase
      .from('sms_surveys')
      .select(
        `
        survey_id,
        campaign_id,
        title,
        status,
        purpose,
        created_at,
        updated_at,
        campaign:campaigns(campaign_id, name),
        questions:sms_survey_questions(count)
      `,
      )
      .order('updated_at', { ascending: false })
      .limit(500)
    if (error) throw error

    const rows = (surveys ?? []).map((row) => {
      const campaign = Array.isArray(row.campaign)
        ? row.campaign[0]
        : row.campaign
      const countRow = Array.isArray(row.questions)
        ? row.questions[0]
        : row.questions
      return {
        survey_id: row.survey_id as number,
        campaign_id: row.campaign_id as number,
        campaign_name:
          (campaign as { name?: string } | null)?.name ??
          `Campaign #${row.campaign_id}`,
        title: row.title as string,
        status: row.status as string,
        purpose: (row.purpose as string) ?? 'survey',
        question_count: Number(
          (countRow as { count?: number } | null)?.count ?? 0,
        ),
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
      }
    })

    return NextResponse.json(rows)
  } catch (error) {
    console.error('GET /api/sms/surveys error:', error)
    return errorResponse('Failed to fetch SMS surveys', error)
  }
}
