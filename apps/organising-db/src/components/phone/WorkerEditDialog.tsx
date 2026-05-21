'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, Save, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

export interface WorkerEditInitialData {
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  occupation: string | null
  address: string | null
  suburb: string | null
  state: string | null
  postcode: string | null
  employer_id: number | null
  worksite_id: number | null
  employer_name: string | null
  worksite_name: string | null
}

interface WorkerEditDialogProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  onRemovedFromCampaign?: () => void
  workerId: number
  campaignId: number | string | null
  initialData: WorkerEditInitialData
  connectionId?: number | null
  connectionNotes?: string | null
  /**
   * When provided, the worker_activity_log "details_updated" audit row is
   * tagged with this phone_call_actions session id so the session report
   * can surface a "details updated" flag for this call.
   */
  actionId?: number | null
}

const AU_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']

export function WorkerEditDialog({
  open,
  onClose,
  onSaved,
  onRemovedFromCampaign,
  workerId,
  campaignId,
  initialData,
  connectionId,
  connectionNotes,
  actionId,
}: WorkerEditDialogProps) {
  const supabase = createClient()
  const numericCampaignId = campaignId != null ? Number(campaignId) : null

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [occupation, setOccupation] = useState('')
  const [address, setAddress] = useState('')
  const [suburb, setSuburb] = useState('')
  const [state, setState] = useState('')
  const [postcode, setPostcode] = useState('')
  const [employerId, setEmployerId] = useState<number | null>(null)
  const [worksiteId, setWorksiteId] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [removalConfirm, setRemovalConfirm] = useState<{
    type: 'employer' | 'worksite'
    newId: number
    newName: string
  } | null>(null)

  useEffect(() => {
    if (open) {
      setFirstName(initialData.first_name || '')
      setLastName(initialData.last_name || '')
      setPhone(initialData.phone || '')
      setEmail(initialData.email || '')
      setOccupation(initialData.occupation || '')
      setAddress(initialData.address || '')
      setSuburb(initialData.suburb || '')
      setState(initialData.state || '')
      setPostcode(initialData.postcode || '')
      setEmployerId(initialData.employer_id)
      setWorksiteId(initialData.worksite_id)
      setNotes(connectionNotes || '')
    }
  }, [open, initialData, connectionNotes])

  const { data: employers = [] } = useQuery({
    queryKey: ['all-employers-for-edit'],
    queryFn: async () => {
      const { data } = await supabase
        .from('employers')
        .select('employer_id, employer_name')
        .order('employer_name')
      return data ?? []
    },
    enabled: open,
  })

  const { data: worksites = [] } = useQuery({
    queryKey: ['all-worksites-for-edit', employerId],
    queryFn: async () => {
      let query = supabase
        .from('worksites')
        .select('worksite_id, worksite_name')
        .order('worksite_name')
      if (employerId) {
        const { data: links } = await supabase
          .from('agreement_worksites')
          .select('worksite_id, agreements!inner(agreement_employers!inner(employer_id))')
          .eq('agreements.agreement_employers.employer_id', employerId)
        const linkedIds = links?.map((l) => l.worksite_id) ?? []
        if (linkedIds.length > 0) {
          query = query.in('worksite_id', linkedIds)
        }
      }
      const { data } = await query
      return data ?? []
    },
    enabled: open,
  })

  async function checkCampaignMembership(newEmployerId: number | null, newWorksiteId: number | null): Promise<boolean> {
    if (numericCampaignId == null) return true
    const { data } = await supabase
      .from('campaign_worker_membership')
      .select('worker_id')
      .eq('campaign_id', numericCampaignId)
      .eq('worker_id', workerId)
      .limit(1)

    // If the worker is in the campaign membership, check if the new employer/worksite
    // are still part of the campaign scope by checking if any workers with the new
    // employer/worksite exist in the campaign membership view.
    // This is an approximation — a full universe rule check would be complex.
    if (!data || data.length === 0) return true

    if (newEmployerId && newEmployerId !== initialData.employer_id) {
      const { data: empCheck } = await supabase
        .from('campaign_worker_membership')
        .select('worker_id')
        .eq('campaign_id', numericCampaignId)
        .limit(1)

      // Check if any workers with this employer are in the campaign
      const { data: workerCheck } = await supabase
        .from('workers')
        .select('worker_id')
        .eq('employer_id', newEmployerId)
        .in('worker_id', (empCheck ?? []).map((w) => w.worker_id))
        .limit(1)

      if (!workerCheck || workerCheck.length === 0) return false
    }

    if (newWorksiteId && newWorksiteId !== initialData.worksite_id) {
      const { data: wsCheck } = await supabase
        .from('campaign_worker_membership')
        .select('worker_id')
        .eq('campaign_id', numericCampaignId)
        .limit(1)

      const { data: workerCheck } = await supabase
        .from('workers')
        .select('worker_id')
        .eq('worksite_id', newWorksiteId)
        .in('worker_id', (wsCheck ?? []).map((w) => w.worker_id))
        .limit(1)

      if (!workerCheck || workerCheck.length === 0) return false
    }

    return true
  }

  async function handleEmployerChange(newId: string) {
    const id = newId === '__none__' ? null : parseInt(newId, 10)
    if (id === employerId) return

    if (id && id !== initialData.employer_id) {
      const name = employers.find((e) => e.employer_id === id)?.employer_name || 'Unknown'
      const stillInCampaign = await checkCampaignMembership(id, worksiteId)
      if (!stillInCampaign) {
        setRemovalConfirm({ type: 'employer', newId: id, newName: name })
        return
      }
    }

    setEmployerId(id)
    setWorksiteId(null)
  }

  async function handleWorksiteChange(newId: string) {
    const id = newId === '__none__' ? null : parseInt(newId, 10)
    if (id === worksiteId) return

    if (id && id !== initialData.worksite_id) {
      const name = worksites.find((w) => w.worksite_id === id)?.worksite_name || 'Unknown'
      const stillInCampaign = await checkCampaignMembership(employerId, id)
      if (!stillInCampaign) {
        setRemovalConfirm({ type: 'worksite', newId: id, newName: name })
        return
      }
    }

    setWorksiteId(id)
  }

  async function handleConfirmRemoval() {
    if (!removalConfirm) return

    const newEmployerId = removalConfirm.type === 'employer' ? removalConfirm.newId : employerId
    const newWorksiteId = removalConfirm.type === 'worksite' ? removalConfirm.newId : worksiteId

    setIsSaving(true)
    try {
      // Update worker record
      const { error: wError } = await supabase
        .from('workers')
        .update({
          employer_id: newEmployerId,
          worksite_id: newWorksiteId,
        })
        .eq('worker_id', workerId)
      if (wError) throw wError

      // Remove from all call lists for this campaign
      const { data: campaignLists } = numericCampaignId != null
        ? await supabase.from('call_lists').select('list_id').eq('campaign_id', numericCampaignId)
        : { data: null }

      if (campaignLists && campaignLists.length > 0) {
        const listIds = campaignLists.map((l) => l.list_id)
        await supabase
          .from('call_list_items')
          .delete()
          .eq('worker_id', workerId)
          .in('list_id', listIds)
      }

      toast.success('Worker updated and removed from campaign call lists')
      setRemovalConfirm(null)
      onClose()
      onRemovedFromCampaign?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      const workerUpdates: Record<string, unknown> = {}
      const fieldDiff: Record<string, { from: unknown; to: unknown }> = {}
      const recordChange = (field: string, from: unknown, to: unknown) => {
        fieldDiff[field] = { from, to }
      }

      const trimmedFirstName = firstName.trim()
      const trimmedLastName = lastName.trim()
      if (trimmedFirstName && trimmedFirstName !== (initialData.first_name || '')) {
        workerUpdates.first_name = trimmedFirstName
        recordChange('first_name', initialData.first_name || null, trimmedFirstName)
      }
      if (trimmedLastName && trimmedLastName !== (initialData.last_name || '')) {
        workerUpdates.last_name = trimmedLastName
        recordChange('last_name', initialData.last_name || null, trimmedLastName)
      }
      if (phone !== (initialData.phone || '')) {
        workerUpdates.phone = phone.trim() || null
        recordChange('phone', initialData.phone || null, phone.trim() || null)
      }
      if (email !== (initialData.email || '')) {
        workerUpdates.email = email.trim() || null
        recordChange('email', initialData.email || null, email.trim() || null)
      }
      if (occupation !== (initialData.occupation || '')) {
        workerUpdates.occupation = occupation.trim() || null
        recordChange('occupation', initialData.occupation || null, occupation.trim() || null)
      }
      if (address !== (initialData.address || '')) {
        workerUpdates.address = address.trim() || null
        recordChange('address', initialData.address || null, address.trim() || null)
      }
      if (suburb !== (initialData.suburb || '')) {
        workerUpdates.suburb = suburb.trim() || null
        recordChange('suburb', initialData.suburb || null, suburb.trim() || null)
      }
      if (state !== (initialData.state || '')) {
        workerUpdates.state = state || null
        recordChange('state', initialData.state || null, state || null)
      }
      if (postcode !== (initialData.postcode || '')) {
        workerUpdates.postcode = postcode.trim() || null
        recordChange('postcode', initialData.postcode || null, postcode.trim() || null)
      }
      if (employerId !== initialData.employer_id) {
        workerUpdates.employer_id = employerId
        recordChange('employer_id', initialData.employer_id, employerId)
      }
      if (worksiteId !== initialData.worksite_id) {
        workerUpdates.worksite_id = worksiteId
        recordChange('worksite_id', initialData.worksite_id, worksiteId)
      }

      if (Object.keys(workerUpdates).length > 0) {
        const { error } = await supabase
          .from('workers')
          .update(workerUpdates)
          .eq('worker_id', workerId)
        if (error) throw error
      }

      if (connectionId && notes !== (connectionNotes || '')) {
        const { error } = await supabase
          .from('worker_campaign_connections')
          .update({ notes: notes.trim() || null })
          .eq('connection_id', connectionId)
        if (error) throw error
      }

      // Audit row in worker_activity_log so session reports can surface a
      // "details updated" flag (and the Excel export can list the changes).
      // Only logged when the worker has an active campaign connection — the
      // log is keyed to connection_id by design.
      if (connectionId && Object.keys(fieldDiff).length > 0) {
        await supabase.from('worker_activity_log').insert({
          connection_id: connectionId,
          activity_type: 'details_updated',
          description: 'Contact details updated during call',
          outcome: 'details_updated',
          contact_method: 'phone',
          action_id: actionId ?? null,
          metadata: {
            changes: fieldDiff,
          },
        })
      }

      toast.success('Contact details updated')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <Dialog open={open && !removalConfirm} onOpenChange={(v) => { if (!v) onClose() }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit Contact — {initialData.first_name} {initialData.last_name}
            </DialogTitle>
            <DialogDescription>
              Update worker details. Changes to employer or worksite may affect campaign membership.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">First name</Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Last name</Label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {/* Contact details */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="h-8 text-sm" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Occupation / Trade</Label>
              <Input value={occupation} onChange={(e) => setOccupation(e.target.value)} className="h-8 text-sm" />
            </div>

            {/* Address */}
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-semibold text-muted-foreground">Home Address</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Street Address</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" className="h-8 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Suburb</Label>
                  <Input value={suburb} onChange={(e) => setSuburb(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">State</Label>
                  <Select value={state || '__none__'} onValueChange={(v) => setState(v === '__none__' ? '' : v)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {AU_STATES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Postcode</Label>
                  <Input value={postcode} onChange={(e) => setPostcode(e.target.value)} maxLength={4} className="h-8 text-sm" />
                </div>
              </div>
            </div>

            {/* Employer & Worksite */}
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-semibold text-muted-foreground">Employment</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Employer</Label>
                  <Select
                    value={employerId ? String(employerId) : '__none__'}
                    onValueChange={handleEmployerChange}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select employer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No employer</SelectItem>
                      {employers.map((e) => (
                        <SelectItem key={e.employer_id} value={String(e.employer_id)}>
                          {e.employer_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Worksite</Label>
                  <Select
                    value={worksiteId ? String(worksiteId) : '__none__'}
                    onValueChange={handleWorksiteChange}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select worksite" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No worksite</SelectItem>
                      {worksites.map((w) => (
                        <SelectItem key={w.worksite_id} value={String(w.worksite_id)}>
                          {w.worksite_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Connection notes */}
            {connectionId && (
              <div className="space-y-1.5 pt-2 border-t">
                <Label className="text-xs">Campaign Connection Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes about this worker's engagement with the campaign..."
                  rows={3}
                  className="text-sm"
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1" />
              )}
              {isSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign removal confirmation */}
      <AlertDialog open={!!removalConfirm} onOpenChange={(v) => { if (!v) setRemovalConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Worker will leave campaign
            </AlertDialogTitle>
            <AlertDialogDescription>
              Changing {removalConfirm?.type === 'employer' ? 'employer' : 'worksite'} to{' '}
              <strong>{removalConfirm?.newName}</strong> will move{' '}
              <strong>{initialData.first_name} {initialData.last_name}</strong> outside this
              campaign&apos;s scope. They will be removed from all call lists for this campaign.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemoval}
              disabled={isSaving}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : null}
              Confirm & Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
