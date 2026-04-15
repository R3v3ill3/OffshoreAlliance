import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const workerIds: number[] = body.worker_ids || []

    if (workerIds.length === 0) {
      return NextResponse.json({ error: 'worker_ids is required and must not be empty' }, { status: 400 })
    }

    // Fetch the workers to verify they have phone numbers and build list items
    const { data: workers, error: workerErr } = await supabase
      .from('workers')
      .select('worker_id, phone')
      .in('worker_id', workerIds)

    if (workerErr) throw workerErr

    const withPhone = (workers || []).filter((w) => w.phone && w.phone.trim() !== '')
    const withPhoneIds = new Set(withPhone.map((w) => w.worker_id))

    // Skip workers already on the list
    const { data: existingItems } = await supabase
      .from('call_list_items')
      .select('worker_id')
      .eq('list_id', parseInt(listId))

    const existingWorkerIds = new Set((existingItems || []).map((i) => i.worker_id))

    const newItems = workerIds
      .filter((id) => withPhoneIds.has(id) && !existingWorkerIds.has(id))
      .map((worker_id, i) => ({
        list_id: parseInt(listId),
        worker_id,
        sort_order: i,
        priority_score: 0,
        status: 'pending' as const,
      }))

    if (newItems.length === 0) {
      return NextResponse.json({
        message: 'No new workers to add (all already on list or have no phone number)',
        added: 0,
        skipped_no_phone: workerIds.filter((id) => !withPhoneIds.has(id)).length,
        skipped_duplicate: workerIds.filter((id) => existingWorkerIds.has(id)).length,
      })
    }

    const { error: insertErr } = await supabase
      .from('call_list_items')
      .insert(newItems)

    if (insertErr) throw insertErr

    // Update total_items count on the list
    await supabase
      .from('call_lists')
      .update({ total_items: (existingItems?.length || 0) + newItems.length })
      .eq('list_id', parseInt(listId))

    return NextResponse.json({
      message: `Added ${newItems.length} contacts to the call list`,
      added: newItems.length,
      skipped_no_phone: workerIds.filter((id) => !withPhoneIds.has(id)).length,
      skipped_duplicate: workerIds.filter((id) => existingWorkerIds.has(id)).length,
    })
  } catch (error) {
    console.error('Populate phone-wizard call-list error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to populate list' },
      { status: 500 }
    )
  }
}
