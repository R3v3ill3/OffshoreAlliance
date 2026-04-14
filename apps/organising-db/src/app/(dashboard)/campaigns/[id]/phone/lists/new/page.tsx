'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useCallScripts } from '@/lib/hooks/useCallScripts'
import { useCreateCallList, usePopulateCallList } from '@/lib/hooks/useCallList'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, ArrowRight, Phone, Users, ListChecks, Loader2, CheckCircle } from 'lucide-react'
import { PRIORITY_STRATEGIES } from '@/lib/phone/disposition-types'
import { toast } from 'sonner'
import type { CallListPriorityStrategy } from '@/types/planner-types'

type WizardStep = 'details' | 'filters' | 'script' | 'confirm'

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'details', label: 'List Details' },
  { key: 'filters', label: 'Build List' },
  { key: 'script', label: 'Attach Script' },
  { key: 'confirm', label: 'Confirm' },
]

export default function NewCallListPage() {
  const params = useParams()
  const router = useRouter()
  const campaignId = params.id as string

  const [step, setStep] = useState<WizardStep>('details')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [priorityStrategy, setPriorityStrategy] = useState<CallListPriorityStrategy>('sequential')
  const [selectedScriptId, setSelectedScriptId] = useState<number | null>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [createdListId, setCreatedListId] = useState<number | null>(null)
  const [populateResult, setPopulateResult] = useState<{ added: number } | null>(null)

  const { data: scripts } = useCallScripts(campaignId)
  const createList = useCreateCallList(campaignId)

  const stepIndex = STEPS.findIndex((s) => s.key === step)
  const progress = ((stepIndex + 1) / STEPS.length) * 100

  const goNext = () => {
    const idx = stepIndex + 1
    if (idx < STEPS.length) setStep(STEPS[idx].key)
  }

  const goBack = () => {
    const idx = stepIndex - 1
    if (idx >= 0) setStep(STEPS[idx].key)
  }

  const handleCreate = async () => {
    try {
      const list = await createList.mutateAsync({
        name,
        description: description || undefined,
        script_id: selectedScriptId,
        priority_strategy: priorityStrategy,
      })
      setCreatedListId(list.list_id)

      const populateRes = await fetch(`/api/campaigns/${campaignId}/call-lists/${list.list_id}/populate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters }),
      })

      if (populateRes.ok) {
        const result = await populateRes.json()
        setPopulateResult(result)
        toast.success(`Call list created with ${result.added} contacts`)
      } else {
        toast.success('Call list created (no contacts matched filters)')
      }

      setStep('confirm')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create list')
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/campaigns/${campaignId}/phone`)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Create Call List</h2>
          <p className="text-sm text-muted-foreground">
            Step {stepIndex + 1} of {STEPS.length}: {STEPS[stepIndex].label}
          </p>
        </div>
      </div>

      <Progress value={progress} className="h-1.5" />

      {step === 'details' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              List Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>List Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Stage 1 Phone Outreach — Non-members"
              />
            </div>
            <div className="space-y-1">
              <Label>Description (optional)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of who is on this list and why..."
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <Label>Priority Strategy</Label>
              <Select
                value={priorityStrategy}
                onValueChange={(v) => setPriorityStrategy(v as CallListPriorityStrategy)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_STRATEGIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <div>
                        <span className="font-medium">{s.label}</span>
                        <span className="text-muted-foreground text-xs ml-2">{s.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end">
              <Button onClick={goNext} disabled={!name.trim()}>
                Next
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'filters' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5" />
              Build the List
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Only workers with phone numbers will be added. Use filters to narrow the list.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Membership</Label>
                <Select
                  value={filters.membership || 'all'}
                  onValueChange={(v) => setFilters({ ...filters, membership: v === 'all' ? '' : v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="member">Members</SelectItem>
                    <SelectItem value="non_member">Non-members</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Occupation (contains)</Label>
                <Input
                  value={filters.occupation || ''}
                  onChange={(e) => setFilters({ ...filters, occupation: e.target.value })}
                  placeholder="e.g. electrician"
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={goNext}>
                Next
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'script' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Attach Script
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Attach a structured phone script to guide callers through the conversation.
            </p>
            {scripts && scripts.length > 0 ? (
              <div className="space-y-2">
                {scripts.map((s) => (
                  <div
                    key={s.script_id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedScriptId === s.script_id
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedScriptId(
                      selectedScriptId === s.script_id ? null : s.script_id
                    )}
                  >
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.call_script_sections?.length || 0} sections
                        {s.call_objective && ` — ${s.call_objective.slice(0, 60)}...`}
                      </p>
                    </div>
                    <Badge variant={s.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                      {s.status}
                    </Badge>
                    {selectedScriptId === s.script_id && (
                      <CheckCircle className="h-4 w-4 text-primary" />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No scripts available. You can create one from a phone script draft in the Capacities step.
              </p>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={handleCreate} disabled={createList.isPending}>
                {createList.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : null}
                Create Call List
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'confirm' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Call List Created
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <p><strong>Name:</strong> {name}</p>
              <p><strong>Strategy:</strong> {PRIORITY_STRATEGIES.find((s) => s.value === priorityStrategy)?.label}</p>
              {populateResult && (
                <p><strong>Contacts added:</strong> {populateResult.added}</p>
              )}
            </div>
            <div className="flex gap-2">
              {createdListId && (
                <Button onClick={() => router.push(`/campaigns/${campaignId}/phone/call/${createdListId}`)}>
                  <Phone className="h-4 w-4 mr-1" />
                  Start Calling
                </Button>
              )}
              <Button variant="outline" onClick={() => router.push(`/campaigns/${campaignId}/phone`)}>
                View All Lists
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
