import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('call_scripts')
      .select('*, call_script_sections(*)')
      .is('campaign_id', null)
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('GET phone-wizard scripts error:', error)
    return NextResponse.json({ error: 'Failed to fetch scripts' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { title, call_objective, estimated_duration_minutes, sections, base_script_id } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const { data: script, error: scriptError } = await supabase
      .from('call_scripts')
      .insert({
        campaign_id: null,
        base_script_id: base_script_id != null ? parseInt(String(base_script_id), 10) : null,
        title,
        call_objective: call_objective || null,
        estimated_duration_minutes: estimated_duration_minutes || null,
        status: 'draft',
        created_by: user.id,
      })
      .select()
      .single()

    if (scriptError) throw scriptError

    if (sections && Array.isArray(sections) && sections.length > 0) {
      const sectionRows = sections.map((s: Record<string, unknown>, i: number) => ({
        script_id: script.script_id,
        sort_order: s.sort_order ?? i,
        section_type: s.section_type || 'custom',
        title: s.title || `Section ${i + 1}`,
        body_text: s.body_text || '',
        talking_points: s.talking_points || [],
        prompt_text: s.prompt_text || null,
        expected_outcomes: s.expected_outcomes || [],
        is_optional: s.is_optional || false,
      }))

      const { error: sectionsError } = await supabase
        .from('call_script_sections')
        .insert(sectionRows)

      if (sectionsError) throw sectionsError
    }

    const { data: fullScript } = await supabase
      .from('call_scripts')
      .select('*, call_script_sections(*)')
      .eq('script_id', script.script_id)
      .single()

    return NextResponse.json(fullScript, { status: 201 })
  } catch (error) {
    console.error('POST phone-wizard scripts error:', error)
    return NextResponse.json({ error: 'Failed to create script' }, { status: 500 })
  }
}
