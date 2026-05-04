'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Plus, ShieldAlert, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { SelectedObjection } from './types'

// ─── DB row shape ─────────────────────────────────────────────────────────────

interface ObjectionRow {
  objection_id: number
  label: string
  description: string | null
  is_default: boolean
  campaign_id: number | null
  sort_order: number
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ObjectionsEditorProps {
  campaignId: number
  value: SelectedObjection[]
  onChange: (objections: SelectedObjection[]) => void
  readOnly?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ObjectionsEditor({ campaignId, value, onChange, readOnly = false }: ObjectionsEditorProps) {
  const supabase = createClient()
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customLabel, setCustomLabel] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Load global defaults (campaign_id IS NULL, is_default = true)
  // and campaign-specific objections (campaign_id = campaignId)
  const { data: objections = [], isLoading, refetch } = useQuery({
    queryKey: ['call-objections', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_objections')
        .select('objection_id, label, description, is_default, campaign_id, sort_order')
        .or(`campaign_id.is.null,campaign_id.eq.${campaignId}`)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as ObjectionRow[]
    },
  })

  const selectedIds = new Set(value.map((o) => o.objection_id).filter((id): id is number => id != null))

  function isSelected(id: number) {
    return selectedIds.has(id)
  }

  function toggle(objection: ObjectionRow) {
    if (isSelected(objection.objection_id)) {
      onChange(value.filter((o) => o.objection_id !== objection.objection_id))
    } else {
      onChange([
        ...value,
        {
          objection_id: objection.objection_id,
          custom_label: undefined,
          description: objection.description ?? null,
        },
      ])
    }
  }

  async function handleAddCustom() {
    if (!customLabel.trim()) return
    setIsSaving(true)
    try {
      const { data, error } = await supabase
        .from('call_objections')
        .insert({
          campaign_id: campaignId,
          label: customLabel.trim(),
          description: customDesc.trim() || null,
          is_default: false,
          sort_order: 999,
        })
        .select('objection_id, label, description, is_default, campaign_id, sort_order')
        .single()
      if (error) throw error

      // Add to selected list
      onChange([
        ...value,
        {
          objection_id: data.objection_id,
          custom_label: undefined,
          description: data.description ?? null,
        },
      ])
      setCustomLabel('')
      setCustomDesc('')
      setShowCustomForm(false)
      await refetch()
      toast.success('Custom objection added')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add objection')
    } finally {
      setIsSaving(false)
    }
  }

  const defaults = objections.filter((o) => o.is_default || o.campaign_id == null)
  const campaignSpecific = objections.filter((o) => !o.is_default && o.campaign_id === campaignId)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-amber-500" />
        <h4 className="text-sm font-semibold">Objections</h4>
        {value.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {value.length} selected
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Select the objections you expect to encounter. These will be available for quick capture during calls.
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading objections…
        </div>
      ) : (
        <div className="space-y-4">
          {/* Default objections */}
          {defaults.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Common objections
              </p>
              <div className="space-y-1.5">
                {defaults.map((obj) => (
                  <label
                    key={obj.objection_id}
                    className={`flex items-start gap-2.5 rounded-md px-2 py-1.5 cursor-pointer transition-colors ${
                      isSelected(obj.objection_id) ? 'bg-blue-50' : 'hover:bg-muted/40'
                    } ${readOnly ? 'cursor-default' : ''}`}
                  >
                    <Checkbox
                      checked={isSelected(obj.objection_id)}
                      onCheckedChange={() => !readOnly && toggle(obj)}
                      disabled={readOnly}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm leading-none">{obj.label}</p>
                      {obj.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{obj.description}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Campaign-specific objections */}
          {campaignSpecific.length > 0 && (
            <>
              {defaults.length > 0 && <Separator />}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Campaign-specific
                </p>
                <div className="space-y-1.5">
                  {campaignSpecific.map((obj) => (
                    <label
                      key={obj.objection_id}
                      className={`flex items-start gap-2.5 rounded-md px-2 py-1.5 cursor-pointer transition-colors ${
                        isSelected(obj.objection_id) ? 'bg-blue-50' : 'hover:bg-muted/40'
                      } ${readOnly ? 'cursor-default' : ''}`}
                    >
                      <Checkbox
                        checked={isSelected(obj.objection_id)}
                        onCheckedChange={() => !readOnly && toggle(obj)}
                        disabled={readOnly}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm leading-none">{obj.label}</span>
                        {obj.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{obj.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Add custom objection */}
          {!readOnly && (
            <>
              <Separator />
              {showCustomForm ? (
                <div className="space-y-2 rounded-lg border border-dashed p-3">
                  <p className="text-xs font-medium">Add campaign objection</p>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Label</Label>
                    <Input
                      value={customLabel}
                      onChange={(e) => setCustomLabel(e.target.value)}
                      placeholder="e.g. Worried about job security"
                      className="h-7 text-sm"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Description (optional)</Label>
                    <Input
                      value={customDesc}
                      onChange={(e) => setCustomDesc(e.target.value)}
                      placeholder="Brief explanation of this objection"
                      className="h-7 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => void handleAddCustom()}
                      disabled={!customLabel.trim() || isSaving}
                    >
                      {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => { setShowCustomForm(false); setCustomLabel(''); setCustomDesc('') }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setShowCustomForm(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add custom objection
                </Button>
              )}
            </>
          )}

          {objections.length === 0 && !showCustomForm && (
            <p className="text-xs text-muted-foreground italic">
              No objections found. Add a custom one above.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
