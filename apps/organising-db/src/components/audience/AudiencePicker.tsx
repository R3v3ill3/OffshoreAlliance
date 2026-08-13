'use client'

/**
 * Channel-agnostic audience picker (Phase 9, brief §C decision 6).
 *
 * Only SMS is wired this phase — email/phone channels are typed but
 * render a disabled placeholder. The component offers three modes:
 *   1. Whole campaign
 *   2. Saved worker list
 *   3. Build audience (manual add + CSV/XLSX import with wash against
 *      existing lists + filter/sort list builder)
 *
 * When the parent needs the API audience shape it calls
 * `toApiAudience(campaignId, value)` from lib/sms/audience-helpers.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api/fetch-api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertTriangle,
  FileSpreadsheet,
  Filter,
  Loader2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils/cn'
import type { AudienceValue } from '@/lib/sms/audience-helpers'
import { CONSENT_BASES, type ConsentBasis } from '@/lib/sms/audience-import'
import { AudienceFilterBuildDialog } from '@/components/audience/AudienceFilterBuildDialog'
import {
  AudienceWashLists,
  idsExcludedByWash,
  type WashListOverlap,
} from '@/components/audience/AudienceWashLists'

export type { AudienceValue }

// ─── Types ───────────────────────────────────────────────────────────

interface WorkerListOption {
  list_id: number
  name: string
  status: string
  items_count: { count: number }[] | null
}

interface StagedWorker {
  worker_id: number
  first_name: string
  last_name: string
  phone_e164: string | null
  sms_opt_out: boolean
  source: 'manual' | 'import'
}

export interface AudiencePickerProps {
  channel: 'sms'
  campaignId: string | number
  value: AudienceValue
  onChange: (v: AudienceValue) => void
  disabled?: boolean
}

// ─── Consent basis labels ────────────────────────────────────────────

const CONSENT_LABELS: Record<ConsentBasis, string> = {
  membership_form: 'Membership form',
  workplace_signup: 'Workplace sign-up sheet',
  direct_request: 'Direct request from the person',
  other: 'Other documented consent',
}

// ─── Main component ──────────────────────────────────────────────────

export function AudiencePicker({
  channel,
  campaignId,
  value,
  onChange,
  disabled,
}: AudiencePickerProps) {
  const mode = value.mode
  const [staged, setStaged] = useState<StagedWorker[]>([])
  const [showManual, setShowManual] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showFilter, setShowFilter] = useState(false)

  const { data: workerLists } = useQuery({
    queryKey: ['worker-lists-for-sms', String(campaignId)],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/worker-lists`
      )
      if (!res.ok) throw new Error('Failed to fetch worker lists')
      return res.json() as Promise<WorkerListOption[]>
    },
  })

  const handleModeChange = (newMode: string) => {
    if (newMode === 'campaign') {
      onChange({ mode: 'campaign' })
    } else if (newMode === 'worker_list') {
      const first = (workerLists ?? [])[0]
      if (first) {
        onChange({ mode: 'worker_list', worker_list_id: first.list_id })
      } else {
        onChange({ mode: 'worker_list', worker_list_id: 0 })
      }
    } else if (newMode === 'composed') {
      onChange({
        mode: 'composed',
        worker_ids: staged.map((w) => w.worker_id),
      })
    }
  }

  const addStaged = useCallback(
    (w: StagedWorker) => {
      setStaged((prev) => {
        if (prev.some((s) => s.worker_id === w.worker_id)) return prev
        const next = [...prev, w]
        onChange({
          mode: 'composed',
          worker_ids: next.map((s) => s.worker_id),
        })
        return next
      })
    },
    [onChange]
  )

  const addStagedBatch = useCallback(
    (workers: StagedWorker[]) => {
      setStaged((prev) => {
        const existingIds = new Set(prev.map((s) => s.worker_id))
        const newOnes = workers.filter(
          (w) => !existingIds.has(w.worker_id)
        )
        if (newOnes.length === 0) return prev
        const next = [...prev, ...newOnes]
        onChange({
          mode: 'composed',
          worker_ids: next.map((s) => s.worker_id),
        })
        return next
      })
    },
    [onChange]
  )

  const removeStaged = useCallback(
    (workerId: number) => {
      setStaged((prev) => {
        const next = prev.filter((s) => s.worker_id !== workerId)
        if (next.length > 0) {
          onChange({
            mode: 'composed',
            worker_ids: next.map((s) => s.worker_id),
          })
        } else {
          onChange({ mode: 'campaign' })
        }
        return next
      })
    },
    [onChange]
  )

  const sendable = staged.filter(
    (w) => w.phone_e164 && !w.sms_opt_out
  ).length
  const optedOut = staged.filter((w) => w.sms_opt_out).length

  if (channel !== 'sms') {
    return (
      <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        Audience picker is not yet available for the {channel} channel.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Label>Audience</Label>
      <RadioGroup
        value={mode}
        onValueChange={handleModeChange}
        disabled={disabled}
        className="space-y-2"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="campaign" id="aud-campaign" />
          <Label htmlFor="aud-campaign" className="font-normal cursor-pointer">
            Whole campaign (all members)
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="worker_list" id="aud-list" />
          <Label htmlFor="aud-list" className="font-normal cursor-pointer">
            Saved worker list
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="composed" id="aud-build" />
          <Label htmlFor="aud-build" className="font-normal cursor-pointer">
            Build audience
          </Label>
        </div>
      </RadioGroup>

      {/* Saved list picker */}
      {mode === 'worker_list' && (
        <Select
          value={
            value.mode === 'worker_list'
              ? String(value.worker_list_id)
              : ''
          }
          onValueChange={(v) =>
            onChange({ mode: 'worker_list', worker_list_id: Number(v) })
          }
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a list…" />
          </SelectTrigger>
          <SelectContent>
            {(workerLists ?? []).map((wl) => (
              <SelectItem key={wl.list_id} value={String(wl.list_id)}>
                {wl.name} ({wl.items_count?.[0]?.count ?? 0})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Build audience */}
      {mode === 'composed' && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {staged.length} staged
              </span>
              {staged.length > 0 && (
                <>
                  <Badge variant="secondary" className="text-xs">
                    {sendable} sendable
                  </Badge>
                  {optedOut > 0 && (
                    <Badge
                      variant="secondary"
                      className="text-xs bg-amber-100 text-amber-800"
                    >
                      {optedOut} opted out
                    </Badge>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => setShowManual(true)}
              >
                <UserPlus className="h-3 w-3 mr-1" />
                Add person
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => setShowFilter(true)}
              >
                <Filter className="h-3 w-3 mr-1" />
                Filter &amp; build
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => setShowImport(true)}
              >
                <Upload className="h-3 w-3 mr-1" />
                Import
              </Button>
            </div>
          </div>

          {/* Staging list */}
          {staged.length > 0 && (
            <div className="max-h-48 overflow-y-auto divide-y rounded-md border">
              {staged.map((w) => (
                <div
                  key={w.worker_id}
                  className={cn(
                    'flex items-center justify-between px-3 py-1.5 text-sm',
                    w.sms_opt_out && 'bg-amber-50'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate">
                      {w.first_name} {w.last_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {w.phone_e164}
                    </span>
                    {w.sms_opt_out && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-amber-100 text-amber-800"
                      >
                        opted out
                      </Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeStaged(w.worker_id)}
                    disabled={disabled}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {staged.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Add people manually, import a spreadsheet (washed against
              existing lists), or build a list with sort and filter.
            </p>
          )}
        </div>
      )}

      {/* Manual add dialog */}
      <ManualAddDialog
        campaignId={campaignId}
        open={showManual}
        onOpenChange={setShowManual}
        onAdded={addStaged}
      />

      {/* Import dialog */}
      <AudienceImportDialog
        campaignId={campaignId}
        open={showImport}
        onOpenChange={setShowImport}
        onImported={addStagedBatch}
      />

      <AudienceFilterBuildDialog
        campaignId={campaignId}
        open={showFilter}
        onOpenChange={setShowFilter}
        onAdded={addStagedBatch}
      />
    </div>
  )
}

// ─── Manual add dialog ───────────────────────────────────────────────

function ManualAddDialog({
  campaignId,
  open,
  onOpenChange,
  onAdded,
}: {
  campaignId: string | number
  open: boolean
  onOpenChange: (v: boolean) => void
  onAdded: (w: StagedWorker) => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [attested, setAttested] = useState(false)

  const manual = useMutation({
    mutationFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-audience/manual`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim(),
            email: email.trim() || null,
            consent_attested: true,
          }),
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error((err as { error?: string }).error ?? 'Failed')
      }
      return res.json() as Promise<{
        worker_id: number
        first_name: string
        last_name: string
        phone_e164: string
        sms_opt_out: boolean
        matched_existing: boolean
      }>
    },
    onSuccess: (data) => {
      onAdded({
        worker_id: data.worker_id,
        first_name: data.first_name,
        last_name: data.last_name,
        phone_e164: data.phone_e164,
        sms_opt_out: data.sms_opt_out,
        source: 'manual',
      })
      toast.success(
        data.matched_existing
          ? `${data.first_name} ${data.last_name} matched — added to audience`
          : `${data.first_name} ${data.last_name} created and added`
      )
      setFirstName('')
      setLastName('')
      setPhone('')
      setEmail('')
      setAttested(false)
      onOpenChange(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add person to audience</DialogTitle>
          <DialogDescription>
            Enter the person&apos;s details. If their phone number matches an
            existing worker they&apos;ll be linked automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="manual-first">First name</Label>
              <Input
                id="manual-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Amy"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="manual-last">Last name</Label>
              <Input
                id="manual-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Chen"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="manual-phone">Mobile number</Label>
            <Input
              id="manual-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0400 100 014"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="manual-email">Email (optional)</Label>
            <Input
              id="manual-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="amy@example.com"
            />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="manual-consent"
              checked={attested}
              onCheckedChange={(v) => setAttested(v === true)}
            />
            <Label htmlFor="manual-consent" className="text-sm font-normal leading-snug">
              I confirm this person has given consent to receive SMS
              messages from the union.
            </Label>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={
              manual.isPending ||
              !firstName.trim() ||
              !lastName.trim() ||
              !phone.trim() ||
              !attested
            }
            onClick={() => manual.mutate()}
          >
            {manual.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Add person
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Import dialog ───────────────────────────────────────────────────

type ImportStep = 'upload' | 'review' | 'consent'

type ConfirmDecision = 'match' | 'create' | 'skip'

interface ParsedImportRow {
  key: string
  first_name: string
  last_name: string
  phone: string
  phone_e164: string
  email: string | null
}

interface ImportReject {
  key: string
  row: Record<string, string>
  reasons: string[]
}

function AudienceImportDialog({
  campaignId,
  open,
  onOpenChange,
  onImported,
}: {
  campaignId: string | number
  open: boolean
  onOpenChange: (v: boolean) => void
  onImported: (workers: StagedWorker[]) => void
}) {
  const [step, setStep] = useState<ImportStep>('upload')
  const [parsedRows, setParsedRows] = useState<ParsedImportRow[]>([])
  const [rejected, setRejected] = useState<ImportReject[]>([])
  const [matchResults, setMatchResults] = useState<
    Array<{
      key: string
      disposition: string
      match: { worker: { worker_id: number } } | null
    }>
  >([])
  const [confirmDecisions, setConfirmDecisions] = useState<
    Record<string, ConfirmDecision>
  >({})
  const [consentBasis, setConsentBasis] = useState<ConsentBasis | ''>('')
  const [consentAttested, setConsentAttested] = useState(false)
  const [fileName, setFileName] = useState('')
  const [washKeys, setWashKeys] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const matchedWorkerIds = useMemo(() => {
    const ids: number[] = []
    for (const m of matchResults) {
      if (!m.match) continue
      if (m.disposition === 'auto') ids.push(m.match.worker.worker_id)
      else if (
        (m.disposition === 'confirm' || m.disposition === 'review') &&
        confirmDecisions[m.key] === 'match'
      ) {
        ids.push(m.match.worker.worker_id)
      }
    }
    return ids
  }, [matchResults, confirmDecisions])

  const washQuery = useQuery({
    queryKey: ['sms-audience-wash-import', String(campaignId), matchedWorkerIds],
    queryFn: async () => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-audience/wash`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worker_ids: matchedWorkerIds }),
        }
      )
      if (!res.ok) throw new Error('Failed to check existing lists')
      const data = (await res.json()) as { lists: WashListOverlap[] }
      return data.lists ?? []
    },
    enabled: step === 'consent' && matchedWorkerIds.length > 0,
  })
  const washLists = washQuery.data ?? []

  const reset = () => {
    setStep('upload')
    setParsedRows([])
    setRejected([])
    setMatchResults([])
    setConfirmDecisions({})
    setConsentBasis('')
    setConsentAttested(false)
    setFileName('')
    setWashKeys(new Set())
  }

  const handleClose = (v: boolean) => {
    if (!v) reset()
    onOpenChange(v)
  }

  // Step 1: Parse
  const parseUpload = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-audience/import/parse`,
        { method: 'POST', body: formData }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Parse failed' }))
        throw new Error((err as { error?: string }).error ?? 'Parse failed')
      }
      return res.json() as Promise<{
        rows: ParsedImportRow[]
        rejected: ImportReject[]
        fileName: string
        acceptedCount: number
        rejectedCount: number
      }>
    },
    onSuccess: async (data) => {
      setParsedRows(data.rows)
      setRejected(data.rejected)
      setFileName(data.fileName)

      if (data.rows.length === 0) {
        toast.error('No valid rows found in the file')
        return
      }

      // Auto-match
      try {
        const matchRes = await fetchApi(
          `/api/campaigns/${campaignId}/sms-audience/import/match`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: data.rows }),
          }
        )
        if (matchRes.ok) {
          const matchData = (await matchRes.json()) as {
            results: Array<{
              key: string
              disposition: string
              match: { worker: { worker_id: number } } | null
            }>
          }
          setMatchResults(matchData.results)
        }
      } catch {
        // Match is optional — proceed without it
      }

      setStep('review')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Step 3: Apply
  const applyImport = useMutation({
    mutationFn: async () => {
      const resolutions = parsedRows
        .map((row) => {
          const match = matchResults.find((m) => m.key === row.key)

          if (match && match.disposition === 'auto' && match.match) {
            return {
              key: row.key,
              action: 'match' as const,
              worker_id: match.match.worker.worker_id,
              phone: row.phone,
              phone_e164: row.phone_e164,
            }
          }

          if (
            match &&
            (match.disposition === 'confirm' || match.disposition === 'review') &&
            match.match
          ) {
            const decision = confirmDecisions[row.key]
            if (!decision || decision === 'skip') return null
            if (decision === 'match') {
              return {
                key: row.key,
                action: 'match' as const,
                worker_id: match.match.worker.worker_id,
                phone: row.phone,
                phone_e164: row.phone_e164,
              }
            }
            // decision === 'create'
            return {
              key: row.key,
              action: 'create' as const,
              first_name: row.first_name,
              last_name: row.last_name,
              phone: row.phone,
              phone_e164: row.phone_e164,
              email: row.email,
            }
          }

          return {
            key: row.key,
            action: 'create' as const,
            first_name: row.first_name,
            last_name: row.last_name,
            phone: row.phone,
            phone_e164: row.phone_e164,
            email: row.email,
          }
        })
        .filter(Boolean) as Array<Record<string, unknown>>

      const excluded = idsExcludedByWash(washLists, washKeys)
      const washed = resolutions.filter((r) => {
        const wid = r.worker_id as number | undefined
        if (wid == null) return true
        return !excluded.has(wid)
      })

      if (washed.length === 0) {
        throw new Error('Everyone in this import is already on the selected lists')
      }

      const res = await fetchApi(
        `/api/campaigns/${campaignId}/sms-audience/import/apply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resolutions: washed,
            consent_basis: consentBasis,
            consent_attested: true,
          }),
        }
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Apply failed' }))
        throw new Error((err as { error?: string }).error ?? 'Apply failed')
      }
      return res.json() as Promise<{
        workers: Array<{
          worker_id: number
          first_name: string
          last_name: string
          phone_e164: string | null
          sms_opt_out: boolean
        }>
        created: number
        matched: number
      }>
    },
    onSuccess: (data) => {
      const excluded = idsExcludedByWash(washLists, washKeys)
      const staged: StagedWorker[] = data.workers
        .filter((w) => !excluded.has(w.worker_id))
        .map((w) => ({
        worker_id: w.worker_id,
        first_name: w.first_name,
        last_name: w.last_name,
        phone_e164: w.phone_e164,
        sms_opt_out: w.sms_opt_out,
        source: 'import' as const,
      }))
      onImported(staged)
      queryClient.invalidateQueries({
        queryKey: ['worker-lists-for-sms', String(campaignId)],
      })
      toast.success(
        `Imported ${data.workers.length} — ${data.created} created, ${data.matched} matched`
      )
      handleClose(false)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const needsDecision = matchResults.filter(
    (m) =>
      (m.disposition === 'confirm' || m.disposition === 'review') && m.match
  )
  const autoMatchedCount = matchResults.filter(
    (m) => m.disposition === 'auto' && m.match
  ).length
  const confirmedMatchCount = needsDecision.filter(
    (m) => confirmDecisions[m.key] === 'match'
  ).length
  const matchedCount = autoMatchedCount + confirmedMatchCount
  const newCount = parsedRows.length - matchedCount -
    needsDecision.filter((m) => confirmDecisions[m.key] === 'skip').length
  const unresolvedCount = needsDecision.filter(
    (m) => !confirmDecisions[m.key]
  ).length

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && 'Import audience from file'}
            {step === 'review' && `Review import — ${fileName}`}
            {step === 'consent' && 'Confirm consent basis'}
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' &&
              'Upload a CSV or XLSX file with columns for first name, last name, and mobile number.'}
            {step === 'review' &&
              'Review the parsed results. Matched workers will be linked; unmatched will be created as new workers.'}
            {step === 'consent' &&
              'Confirm how consent to receive SMS was obtained for these contacts.'}
          </DialogDescription>
        </DialogHeader>

        {/* Upload step */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div
              className={cn(
                'flex flex-col items-center justify-center rounded-md border-2 border-dashed p-8 cursor-pointer transition-colors',
                'hover:bg-muted/50'
              )}
              onClick={() => fileRef.current?.click()}
            >
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Click to select a CSV, XLSX, or XLS file
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) parseUpload.mutate(file)
                }}
              />
            </div>
            {parseUpload.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Parsing file…
              </div>
            )}
          </div>
        )}

        {/* Review step */}
        {step === 'review' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md border p-2">
                <p className="text-lg font-semibold">{parsedRows.length}</p>
                <p className="text-xs text-muted-foreground">Valid rows</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-lg font-semibold">{matchedCount}</p>
                <p className="text-xs text-muted-foreground">Matched</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-lg font-semibold">{newCount}</p>
                <p className="text-xs text-muted-foreground">New workers</p>
              </div>
            </div>

            {rejected.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
                  <AlertTriangle className="h-4 w-4" />
                  {rejected.length} row{rejected.length > 1 ? 's' : ''}{' '}
                  rejected
                </div>
                <div className="max-h-32 overflow-y-auto text-xs text-amber-700 space-y-1">
                  {rejected.slice(0, 10).map((r) => (
                    <div key={r.key}>
                      Row {Number(r.key) + 1}: {r.reasons.join('; ')}
                    </div>
                  ))}
                  {rejected.length > 10 && (
                    <div>…and {rejected.length - 10} more</div>
                  )}
                </div>
              </div>
            )}

            {/* Rows needing manual confirmation */}
            {needsDecision.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {unresolvedCount > 0
                    ? `${needsDecision.length} possible match${needsDecision.length > 1 ? 'es' : ''} — choose an action:`
                    : `${needsDecision.length} match${needsDecision.length > 1 ? 'es' : ''} resolved`}
                </p>
                <div className="max-h-40 overflow-y-auto rounded-md border divide-y text-sm">
                  {needsDecision.map((m) => {
                    const row = parsedRows.find((r) => r.key === m.key)
                    if (!row) return null
                    const decision = confirmDecisions[m.key] ?? ''
                    return (
                      <div
                        key={m.key}
                        className="flex items-center justify-between px-3 py-1.5 gap-2"
                      >
                        <span className="truncate min-w-0">
                          {row.first_name} {row.last_name}
                        </span>
                        <Select
                          value={decision}
                          onValueChange={(v) =>
                            setConfirmDecisions((prev) => ({
                              ...prev,
                              [m.key]: v as ConfirmDecision,
                            }))
                          }
                        >
                          <SelectTrigger className="w-[130px] h-7 text-xs">
                            <SelectValue placeholder="Choose…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="match">Confirm match</SelectItem>
                            <SelectItem value="create">Create new</SelectItem>
                            <SelectItem value="skip">Skip</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {parsedRows.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-md border divide-y text-sm">
                {parsedRows.slice(0, 50).map((r) => {
                  const match = matchResults.find((m) => m.key === r.key)
                  const isAuto = match?.disposition === 'auto' && match.match
                  const needsConfirm =
                    match &&
                    (match.disposition === 'confirm' ||
                      match.disposition === 'review') &&
                    match.match
                  if (needsConfirm) return null
                  return (
                    <div
                      key={r.key}
                      className="flex items-center justify-between px-3 py-1.5"
                    >
                      <span className="truncate">
                        {r.first_name} {r.last_name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {r.phone_e164}
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px]',
                            isAuto
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-green-100 text-green-700'
                          )}
                        >
                          {isAuto ? 'match' : 'new'}
                        </Badge>
                      </div>
                    </div>
                  )
                })}
                {parsedRows.length > 50 && (
                  <div className="px-3 py-1.5 text-xs text-muted-foreground text-center">
                    …and {parsedRows.length - 50} more
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Consent step */}
        {step === 'consent' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>How was SMS consent obtained?</Label>
              <Select
                value={consentBasis}
                onValueChange={(v) =>
                  setConsentBasis(v as ConsentBasis)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select consent basis…" />
                </SelectTrigger>
                <SelectContent>
                  {CONSENT_BASES.map((b) => (
                    <SelectItem key={b} value={b}>
                      {CONSENT_LABELS[b]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="import-consent"
                checked={consentAttested}
                onCheckedChange={(v) => setConsentAttested(v === true)}
              />
              <Label
                htmlFor="import-consent"
                className="text-sm font-normal leading-snug"
              >
                I confirm that all {parsedRows.length} people in this import
                have given consent to receive SMS messages from the union via the
                method selected above.
              </Label>
            </div>
            {washQuery.isFetching && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking existing lists…
              </p>
            )}
            <AudienceWashLists
              lists={washLists}
              selectedKeys={washKeys}
              onChange={setWashKeys}
            />
          </div>
        )}

        <DialogFooter>
          {step === 'review' && (
            <>
              <Button variant="outline" onClick={() => reset()}>
                Back
              </Button>
              <Button
                disabled={parsedRows.length === 0 || unresolvedCount > 0}
                onClick={() => setStep('consent')}
              >
                Continue
              </Button>
            </>
          )}
          {step === 'consent' && (
            <>
              <Button variant="outline" onClick={() => setStep('review')}>
                Back
              </Button>
              <Button
                disabled={
                  !consentBasis || !consentAttested || applyImport.isPending
                }
                onClick={() => applyImport.mutate()}
              >
                {applyImport.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Import {parsedRows.length} contacts
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
