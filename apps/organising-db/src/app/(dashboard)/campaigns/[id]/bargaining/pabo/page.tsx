'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { useCampaign } from '@/lib/hooks/usePlannerCampaigns'
import { PaboApplicationCard } from '@/components/campaigns/bargaining/PaboApplicationCard'
import { usePaboApplications } from '@/hooks/usePaboApplications'
import type { PaboApplication } from '@/hooks/usePaboApplications'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronRight, FileText, Plus } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface PageProps {
  params: Promise<{ id: string }>
}

const PABO_STATUS_COLOURS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  filed: 'bg-blue-100 text-blue-700',
  active: 'bg-indigo-100 text-indigo-700',
  granted: 'bg-green-100 text-green-700',
  refused: 'bg-red-100 text-red-700',
  withdrawn: 'bg-amber-100 text-amber-700',
  lapsed: 'bg-slate-100 text-slate-500',
}

export default function BargainingPaboListPage({ params }: PageProps) {
  const { id } = use(params)
  const campaignId = parseInt(id)

  const { data: campaign, isLoading: campaignLoading } = useCampaign(campaignId)
  const { data: paboApplications, isLoading: paboLoading } = usePaboApplications(campaignId)
  const [newDialogOpen, setNewDialogOpen] = useState(false)

  // New PABO form state
  const [fwcNumber, setFwcNumber] = useState('')
  const [applicationStatus, setApplicationStatus] = useState('draft')
  const [ballotStartDate, setBallotStartDate] = useState('')
  const [ballotEndDate, setBallotEndDate] = useState('')

  function resetForm() {
    setFwcNumber('')
    setApplicationStatus('draft')
    setBallotStartDate('')
    setBallotEndDate('')
  }

  const hasApplications = Array.isArray(paboApplications) && paboApplications.length > 0

  if (campaignLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-64" />
          <div className="h-32 bg-slate-200 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/campaigns" className="hover:text-foreground">Campaigns</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/campaigns/${campaignId}`} className="hover:text-foreground">
          {campaign?.name ?? 'Campaign'}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/campaigns/${campaignId}/bargaining`} className="hover:text-foreground">
          Bargaining
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span>PABO</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-slate-500" />
          <h1 className="text-2xl font-bold text-slate-900">PABO Applications</h1>
        </div>
        <Button onClick={() => setNewDialogOpen(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New PABO application
        </Button>
      </div>

      {paboLoading && (
        <div className="animate-pulse space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 bg-slate-200 rounded" />
          ))}
        </div>
      )}

      {!paboLoading && !hasApplications && (
        /* Empty state */
        <div className="border rounded-lg p-10 text-center bg-slate-50">
          <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No PABO applications yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            PABOs become available once the Stage 9 strength gate passes. When you&apos;re ready to
            file, track the application here and link to ballot and voter turnout data.
          </p>
          <div className="flex justify-center gap-3 mt-4">
            <Button asChild variant="outline" size="sm">
              <Link href={`/campaigns/${campaignId}/bargaining/decisions`}>
                View Decisions
              </Link>
            </Button>
            <Button size="sm" onClick={() => setNewDialogOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              New PABO application
            </Button>
          </div>
        </div>
      )}

      {!paboLoading && hasApplications && (
        <div className="space-y-4">
          {(paboApplications as PaboApplication[]).map((pabo) => (
            <Link
              key={pabo.pabo_id}
              href={`/campaigns/${campaignId}/bargaining/pabo/${pabo.pabo_id}`}
              className="block hover:no-underline"
            >
              <div className="border rounded-lg p-4 hover:border-blue-300 transition-colors bg-white">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="secondary"
                        className={cn('text-xs', PABO_STATUS_COLOURS[pabo.status ?? ''] ?? 'bg-slate-100 text-slate-700')}
                      >
                        {pabo.status}
                      </Badge>
                      {pabo.fwc_application_number && (
                        <span className="text-xs text-muted-foreground font-mono">
                          FWC #{pabo.fwc_application_number}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-sm">
                      {pabo.application_filed_at && (
                        <div>
                          <p className="text-xs text-muted-foreground">Applied</p>
                          <p className="font-medium">
                            {new Date(pabo.application_filed_at).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                      {pabo.ballot_opens_at && (
                        <div>
                          <p className="text-xs text-muted-foreground">Ballot opens</p>
                          <p className="font-medium">
                            {new Date(pabo.ballot_opens_at).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                      {pabo.ballot_closes_at && (
                        <div>
                          <p className="text-xs text-muted-foreground">Ballot closes</p>
                          <p className="font-medium">
                            {new Date(pabo.ballot_closes_at).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                      {pabo.voter_turnout_pct != null && (
                        <div>
                          <p className="text-xs text-muted-foreground">Turnout</p>
                          <p className="font-medium">{pabo.voter_turnout_pct}%</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                </div>
                {/* PaboApplicationCard used inline for expanded view */}
                <div className="mt-3 pt-3 border-t">
                  <PaboApplicationCard pabo={pabo} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* New PABO dialog */}
      <Dialog open={newDialogOpen} onOpenChange={(o) => { setNewDialogOpen(o); if (!o) resetForm() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New PABO Application</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>FWC Number (optional)</Label>
              <Input
                value={fwcNumber}
                onChange={(e) => setFwcNumber(e.target.value)}
                placeholder="e.g. PB2025/12345"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={applicationStatus} onValueChange={setApplicationStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="filed">Filed</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="granted">Granted</SelectItem>
                  <SelectItem value="refused">Refused</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ballot Start Date (optional)</Label>
              <Input
                type="date"
                value={ballotStartDate}
                onChange={(e) => setBallotStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ballot End Date (optional)</Label>
              <Input
                type="date"
                value={ballotEndDate}
                onChange={(e) => setBallotEndDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                // Creation handled by Wave 3 hook — consumed here as a stub
                // that the merged PaboApplicationCard/usePaboApplications will wire up
                setNewDialogOpen(false)
                resetForm()
              }}
            >
              Create Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
