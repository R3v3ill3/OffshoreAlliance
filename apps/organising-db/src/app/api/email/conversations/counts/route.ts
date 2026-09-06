import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const campaignRaw = req.nextUrl.searchParams.get('campaign_id')
    const campaignId = campaignRaw ? parseInt(campaignRaw, 10) : null
    type Queue =
      | 'mine'
      | 'needs_response'
      | 'unassigned'
      | 'triage'
      | 'waiting'
      | 'team'
      | 'closed'
      | 'all'
    const count = async (queue: Queue) => {
      let query = supabase
        .from('email_conversations')
        .select('conversation_id', { count: 'exact', head: true })
      if (campaignId != null && Number.isFinite(campaignId)) {
        query = query.eq('campaign_id', campaignId)
      }
      switch (queue) {
        case 'mine':
          query = query.eq('assignee_user_id', user.id).neq('state', 'closed')
          break
        case 'needs_response':
          query = query.eq('state', 'needs_response')
          break
        case 'unassigned':
          query = query
            .is('assignee_user_id', null)
            .not('state', 'in', '(closed,triage)')
          break
        case 'triage':
          query = query.eq('state', 'triage')
          break
        case 'waiting':
          query = query.in('state', ['convo', 'messaged'])
          break
        case 'team':
          query = query.neq('state', 'closed')
          break
        case 'closed':
          query = query.eq('state', 'closed')
          break
        case 'all':
          break
      }
      const { count: total, error } = await query
      if (error) throw error
      return total ?? 0
    }

    const [
      mine,
      needsResponse,
      unassigned,
      triage,
      waiting,
      team,
      closed,
      all,
    ] = await Promise.all([
      count('mine'),
      count('needs_response'),
      count('unassigned'),
      count('triage'),
      count('waiting'),
      count('team'),
      count('closed'),
      count('all'),
    ])

    return NextResponse.json({
      mine,
      needs_response: needsResponse,
      unassigned,
      triage,
      waiting,
      team,
      closed,
      all,
    })
  } catch (error) {
    console.error('GET email conversation counts error:', error)
    return errorResponse('Failed to load queue counts', error)
  }
}
