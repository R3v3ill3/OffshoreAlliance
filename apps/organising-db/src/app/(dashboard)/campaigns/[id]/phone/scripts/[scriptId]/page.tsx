'use client'

import { useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallScript, useUpdateCallScriptSections, useUpdateCallScript, useStructureScript } from '@/lib/hooks/useCallScripts'
import { CallScriptEditor, sectionsToEditable } from '@/components/phone/CallScriptEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Wand2, Loader2, Phone, Target } from 'lucide-react'
import { toast } from 'sonner'
import { CallOutcomeEditor } from '@/components/phone/CallOutcomeEditor'
import type { ScriptStatus } from '@/types/planner-types'

export default function ScriptEditorPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const campaignId = params.id as string
  const scriptId = params.scriptId as string
  const backHref = searchParams.get('returnTo')
    ? decodeURIComponent(searchParams.get('returnTo')!)
    : `/campaigns/${campaignId}/phone`

  const { data: script, isLoading } = useCallScript(campaignId, scriptId)
  const updateSections = useUpdateCallScriptSections(campaignId, scriptId)
  const updateScript = useUpdateCallScript(campaignId)
  const structureScript = useStructureScript(campaignId)

  const [sections, setSections] = useState<ReturnType<typeof sectionsToEditable> | null>(null)
  const [saved, setSaved] = useState(true)

  const editableSections = sections ?? (
    script?.call_script_sections
      ? sectionsToEditable(
          [...script.call_script_sections].sort((a, b) => a.sort_order - b.sort_order)
        )
      : []
  )

  const handleSectionsChange = useCallback((newSections: typeof editableSections) => {
    setSections(newSections)
    setSaved(false)
  }, [])

  const handleSave = useCallback(async () => {
    try {
      const sectionData = editableSections.map((s, i) => ({
        sort_order: i,
        section_type: s.section_type,
        title: s.title,
        body_text: s.body_text,
        talking_points: s.talking_points,
        prompt_text: s.prompt_text,
        expected_outcomes: s.expected_outcomes,
        is_optional: s.is_optional,
      }))

      await updateSections.mutateAsync(sectionData)
      setSaved(true)
      toast.success('Sections saved')
    } catch {
      toast.error('Failed to save sections')
    }
  }, [editableSections, updateSections])

  const handleAutoStructure = useCallback(async () => {
    if (!script?.draft_id) {
      toast.error('No linked draft to structure from')
      return
    }

    try {
      const result = await structureScript.mutateAsync({ draft_id: script.draft_id })
      if (result.sections && result.sections.length > 0) {
        setSections(sectionsToEditable(result.sections as Parameters<typeof sectionsToEditable>[0]))
        setSaved(false)
        toast.success(`Parsed ${result.sections.length} sections from script`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to structure script')
    }
  }, [script, structureScript])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!script) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Script not found</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(backHref)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Phone className="h-5 w-5" />
            {script.title}
          </h2>
          <p className="text-sm text-muted-foreground">
            Edit script sections for the phone call wizard
          </p>
        </div>
        <Badge variant={script.status === 'active' ? 'default' : 'secondary'}>
          {script.status}
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Script Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Input
                defaultValue={script.title}
                onBlur={(e) => {
                  if (e.target.value !== script.title) {
                    updateScript.mutate({ scriptId: script.script_id, title: e.target.value } as Parameters<typeof updateScript.mutate>[0])
                  }
                }}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select
                value={script.status}
                onValueChange={(v) => updateScript.mutate({ scriptId: script.script_id, status: v as ScriptStatus } as Parameters<typeof updateScript.mutate>[0])}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Call Objective</Label>
            <Textarea
              defaultValue={script.call_objective || ''}
              onBlur={(e) => {
                updateScript.mutate({ scriptId: script.script_id, call_objective: e.target.value || null } as Parameters<typeof updateScript.mutate>[0])
              }}
              placeholder="What is the primary objective of this call?"
              rows={2}
              className="text-xs"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Script Sections</h3>
        {script.draft_id && (
          <Button
            variant="outline" size="sm"
            onClick={handleAutoStructure}
            disabled={structureScript.isPending}
          >
            {structureScript.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4 mr-1" />
            )}
            Auto-Structure from Draft
          </Button>
        )}
      </div>

      <CallScriptEditor
        sections={editableSections}
        onChange={handleSectionsChange}
        onSave={handleSave}
        isSaving={updateSections.isPending}
        saved={saved}
      />

      {/* Call Outcomes */}
      <CallOutcomeEditor
        campaignId={parseInt(campaignId)}
        scriptId={parseInt(scriptId)}
        scriptTitle={script.title}
      />

      {/* Action footer */}
      <div className="flex items-center gap-3 pt-4 border-t">
        <Button
          onClick={() => router.push(`/campaigns/${campaignId}/phone/lists/new?script_id=${scriptId}`)}
        >
          <Phone className="h-4 w-4 mr-1" />
          Create Call List with This Script
        </Button>
        <Button
          variant="outline"
          onClick={() => router.push(`/campaigns/${campaignId}/phone`)}
        >
          Phone Operations
        </Button>
      </div>
    </div>
  )
}
