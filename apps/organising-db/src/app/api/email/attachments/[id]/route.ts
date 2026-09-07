import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const attachmentId = parseInt(id, 10)
    if (!Number.isFinite(attachmentId) || attachmentId <= 0) {
      return NextResponse.json({ error: 'Invalid attachment id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: attachment, error } = await supabase
      .from('email_message_attachments')
      .select('storage_bucket, storage_path, filename')
      .eq('attachment_id', attachmentId)
      .maybeSingle()
    if (error) throw error
    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from(attachment.storage_bucket)
      .createSignedUrl(attachment.storage_path, 60, {
        download: attachment.filename,
      })
    if (signedError) throw signedError
    return NextResponse.json({ url: signed.signedUrl })
  } catch (error) {
    console.error('GET email attachment error:', error)
    return errorResponse('Failed to open attachment', error)
  }
}
