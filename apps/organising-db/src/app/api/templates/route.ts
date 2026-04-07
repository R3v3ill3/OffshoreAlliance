import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const platform = searchParams.get('platform')
    const stageNumber = searchParams.get('stage_number')
    const isActive = searchParams.get('is_active')

    let query = supabase
      .from('comms_template_library')
      .select('*')
      .order('created_at', { ascending: false })

    if (platform) {
      query = query.eq('platform', platform)
    }
    if (stageNumber) {
      query = query.eq('stage_number', Number(stageNumber))
    }
    query = query.eq('is_active', isActive !== 'false')

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (error) {
    console.error('Templates GET error:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    if (!body.title || !body.body_text || !body.platform) {
      return NextResponse.json(
        { error: 'title, body_text, and platform are required' },
        { status: 400 },
      )
    }

    const { data, error } = await supabase
      .from('comms_template_library')
      .insert({
        title: body.title,
        subject_line: body.subject_line ?? null,
        body_html: body.body_html ?? null,
        body_text: body.body_text,
        stage_number: body.stage_number ?? null,
        activity_type: body.activity_type ?? null,
        tone_tags: body.tone_tags ?? null,
        audience_segment: body.audience_segment ?? null,
        platform: body.platform,
        variables: body.variables ?? null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Templates POST error:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { template_id, ...updates } = body

    if (!template_id) {
      return NextResponse.json({ error: 'template_id is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('comms_template_library')
      .update(updates)
      .eq('template_id', template_id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Templates PUT error:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const templateId = searchParams.get('template_id')

    if (!templateId) {
      return NextResponse.json({ error: 'template_id is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('comms_template_library')
      .update({ is_active: false })
      .eq('template_id', Number(templateId))

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Templates DELETE error:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
