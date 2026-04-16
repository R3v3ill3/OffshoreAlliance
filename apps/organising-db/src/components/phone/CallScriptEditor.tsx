'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils/cn'
import {
  GripVertical, Plus, Trash2, ChevronDown, ChevronUp,
  Save, Loader2, Wand2, CheckCircle,
} from 'lucide-react'
import { SECTION_TYPES } from '@/lib/phone/disposition-types'
import type { CallScriptSection, ScriptSectionType } from '@/types/planner-types'
import { toast } from 'sonner'

type EditableSection = Omit<CallScriptSection, 'section_id' | 'script_id' | 'created_at' | 'updated_at'> & {
  _key: string
}

interface CallScriptEditorProps {
  sections: EditableSection[]
  onChange: (sections: EditableSection[]) => void
  onSave?: () => void
  isSaving?: boolean
  saved?: boolean
}

function createEmptySection(sortOrder: number): EditableSection {
  return {
    _key: `new-${Date.now()}-${Math.random()}`,
    sort_order: sortOrder,
    section_type: 'custom',
    title: '',
    body_text: '',
    talking_points: [],
    prompt_text: null,
    expected_outcomes: [],
    is_optional: false,
  }
}

/** Exported for phone wizard and other flows that start from an empty section list. */
export function createEmptyEditableSection(sortOrder: number): EditableSection {
  return createEmptySection(sortOrder)
}

export type { EditableSection }

export function CallScriptEditor({
  sections,
  onChange,
  onSave,
  isSaving,
  saved,
}: CallScriptEditorProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    sections.length > 0 ? 0 : null
  )
  const [newTalkingPoint, setNewTalkingPoint] = useState<Record<string, string>>({})

  const updateSection = useCallback((index: number, updates: Partial<EditableSection>) => {
    const updated = [...sections]
    updated[index] = { ...updated[index], ...updates }
    onChange(updated)
  }, [sections, onChange])

  const removeSection = useCallback((index: number) => {
    const updated = sections.filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, sort_order: i }))
    onChange(updated)
    if (expandedIndex === index) setExpandedIndex(null)
    else if (expandedIndex !== null && expandedIndex > index) setExpandedIndex(expandedIndex - 1)
  }, [sections, onChange, expandedIndex])

  const addSection = useCallback(() => {
    const newSection = createEmptySection(sections.length)
    onChange([...sections, newSection])
    setExpandedIndex(sections.length)
  }, [sections, onChange])

  const moveSection = useCallback((fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1
    if (toIndex < 0 || toIndex >= sections.length) return

    const updated = [...sections]
    const temp = updated[fromIndex]
    updated[fromIndex] = { ...updated[toIndex], sort_order: fromIndex }
    updated[toIndex] = { ...temp, sort_order: toIndex }
    onChange(updated)

    if (expandedIndex === fromIndex) setExpandedIndex(toIndex)
    else if (expandedIndex === toIndex) setExpandedIndex(fromIndex)
  }, [sections, onChange, expandedIndex])

  const addTalkingPoint = useCallback((index: number) => {
    const key = sections[index]._key
    const text = newTalkingPoint[key]?.trim()
    if (!text) return

    const points = [...(sections[index].talking_points || []), text]
    updateSection(index, { talking_points: points })
    setNewTalkingPoint((prev) => ({ ...prev, [key]: '' }))
  }, [sections, updateSection, newTalkingPoint])

  const removeTalkingPoint = useCallback((sectionIndex: number, pointIndex: number) => {
    const points = [...(sections[sectionIndex].talking_points || [])]
    points.splice(pointIndex, 1)
    updateSection(sectionIndex, { talking_points: points })
  }, [sections, updateSection])

  return (
    <div className="space-y-3">
      {sections.map((section, index) => {
        const sectionConfig = SECTION_TYPES.find((t) => t.value === section.section_type)
        const isExpanded = expandedIndex === index

        return (
          <Card key={section._key} className={cn('overflow-hidden', isExpanded && 'ring-1 ring-primary/30')}>
            <CardHeader
              className="cursor-pointer py-3 px-4"
              onClick={() => setExpandedIndex(isExpanded ? null : index)}
            >
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <Badge variant="secondary" className="text-xs">
                  {index + 1}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {sectionConfig?.label || section.section_type}
                </Badge>
                <CardTitle className="text-sm flex-1 truncate">
                  {section.title || 'Untitled Section'}
                </CardTitle>
                {section.is_optional && (
                  <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700">
                    Optional
                  </Badge>
                )}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost" size="sm" className="h-6 w-6 p-0"
                    onClick={(e) => { e.stopPropagation(); moveSection(index, 'up') }}
                    disabled={index === 0}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost" size="sm" className="h-6 w-6 p-0"
                    onClick={(e) => { e.stopPropagation(); moveSection(index, 'down') }}
                    disabled={index === sections.length - 1}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive"
                    onClick={(e) => { e.stopPropagation(); removeSection(index) }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Section Type</Label>
                    <Select
                      value={section.section_type}
                      onValueChange={(v) => updateSection(index, { section_type: v as ScriptSectionType })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SECTION_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            <div>
                              <span className="font-medium">{t.label}</span>
                              <span className="text-muted-foreground ml-1 text-xs">— {t.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Title</Label>
                    <Input
                      value={section.title}
                      onChange={(e) => updateSection(index, { title: e.target.value })}
                      placeholder="Section title..."
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Script Text</Label>
                  <Textarea
                    value={section.body_text}
                    onChange={(e) => updateSection(index, { body_text: e.target.value })}
                    placeholder="Full script text for this section..."
                    rows={5}
                    className="text-sm font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Caller Prompt (shown during calls)</Label>
                  <Input
                    value={section.prompt_text || ''}
                    onChange={(e) => updateSection(index, { prompt_text: e.target.value || null })}
                    placeholder="Short prompt, max ~80 chars..."
                    maxLength={120}
                    className="h-8 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {(section.prompt_text || '').length}/120 — keep this concise for quick reference
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Talking Points</Label>
                  {section.talking_points?.map((point, pi) => (
                    <div key={pi} className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground mt-1">{pi + 1}.</span>
                      <p className="text-xs flex-1">{point}</p>
                      <Button
                        variant="ghost" size="sm" className="h-5 w-5 p-0 text-destructive"
                        onClick={() => removeTalkingPoint(index, pi)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      value={newTalkingPoint[section._key] || ''}
                      onChange={(e) => setNewTalkingPoint((prev) => ({ ...prev, [section._key]: e.target.value }))}
                      placeholder="Add a talking point..."
                      className="h-7 text-xs flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addTalkingPoint(index)
                        }
                      }}
                    />
                    <Button
                      variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => addTalkingPoint(index)}
                    >
                      Add
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={section.is_optional}
                    onCheckedChange={(v) => updateSection(index, { is_optional: v })}
                    className="scale-75"
                  />
                  <Label className="text-xs">Optional section (can be skipped during calls)</Label>
                </div>
              </CardContent>
            )}
          </Card>
        )
      })}

      <div className="flex items-center gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={addSection}>
          <Plus className="h-4 w-4 mr-1" />
          Add Section
        </Button>
        {onSave && (
          <Button size="sm" onClick={onSave} disabled={isSaving || saved}>
            {saved ? (
              <>
                <CheckCircle className="h-4 w-4 mr-1" />
                Saved
              </>
            ) : isSaving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <>
                <Save className="h-4 w-4 mr-1" />
                Save Sections
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

export function sectionsToEditable(
  sections: Omit<CallScriptSection, 'created_at' | 'updated_at'>[]
): EditableSection[] {
  return sections.map((s) => ({
    ...s,
    _key: `existing-${('section_id' in s ? s.section_id : '')}-${Math.random()}`,
  })) as EditableSection[]
}
