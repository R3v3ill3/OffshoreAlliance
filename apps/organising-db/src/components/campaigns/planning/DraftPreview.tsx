'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import { Mail, MessageSquare, Phone, Pencil, Wand2, Users, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
    structured_script_id?: number | null
  }
  campaignId?: number | string
  onEdit?: () => void
}

export function DraftPreview({ draft, campaignId, onEdit }: DraftPreviewProps) {
  const router = useRouter()
  const pathname = usePathname()
  const returnTo = encodeURIComponent(pathname)
  const [isStructuring, setIsStructuring] = useState(false)

  const icon = PLATFORM_ICONS[draft.platform] || PLATFORM_ICONS.email
  const statusConfig = STATUS_BADGE[draft.status] || STATUS_BADGE.draft
  const createdDate = new Date(draft.created_at).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  async function handleStructureForCalling() {
    if (!campaignId) return
    setIsStructuring(true)
    try {
      // Step 1: parse the draft into SOC sections via AI
      const structureRes = await fetch(`/api/campaigns/${campaignId}/call-scripts/structure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_id: draft.draft_id }),
      })
      if (!structureRes.ok) {
        const err = await structureRes.json().catch(() => ({ error: 'Structure failed' }))
        throw new Error(err.error || 'Failed to structure script')
      }
      const { sections } = await structureRes.json()

      // Step 2: create the call_script record with the parsed sections and link the draft
      const createRes = await fetch(`/api/campaigns/${campaignId}/call-scripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title || 'Phone Script',
          draft_id: draft.draft_id,
          sections: sections || [],
        }),
      })
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({ error: 'Create failed' }))
        throw new Error(err.error || 'Failed to create script')
      }
      const newScript = await createRes.json()
      toast.success(`Script structured into ${sections?.length || 0} SOC sections`)
      router.push(`/campaigns/${campaignId}/phone/scripts/${newScript.script_id}?returnTo=${returnTo}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to structure script')
    } finally {
      setIsStructuring(false)
    }
  }

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
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onEdit}
              disabled={!onEdit}
              title={onEdit ? 'Edit draft' : 'Edit not available'}
            >
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

        {/* Phone script actions */}
        {draft.platform === 'phone_script' && campaignId && (
          <div className="flex items-center gap-1.5 pt-2 border-t">
            {draft.structured_script_id ? (
              <Button
                variant="outline" size="sm" className="h-6 text-xs flex-1"
                onClick={() => router.push(`/campaigns/${campaignId}/phone/scripts/${draft.structured_script_id}?returnTo=${returnTo}`)}
              >
                <Pencil className="h-3 w-3 mr-1" />
                Edit Script
              </Button>
            ) : (
              <Button
                variant="outline" size="sm" className="h-6 text-xs flex-1"
                onClick={handleStructureForCalling}
                disabled={isStructuring}
              >
                {isStructuring ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Wand2 className="h-3 w-3 mr-1" />
                )}
                {isStructuring ? 'Structuring…' : 'Structure for Calling'}
              </Button>
            )}
            <Button
              variant="outline" size="sm" className="h-6 text-xs flex-1"
              onClick={() => router.push(`/campaigns/${campaignId}/phone/lists/new?returnTo=${returnTo}`)}
            >
              <Users className="h-3 w-3 mr-1" />
              Create Call List
            </Button>
          </div>
        )}

        {/* Email actions */}
        {draft.platform === 'email' && campaignId && (
          <div className="flex items-center gap-1.5 pt-2 border-t">
            <Button
              variant="outline" size="sm" className="h-6 text-xs flex-1"
              onClick={() => router.push(`/campaigns/email-wizard?campaign_id=${campaignId}&draft_id=${draft.draft_id}`)}
            >
              <Users className="h-3 w-3 mr-1" />
              Build Email List
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
