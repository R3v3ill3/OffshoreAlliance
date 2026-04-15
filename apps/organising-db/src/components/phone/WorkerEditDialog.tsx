'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

interface WorkerEditDialogProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  workerId: number
  initialData: {
    first_name: string
    last_name: string
    phone: string | null
    email: string | null
    occupation: string | null
  }
  connectionId?: number | null
  connectionNotes?: string | null
}

export function WorkerEditDialog({
  open,
  onClose,
  onSaved,
  workerId,
  initialData,
  connectionId,
  connectionNotes,
}: WorkerEditDialogProps) {
  const [phone, setPhone] = useState(initialData.phone || '')
  const [email, setEmail] = useState(initialData.email || '')
  const [occupation, setOccupation] = useState(initialData.occupation || '')
  const [notes, setNotes] = useState(connectionNotes || '')
  const [isSaving, setIsSaving] = useState(false)

  // Reset form when dialog opens with fresh data
  useEffect(() => {
    if (open) {
      setPhone(initialData.phone || '')
      setEmail(initialData.email || '')
      setOccupation(initialData.occupation || '')
      setNotes(connectionNotes || '')
    }
  }, [open, initialData, connectionNotes])

  async function handleSave() {
    setIsSaving(true)
    try {
      const supabase = createClient()

      // Update workers table
      const workerUpdates: Record<string, string | null> = {}
      if (phone !== (initialData.phone || '')) workerUpdates.phone = phone.trim() || null
      if (email !== (initialData.email || '')) workerUpdates.email = email.trim() || null
      if (occupation !== (initialData.occupation || '')) workerUpdates.occupation = occupation.trim() || null

      if (Object.keys(workerUpdates).length > 0) {
        const { error } = await supabase
          .from('workers')
          .update(workerUpdates)
          .eq('worker_id', workerId)
        if (error) throw error
      }

      // Update campaign connection notes if connection exists
      if (connectionId && notes !== (connectionNotes || '')) {
        const { error } = await supabase
          .from('worker_campaign_connections')
          .update({ notes: notes.trim() || null })
          .eq('connection_id', connectionId)
        if (error) throw error
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
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit Contact — {initialData.first_name} {initialData.last_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 0412 345 678"
                type="tel"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. name@example.com"
                type="email"
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Occupation / Trade</Label>
            <Input
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder="e.g. Boilermaker"
              className="h-8 text-sm"
            />
          </div>

          {connectionId && (
            <div className="space-y-1.5">
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
  )
}
