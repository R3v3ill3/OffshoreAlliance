"use client"

/**
 * SMS Engagement report (Phase 12, SMS_EXPANSION_BRIEF §F).
 *
 * Org-wide counterpart to the per-campaign panel under Outreach → SMS:
 * which campaigns are using SMS, how their sends land, and how many
 * assessments each pathway produced under the Phase 12 source
 * taxonomy (sms_chat / sms_survey / sms_inbound).
 */

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { fetchApi } from "@/lib/api/fetch-api"
import type { SmsOrgReportCampaignRow } from "@/app/api/reports/sms/route"
import type { VwSmsAssessmentReportRow } from "@/types/sms"

const SOURCE_LABELS: Record<VwSmsAssessmentReportRow["source"], string> = {
  sms_chat: "chat",
  sms_survey: "survey",
  sms_inbound: "keyword",
  sms: "legacy",
}

function AssessmentBreakdown({
  rows,
  total,
}: {
  rows: VwSmsAssessmentReportRow[]
  total: number
}) {
  if (total === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium">{total}</span>
      <span className="text-xs text-muted-foreground">
        {rows
          .map((r) => `${r.ratings_count} ${SOURCE_LABELS[r.source] ?? r.source}`)
          .join(" · ")}
      </span>
    </div>
  )
}

export default function SmsReportPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["reports-sms"],
    queryFn: async () => {
      const res = await fetchApi("/api/reports/sms")
      if (!res.ok) throw new Error("Failed to fetch SMS report")
      return res.json() as Promise<{ campaigns: SmsOrgReportCampaignRow[] }>
    },
  })

  const campaigns = data?.campaigns ?? []

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/reports">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Reports
          </Link>
        </Button>
      </div>

      <div className="flex items-start gap-3">
        <MessageSquare className="mt-1 h-8 w-8 text-sky-500" />
        <div>
          <h1 className="text-3xl font-bold">SMS Engagement</h1>
          <p className="text-muted-foreground">
            Sends, replies and assessments per campaign. Reply rate is
            measured against delivered, not dispatched.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By campaign</CardTitle>
          <CardDescription>
            Campaigns with any SMS traffic or SMS-recorded assessment.
            Assessments are broken down by capture pathway.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <EurekaLoadingSpinner />
            </div>
          ) : error ? (
            <p className="py-6 text-sm text-destructive">
              Could not load the SMS report.
            </p>
          ) : campaigns.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              No SMS activity recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Delivered</TableHead>
                    <TableHead className="text-right">Replies</TableHead>
                    <TableHead className="text-right">Reply rate</TableHead>
                    <TableHead className="text-right">Surveys done</TableHead>
                    <TableHead className="text-right">Assessments</TableHead>
                    <TableHead className="text-right">Opt-outs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => (
                    <TableRow key={c.campaign_id}>
                      <TableCell className="font-medium">
                        <Link
                          className="hover:underline"
                          href={`/campaigns/${c.campaign_id}?tab=outreach&sub=sms`}
                        >
                          {c.campaign_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.rollup.sends_count}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.rollup.delivered_count}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({c.rollup.delivery_rate_pct}%)
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.rollup.inbound_reply_count}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.rollup.reply_rate_pct}%
                      </TableCell>
                      <TableCell className="text-right">
                        {c.rollup.surveys_completed_count}
                      </TableCell>
                      <TableCell className="text-right">
                        <AssessmentBreakdown
                          rows={c.assessments}
                          total={c.assessments_total}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {c.rollup.opt_outs_count}
                      </TableCell>
                    </TableRow>
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
