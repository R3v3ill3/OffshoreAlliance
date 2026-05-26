/**
 * POST /api/campaigns/[id]/emails/[draftId]/record-local-send
 *
 * Records an email send that happened outside of the Graph API
 * (i.e. the user opened a mailto: link or downloaded an .eml file).
 *
 * Body: { worker_ids: number[], method: 'mailto' | 'eml' }
 *
 * Fire-and-forget from the client — returns 204 on success, never blocks
 * the UI. No conversationId is available for these paths.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordEmailSend, tagWorkerEmailed } from '@/lib/comms/send-log'

interface BodyShape {
  worker_ids: number[]
  method: 'mailto' | 'eml'
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; draftId: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, draftId: draftIdParam } = await ctx.params
  const campaignId = Number(id)
  const draftId = Number(draftIdParam)
  if (!Number.isFinite(campaignId) || !Number.isFinite(draftId)) {
    return new NextResponse(null, { status: 400 })
  }

  const body = (await req.json()) as BodyShape
  if (
    !Array.isArray(body?.worker_ids) ||
    body.worker_ids.length === 0 ||
    !['mailto', 'eml'].includes(body?.method)
  ) {
    return new NextResponse(null, { status: 400 })
  }

  // Look up worker emails via admin client.
  const admin = createAdminClient()
  const { data: workers, error: workersErr } = await admin
    .from('workers')
    .select('worker_id, email')
    .in('worker_id', body.worker_ids)
  if (workersErr) {
    return NextResponse.json({ error: workersErr.message }, { status: 500 })
  }

  // Record a send for each worker that has an email address.
  const sends = (workers ?? []).filter((w) => !!w.email && w.email.trim())
  await Promise.allSettled(
    sends.map((w) =>
      recordEmailSend({
        draftId,
        campaignId,
        workerId: w.worker_id,
        recipientEmail: w.email!,
        sendMethod: body.method,
        userId: user.id,
      }).then(() => tagWorkerEmailed(w.worker_id)),
    ),
  )

  return new NextResponse(null, { status: 204 })
}
