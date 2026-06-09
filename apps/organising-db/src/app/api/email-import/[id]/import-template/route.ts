import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { applyVariableReplacements } from '@/lib/comms/template-variables'
import { stripImportedEmailSignatureBlocks } from '@/lib/comms/sanitise-email-html'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const importId = parseInt(id)
    if (isNaN(importId)) {
      return NextResponse.json({ error: 'Invalid import ID' }, { status: 400 })
    }

    const body = await req.json()
    const overrides = body as {
      title?: string
      stage_number?: number
      tone_tags?: string[]
      audience_segment?: string
      activity_type?: string
      variable_replacements?: Array<{ original_text: string; variable: string; accepted: boolean }>
    }

    const { data: emailImport, error: fetchError } = await supabase
      .from('email_imports')
      .select('*')
      .eq('import_id', importId)
      .single()

    if (fetchError || !emailImport) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 })
    }

    if (emailImport.imported_template_id) {
      return NextResponse.json(
        { error: 'This email has already been imported as a template', template_id: emailImport.imported_template_id },
        { status: 409 },
      )
    }

    const analysis = (emailImport.ai_analysis as Record<string, unknown>) || {}

    const designMetadata = analysis.design_elements ?? null

    const acceptedReplacements = (overrides.variable_replacements ?? []).filter((r) => r.accepted)

    let bodyText = emailImport.body_text || ''
    let bodyHtml = emailImport.body_html ?? null
    let subjectLine = emailImport.subject

    if (acceptedReplacements.length > 0) {
      bodyText = applyVariableReplacements(bodyText, acceptedReplacements)
      if (bodyHtml) {
        bodyHtml = applyVariableReplacements(bodyHtml, acceptedReplacements)
      }
      subjectLine = applyVariableReplacements(subjectLine, acceptedReplacements)
    }

    const screenedContent = stripImportedEmailSignatureBlocks({
      bodyText,
      bodyHtml,
    })
    bodyText = screenedContent.bodyText
    bodyHtml = screenedContent.bodyHtml

    const usedVariableKeys = [...new Set(acceptedReplacements.map((r) => r.variable))]
    const variables = usedVariableKeys.length > 0
      ? usedVariableKeys.reduce((acc: Record<string, string>, v: string) => {
          acc[v] = `{{${v}}}`
          return acc
        }, {})
      : null

    const { data: template, error: insertError } = await supabase
      .from('comms_template_library')
      .insert({
        title: overrides.title || (analysis.suggested_title as string) || emailImport.subject,
        subject_line: subjectLine,
        body_html: bodyHtml,
        body_text: bodyText,
        stage_number: overrides.stage_number ?? (analysis.stage_number as number) ?? null,
        activity_type: overrides.activity_type || (analysis.activity_type as string) || null,
        tone_tags: overrides.tone_tags || (analysis.tone_tags as string[]) || null,
        audience_segment: overrides.audience_segment || (analysis.audience_segment as string) || null,
        platform: 'email',
        variables,
        source_import_id: importId,
        design_metadata: designMetadata,
        created_by: user.id,
      })
      .select()
      .single()

    if (insertError) throw insertError

    const { error: updateError } = await supabase
      .from('email_imports')
      .update({
        analysis_status: 'imported',
        imported_template_id: template.template_id,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('import_id', importId)

    if (updateError) {
      console.error('Failed to update import status:', updateError)
    }

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    console.error('Import template error:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
