/**
 * GET /api/campaigns/[id]/sms-surveys/[surveyId]/document
 *
 * The survey as a Word document, for the members SMS cannot reach —
 * no mobile on file, an overseas number the provider will not carry,
 * or someone who simply asks for it by email. Editable on purpose: an
 * organiser usually wants to add a covering line or a return address
 * before sending it on.
 *
 * Layout decisions live in lib/sms/survey-document.ts so they can be
 * tested without generating a file; this route only assembles them.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'
import { createClient } from '@/lib/supabase/server'
import { errorResponse } from '@/lib/api/error-response'
import {
  buildPrintableSurvey,
  printableSurveyFilename,
  type AnswerLine,
} from '@/lib/sms/survey-document'
import type { SmsSurveyQuestionRow } from '@/types/sms'

/** A ruled blank to hand-write on — a bottom border, no text. */
function ruledLine(): Paragraph {
  return new Paragraph({
    spacing: { before: 160, after: 160 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 },
    },
    children: [new TextRun('')],
  })
}

function answerParagraph(line: AnswerLine): Paragraph {
  if (line.ruled) return ruledLine()
  return new Paragraph({
    spacing: { after: 80 },
    indent: { left: 360 },
    children: [new TextRun({ text: line.text, size: 22 })],
  })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; surveyId: string }> },
) {
  try {
    const { id, surveyId } = await params
    const cid = parseInt(id, 10)
    const sid = parseInt(surveyId, 10)
    if (!Number.isFinite(cid) || !Number.isFinite(sid)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: survey, error: sErr } = await supabase
      .from('sms_surveys')
      .select('survey_id, campaign_id, title, invitation_body, campaigns(name)')
      .eq('survey_id', sid)
      .maybeSingle()
    if (sErr) throw sErr
    if (!survey || survey.campaign_id !== cid) {
      return NextResponse.json({ error: 'Survey not found' }, { status: 404 })
    }

    const { data: questions, error: qErr } = await supabase
      .from('sms_survey_questions')
      .select('*')
      .eq('survey_id', sid)
      .order('sort_order', { ascending: true })
    if (qErr) throw qErr

    const model = buildPrintableSurvey({
      title: survey.title as string,
      campaignName:
        (survey as unknown as { campaigns: { name: string } | null }).campaigns
          ?.name ?? null,
      invitationBody: survey.invitation_body as string | null,
      questions: (questions ?? []) as SmsSurveyQuestionRow[],
    })

    const children: Paragraph[] = [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: model.title, bold: true })],
      }),
    ]

    if (model.campaignName) {
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: model.campaignName,
              italics: true,
              color: '555555',
            }),
          ],
        }),
      )
    }

    if (model.intro) {
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: model.intro, size: 22 })],
        }),
      )
    }

    children.push(
      new Paragraph({
        spacing: { after: 240 },
        children: [
          new TextRun({
            text: 'Tick one answer per question, then return this form to your organiser.',
            size: 20,
            color: '555555',
          }),
        ],
      }),
    )

    // Name and contact: a returned paper form carries no phone number to
    // match it back to a member, so ask on the page rather than guess.
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: 'Name: ', bold: true, size: 22 })],
      }),
      ruledLine(),
      new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [
          new TextRun({ text: 'Worksite / employer: ', bold: true, size: 22 }),
        ],
      }),
      ruledLine(),
    )

    for (const question of model.questions) {
      children.push(
        new Paragraph({
          spacing: { before: 320, after: 100 },
          keepNext: true,
          children: [
            new TextRun({
              text: `${question.number}. ${question.prompt}`,
              bold: true,
              size: 24,
            }),
          ],
        }),
      )
      for (const line of question.answers) {
        children.push(answerParagraph(line))
      }
    }

    if (model.questions.length === 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'This survey has no questions yet.',
              italics: true,
            }),
          ],
        }),
      )
    }

    children.push(
      new Paragraph({
        spacing: { before: 400 },
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'Offshore Alliance',
            size: 18,
            color: '777777',
          }),
        ],
      }),
    )

    const doc = new Document({ sections: [{ children }] })
    const buffer = await Packer.toBuffer(doc)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${printableSurveyFilename(
          model.title,
        )}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('GET sms-survey document error:', error)
    return errorResponse('Failed to build the survey document', error)
  }
}
