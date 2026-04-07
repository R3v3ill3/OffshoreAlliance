'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import { Mail, MessageSquare, Phone, Pencil } from 'lucide-react'
import type { CommsPlatform, DraftStatus } from '@/types/planner-types'

const PLATFORM_ICONS: Record<CommsPlatform, React.ReactNode> = {
  email: <Mail className="h-4 w-4" />,
  sms: <MessageSquare className="h-4 w-4" />,
  phone_script: <Phone className="h-4 w-4" />,
}

const STATUS_BADGE: Record<DraftStatus, { label: string; className: string }> = {
  generating: { label: 'Generating', className: 'bg-yellow-100 text-yellow-700' },
  draft: { label: 'Draft', className: 'bg-blue-100 text-blue-700' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700' },
  sent: { label: 'Sent', className: 'bg-purple-100 text-purple-700' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-700' },
}

interface DraftPreviewProps {
  draft: {
    draft_id: number
    platform: CommsPlatform
    title: string | null
    subject: string | null
    body: string | null
    body_html: string | null
    status: DraftStatus
    tone: string | null
    audience_segment: string | null
    created_at: string
    ai_model_used: string | null
  }
}

export function DraftPreview({ draft }: DraftPreviewProps) {
  const icon = PLATFORM_ICONS[draft.platform] || PLATFORM_ICONS.email
  const statusConfig = STATUS_BADGE[draft.status] || STATUS_BADGE.draft
  const createdDate = new Date(draft.created_at).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{icon}</span>
            <CardTitle className="text-xs font-medium truncate">
              {draft.title || `${draft.platform} draft`}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className={cn('text-xs', statusConfig.className)}>
              {statusConfig.label}
            </Badge>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled title="Edit (coming soon)">
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-3 space-y-2">
        {draft.subject && (
          <p className="text-xs font-medium text-slate-700 truncate">
            Subject: {draft.subject}
          </p>
        )}

        <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
          {draft.body}
        </p>

        <div className="flex items-center justify-between pt-1 border-t">
          <div className="flex items-center gap-1.5">
            {draft.tone && (
              <Badge variant="outline" className="text-[10px]">{draft.tone}</Badge>
            )}
            {draft.audience_segment && (
              <Badge variant="outline" className="text-[10px]">{draft.audience_segment}</Badge>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">{createdDate}</span>
        </div>
      </CardContent>
    </Card>
  )
}
