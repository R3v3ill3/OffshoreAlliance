"use client"

import Link from "next/link"
import { format } from "date-fns"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading"
import { useVBargainingProgress } from "@/hooks/useVBargainingProgress"
import { cn } from "@/lib/utils/cn"
import type { VBargainingProgress } from "@oa/db-types"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined) {
  if (!d) return "—"
  try {
    return format(new Date(d), "dd MMM yyyy")
  } catch {
    return d
  }
}

function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict) return <span className="text-muted-foreground text-xs">—</span>
  const cls =
    verdict === "strong"
      ? "bg-green-100 text-green-700"
      : verdict === "weak"
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-700"
  return (
    <Badge variant="secondary" className={cn("text-[10px] h-5 capitalize", cls)}>
      {verdict}
    </Badge>
  )
}

function IntractableBadge({
  status,
  daysElapsed,
}: {
  status: string | null
  daysElapsed: number | null
}) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>

  const months =
    daysElapsed != null ? Math.round(daysElapsed / 30.4375) : null

  const cls =
    status === "safe"
      ? "bg-green-100 text-green-700"
      : status === "approaching"
      ? "bg-amber-100 text-amber-700"
      : status === "eligible" || status === "applied"
      ? "bg-orange-100 text-orange-700"
      : status === "declared" || status === "arbitrated"
      ? "bg-red-100 text-red-700"
      : "bg-slate-100 text-slate-600"

  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant="secondary" className={cn("text-[10px] h-5 capitalize", cls)}>
        {status.replace(/_/g, " ")}
      </Badge>
      {months != null && (
        <span className="text-[10px] text-muted-foreground">{months} mo</span>
      )}
    </div>
  )
}

function PaboBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>
  const cls =
    status === "granted"
      ? "bg-green-100 text-green-700"
      : status === "lodged"
      ? "bg-blue-100 text-blue-700"
      : status === "denied" || status === "withdrawn"
      ? "bg-red-100 text-red-700"
      : "bg-slate-100 text-slate-600"
  return (
    <Badge variant="secondary" className={cn("text-[10px] h-5 capitalize", cls)}>
      {status}
    </Badge>
  )
}

function VoteBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-muted-foreground text-xs">—</span>
  const cls =
    outcome === "yes"
      ? "bg-green-100 text-green-700"
      : outcome === "no"
      ? "bg-red-100 text-red-700"
      : "bg-slate-100 text-slate-600"
  return (
    <Badge variant="secondary" className={cn("text-[10px] h-5 capitalize", cls)}>
      {outcome}
    </Badge>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function BargainingRow({ row }: { row: VBargainingProgress }) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <Link
          href={`/campaigns/${row.campaign_id}/bargaining`}
          className="flex items-center gap-1 hover:underline text-blue-600"
        >
          {row.campaign_name}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </Link>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px] h-4 px-1">
          Bargaining
        </Badge>
      </TableCell>
      <TableCell className="text-sm">
        {formatDate(row.bargaining_commenced_at)}
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <VerdictBadge verdict={row.last_strength_verdict} />
          {row.last_strength_assessed_at && (
            <span className="text-[10px] text-muted-foreground">
              {formatDate(row.last_strength_assessed_at)}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-center">
        {(row.open_decision_count ?? 0) > 0 ? (
          <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
            {row.open_decision_count ?? 0}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">0</span>
        )}
      </TableCell>
      <TableCell>
        <PaboBadge status={row.latest_pabo_status} />
      </TableCell>
      <TableCell>
        <VoteBadge outcome={row.latest_vote_outcome} />
      </TableCell>
      <TableCell className="text-center">
        {(row.active_pia_count ?? 0) > 0 ? (
          <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
            {row.active_pia_count ?? 0}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">0</span>
        )}
      </TableCell>
      <TableCell>
        <IntractableBadge
          status={row.intractable_status}
          daysElapsed={row.intractable_days_elapsed}
        />
      </TableCell>
    </TableRow>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BargainingReportPage() {
  const { data: rows = [], isLoading, error } = useVBargainingProgress()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/reports">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Bargaining progress</h1>
          <p className="text-xs text-muted-foreground">
            Strength, decision points, PABO status, PIA actions, and intractable
            risk across all campaigns currently in the bargaining phase.
          </p>
        </div>
      </div>

      {/* Content */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Campaigns in bargaining</CardTitle>
          <CardDescription>
            Only campaigns with{" "}
            <code className="text-xs bg-muted px-1 rounded">
              current_phase = bargaining_to_win
            </code>{" "}
            are shown. Click a campaign name to open its bargaining hub.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex justify-center py-12">
              <EurekaLoadingSpinner />
            </div>
          )}

          {!isLoading && error && (
            <p className="text-sm text-destructive py-8 text-center">
              Failed to load bargaining data. Please try again.
            </p>
          )}

          {!isLoading && !error && rows.length === 0 && (
            <div className="text-center py-12 space-y-2">
              <p className="text-muted-foreground font-medium">
                No campaigns are currently in the bargaining phase.
              </p>
              <p className="text-xs text-muted-foreground">
                Campaigns enter this phase when{" "}
                <code className="bg-muted px-1 rounded">current_phase</code> is
                set to <code className="bg-muted px-1 rounded">bargaining_to_win</code>{" "}
                via the Begin Bargaining workflow.
              </p>
            </div>
          )}

          {!isLoading && !error && rows.length > 0 && (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead>Commenced</TableHead>
                    <TableHead>Strength</TableHead>
                    <TableHead className="text-center">Open Decisions</TableHead>
                    <TableHead>PABO Status</TableHead>
                    <TableHead>Latest Vote</TableHead>
                    <TableHead className="text-center">Active PIA</TableHead>
                    <TableHead>Intractable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <BargainingRow key={row.campaign_id} row={row} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
