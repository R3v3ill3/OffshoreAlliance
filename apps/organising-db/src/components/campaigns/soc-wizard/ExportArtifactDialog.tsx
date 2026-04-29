'use client'

/**
 * Export dialog for SOC artifacts. Calls /api/soc-wizard/derive-artifact.
 *
 * For email/sms/phone_script: creates a campaign_comms_drafts row and
 * surfaces a success toast with a deep link to the email/phone wizard
 * loaded with the new draft as starting context.
 *
 * For snippet: returns inline body which the user can copy or paste
 * into another tool.
 */

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Mail, MessageSquare, Phone, ClipboardCopy } from 'lucide-react'
import { useDeriveArtifact } from '@/lib/hooks/useSocWizard'
import type { HopeFrame, SocStage } from '@/lib/prompts/soc-framework'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  session_id: number
  campaign_id: number | null
  stage_number?: SocStage
  hope_frame?: HopeFrame
  defaultKind?: 'email' | 'sms' | 'phone_script' | 'snippet'
  scopeLabel?: string
}

const KIND_META = {
  email: { label: 'Email', icon: Mail },
  sms: { label: 'SMS', icon: MessageSquare },
  phone_script: { label: 'Phone script', icon: Phone },
  snippet: { label: 'Snippet', icon: ClipboardCopy },
} as const

export function ExportArtifactDialog({
  open,
  onOpenChange,
  session_id,
  campaign_id,
  stage_number,
  hope_frame,
  defaultKind = 'email',
  scopeLabel,
}: Props) {
  const [kind, setKind] = useState<keyof typeof KIND_META>(defaultKind)
  const [tone, setTone] = useState('')
  const [audience, setAudience] = useState('')
  const [snippetResult, setSnippetResult] = useState<string | null>(null)
  const derive = useDeriveArtifact()

  async function handleExport() {
    setSnippetResult(null)
    try {
      const result = await derive.mutateAsync({
        session_id,
        artifact_kind: kind,
        stage_number,
        hope_frame,
        campaign_id: campaign_id ?? undefined,
        tone: tone || undefined,
        audience: audience || undefined,
      })
      if (kind === 'snippet') {
        setSnippetResult(result.body as string)
        toast.success('Snippet ready — copy below.')
      } else {
        toast.success(
          `${KIND_META[kind].label} draft created. Find it in the campaign's stage capacities to edit, send, or refine.`
        )
        onOpenChange(false)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    }
  }

  function copySnippet() {
    if (!snippetResult) return
    navigator.clipboard.writeText(snippetResult).then(
      () => toast.success('Copied to clipboard'),
      () => toast.error('Could not copy'),
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export SOC content</DialogTitle>
          <DialogDescription>
            {scopeLabel
              ? `Convert "${scopeLabel}" into another format.`
              : 'Convert the locked SOC stages into another format.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Format</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {(['email', 'sms', 'phone_script', 'snippet'] as const).map((k) => {
                const meta = KIND_META[k]
                const Icon = meta.icon
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={
                      'flex items-center gap-2 px-3 py-2 rounded-md border text-sm ' +
                      (kind === k
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 hover:border-slate-300')
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          {kind !== 'snippet' && (
            <>
              {!campaign_id && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  This SOC was created standalone. Email / SMS / phone exports need a campaign — open the SOC against a campaign or copy as a snippet instead.
                </div>
              )}
              <div>
                <Label className="text-xs">Tone (optional)</Label>
                <Input
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  placeholder="e.g. urgency, solidarity, fairness"
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Audience (optional)</Label>
                <Input
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="e.g. shutdown crew, permanent workforce"
                  className="text-sm"
                />
              </div>
            </>
          )}

          {snippetResult && (
            <div>
              <Label className="text-xs">Snippet</Label>
              <Textarea value={snippetResult} readOnly className="min-h-[160px] text-sm font-mono" />
              <div className="mt-2 flex justify-end">
                <Button variant="outline" size="sm" onClick={copySnippet}>
                  <ClipboardCopy className="h-4 w-4" />
                  Copy
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            onClick={handleExport}
            disabled={derive.isPending || (kind !== 'snippet' && !campaign_id)}
          >
            {derive.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
