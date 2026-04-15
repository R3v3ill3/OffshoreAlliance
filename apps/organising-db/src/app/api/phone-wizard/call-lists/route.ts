import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('call_lists')
      .select('*, call_scripts!script_id(script_id, title, status)')
      .is('campaign_id', null)
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('GET phone-wizard call-lists error:', error)
    return NextResponse.json({ error: 'Failed to fetch call lists' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { name, description, script_id, priority_strategy } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('call_lists')
      .insert({
        campaign_id: null,
        name,
        description: description || null,
        script_id: script_id || null,
        priority_strategy: priority_strategy || 'sequential',
        status: 'active',
        created_by: user.id,
      })
      .select('*, call_scripts!script_id(script_id, title, status)')
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('POST phone-wizard call-lists error:', error)
    return NextResponse.json({ error: 'Failed to create call list' }, { status: 500 })
  }
}
