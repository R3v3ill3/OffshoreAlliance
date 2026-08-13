/**
 * PATCH  — rename a hidden SMS episode (name follows the blast/survey/chat).
 * DELETE — drop an abandoned episode (creator/admin via RLS). CASCADE
 *          removes lists and surveys.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200),
})

async function loadEpisode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  campaignId: number,
) {
  const { data, error } = await supabase
    .from('campaigns')
    .select('campaign_id, name, is_sms_episode, created_by')
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const campaignId = Number(id)
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const episode = await loadEpisode(supabase, campaignId)
    if (!episode?.is_sms_episode) {
      return NextResponse.json({ error: 'Not a standalone SMS episode' }, { status: 404 })
    }

    let body: z.infer<typeof patchSchema>
    try {
      body = patchSchema.parse(await req.json())
    } catch (err) {
      const message =
        err instanceof z.ZodError
          ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
          : 'Invalid request body'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('campaigns')
      .update({ name: body.name })
      .eq('campaign_id', campaignId)
      .eq('is_sms_episode', true)
      .select('campaign_id, name, created_at, created_by')
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('PATCH /api/sms/episodes/[id] error:', error)
    return errorResponse('Failed to rename SMS episode', error)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const campaignId = Number(id)
    if (!Number.isFinite(campaignId)) {
      return NextResponse.json({ error: 'Invalid campaign id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const episode = await loadEpisode(supabase, campaignId)
    if (!episode?.is_sms_episode) {
      return NextResponse.json({ error: 'Not a standalone SMS episode' }, { status: 404 })
    }

    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('is_sms_episode', true)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/sms/episodes/[id] error:', error)
    return errorResponse('Failed to delete SMS episode', error)
  }
}
