'use client'

/**
 * Email audience upload — CSV/XLSX import of external recipient lists
 * for platform sending ("lists are built internally or uploaded").
 *
 * Columns: first name, last name, email. Matched addresses link to the
 * existing worker; new addresses create workers stamped
 * email_consent_source = 'import' — a consent attestation is required
 * before the upload runs (Spam Act: consent is the sender's problem,
 * so it is captured at the door). Optionally creates an email list
 * containing everyone imported, ready for the composer.
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, FileSpreadsheet, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { fetchApi, API_FETCH_TIMEOUT_UPLOAD_MS } from '@/lib/api/fetch-api'
import { CONSENT_BASES, type ConsentBasis } from '@/lib/email/audience-import'

const CONSENT_LABELS: Record<ConsentBasis, string> = {
  membership_form: 'Membership form',
  workplace_signup: 'Workplace sign-up sheet',
  direct_request: 'Direct request from the person',
  other: 'Other documented consent',
}

interface ImportResult {
  total_rows: number
  accepted: number
  rejected: Array<{ row: Record<string, string>; reason: string }>
  matched: number
  created: number
  opted_out: number
  list_id: number | null
  errors: Array<{ key: string; email?: string; reason: string }>
}

export default function EmailAudienceImportPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const campaignId = params.id

  const [file, setFile] = useState<File | null>(null)
  const [listName, setListName] = useState('')
  const [consentBasis, setConsentBasis] = useState<ConsentBasis | ''>('')
  const [attested, setAttested] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a file first.')
      if (!consentBasis) throw new Error('Select the consent basis.')
      if (!attested) throw new Error('Consent attestation is required.')
      const fd = new FormData()
      fd.set('file', file)
      fd.set('consent_basis', consentBasis)
      fd.set('consent_attested', 'true')
      if (listName.trim()) fd.set('list_name', listName.trim())
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/email-audience/import`,
        { method: 'POST', body: fd, timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS },
      )
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Import failed')
      return json as ImportResult
    },
    onSuccess: (data) => {
      setResult(data)
      toast.success(
        `Imported ${data.matched + data.created} recipients (${data.matched} matched, ${data.created} created).`,
      )
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Import failed'),
  })

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/campaigns/${campaignId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to campaign
        </Button>
        <h1 className="text-2xl font-semibold mt-2 flex items-center gap-2">
          <Upload className="h-6 w-6" />
          Upload email recipients
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          CSV or Excel with columns for first name, last name and email.
          Existing workers are matched by address; new people are created
          and added to this campaign.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Recipient file
          </CardTitle>
          <CardDescription>
            Up to 10,000 rows. Duplicate and invalid addresses are
            rejected and reported — nothing is silently dropped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>File (.csv / .xlsx / .xls)</Label>
            <Input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Create an email list from this upload (optional)</Label>
            <Input
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder="e.g. FPSO delegates — March upload"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Where did these contacts consent to email?</Label>
            <Select
              value={consentBasis}
              onValueChange={(v) => setConsentBasis(v as ConsentBasis)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select consent basis" />
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
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={attested}
              onCheckedChange={(v) => setAttested(v === true)}
              className="mt-0.5"
            />
            <span>
              I confirm these people have consented to receive email from
              the Offshore Alliance (Spam Act 2003 requirement).
            </span>
          </label>
          <Button
            onClick={() => importMutation.mutate()}
            disabled={
              !file || !consentBasis || !attested || importMutation.isPending
            }
          >
            {importMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1.5" />
            )}
            Import recipients
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="secondary">{result.total_rows} rows</Badge>
              <Badge variant="secondary">{result.matched} matched</Badge>
              <Badge variant="secondary">{result.created} created</Badge>
              {result.opted_out > 0 && (
                <Badge variant="outline" className="text-amber-700">
                  {result.opted_out} already unsubscribed
                </Badge>
              )}
              {result.rejected.length > 0 && (
                <Badge variant="outline" className="text-destructive">
                  {result.rejected.length} rejected
                </Badge>
              )}
            </div>
            {result.list_id && (
              <p>
                Email list created (#{result.list_id}) — imported recipients
                are now campaign members and available in the composer.
              </p>
            )}
            {result.rejected.length > 0 && (
              <div className="space-y-1">
                <p className="font-medium">Rejected rows</p>
                <ul className="list-disc pl-5 text-xs text-muted-foreground max-h-48 overflow-y-auto">
                  {result.rejected.slice(0, 50).map((r, i) => (
                    <li key={i}>{r.reason}</li>
                  ))}
                  {result.rejected.length > 50 && (
                    <li>…and {result.rejected.length - 50} more</li>
                  )}
                </ul>
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="space-y-1">
                <p className="font-medium text-destructive">Errors</p>
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      {e.email ? `${e.email}: ` : ''}
                      {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
