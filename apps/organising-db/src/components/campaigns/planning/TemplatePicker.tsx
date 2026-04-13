'use client'

import { useState, useMemo } from 'react'
import { useTemplateLibrary, type TemplateRow } from '@/lib/hooks/useTemplateLibrary'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Search, FileText, Sparkles, Loader2 } from 'lucide-react'
import type { CommsPlatform } from '@/types/planner-types'

const STAGE_NAMES: Record<number, string> = {
  1: 'Contact ID & Mapping',
  2: 'Intro Comms & Education',
  3: 'Member Mobilisation',
  4: 'Develop Claims / MSD',
  5: 'Endorsement & Commence Bargaining',
  6: 'Bargaining to Win',
}

const TONE_LABELS: Record<string, string> = {
  informative: 'Informative',
  urgency: 'Urgency',
  shared_responsibility: 'Shared Responsibility',
  success_story: 'Success Story',
  solidarity: 'Solidarity',
  fairness: 'Fairness',
  worker_voice: 'Worker Voice',
  job_security: 'Job Security',
}

interface TemplatePickerProps {
  open: boolean
  onClose: () => void
  onSelect: (template: TemplateRow) => void
  onSelectAndCustomise: (template: TemplateRow) => void
  platform: CommsPlatform
  stageNumber: number
  isCustomising?: number | null
}

export function TemplatePicker({
  open,
  onClose,
  onSelect,
  onSelectAndCustomise,
  platform,
  stageNumber,
  isCustomising,
}: TemplatePickerProps) {
  const [search, setSearch] = useState('')
  const { data: templates, isLoading } = useTemplateLibrary({
    platform,
    is_active: true,
  })

  const filtered = useMemo(() => {
    if (!templates) return []
    let result = templates

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.body_text.toLowerCase().includes(q) ||
          (t.subject_line && t.subject_line.toLowerCase().includes(q))
      )
    }

    return result.sort((a, b) => {
      const aMatch = a.stage_number === stageNumber ? 1 : 0
      const bMatch = b.stage_number === stageNumber ? 1 : 0
      return bMatch - aMatch
    })
  }, [templates, search, stageNumber])

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-5xl min-w-[800px] max-h-[80vh] overflow-y-auto resize-x">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Select a Template
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No {platform} templates found.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((template) => (
              <Card
                key={template.template_id}
                className="hover:border-primary/30 transition-colors"
              >
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {template.title}
                      </p>
                      {template.subject_line && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          Subject: {template.subject_line}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => onSelect(template)}
                      >
                        Use As-Is
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => onSelectAndCustomise(template)}
                        disabled={isCustomising === template.template_id}
                      >
                        {isCustomising === template.template_id ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Sparkles className="h-3 w-3 mr-1" />
                        )}
                        Customise
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {template.stage_number && (
                      <Badge
                        variant={
                          template.stage_number === stageNumber
                            ? 'default'
                            : 'secondary'
                        }
                        className="text-xs"
                      >
                        Stage {template.stage_number}
                        {template.stage_number === stageNumber && ' (match)'}
                      </Badge>
                    )}
                    {template.tone_tags?.map((t) => (
                      <Badge
                        key={t}
                        variant="outline"
                        className="text-xs"
                      >
                        {TONE_LABELS[t] ?? t}
                      </Badge>
                    ))}
                    {template.audience_segment && (
                      <Badge variant="outline" className="text-xs">
                        {template.audience_segment.replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {template.body_text.slice(0, 200)}
                    {template.body_text.length > 200 ? '...' : ''}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
