'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Phone, PhoneCall, PhoneOff, CheckCircle, XCircle, Clock } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import type { CallCampaignSummary } from '@/types/planner-types'

interface CallCampaignReportingProps {
  campaignId: number | string
}

const PIE_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6', '#64748b']

export function CallCampaignReporting({ campaignId }: CallCampaignReportingProps) {
  const { data: summaries, isLoading } = useQuery({
    queryKey: ['call-campaign-summary', String(campaignId)],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('call_campaign_summary')
        .select('*')
        .eq('campaign_id', parseInt(String(campaignId)))

      if (error) throw error
      return data as unknown as CallCampaignSummary[]
    },
    enabled: !!campaignId,
  })

  const { data: funnelData } = useQuery({
    queryKey: ['call-section-funnel', String(campaignId)],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('call_section_funnel')
        .select('*')
        .eq('campaign_id', parseInt(String(campaignId)))
        .order('sort_order', { ascending: true })

      if (error) throw error
      return data as { section_title: string; reach_rate_pct: number; reached_count: number; total_connected_calls: number }[]
    },
    enabled: !!campaignId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!summaries || summaries.length === 0) {
    return (
      <div className="text-center py-12">
        <Phone className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No call data yet</p>
      </div>
    )
  }

  const totals = summaries.reduce(
    (acc, s) => ({
      total_attempts: acc.total_attempts + s.total_attempts,
      connected: acc.connected + s.connected_count,
      no_answer: acc.no_answer + s.no_answer_count,
      voicemail: acc.voicemail + s.voicemail_count,
      bad_number: acc.bad_number + s.bad_number_count,
      dnc: acc.dnc + s.dnc_count,
      positive: acc.positive + s.positive_calls,
      neutral: acc.neutral + s.neutral_calls,
      negative: acc.negative + s.negative_calls,
      cta_accepted: acc.cta_accepted + s.cta_accepted,
      cta_considering: acc.cta_considering + s.cta_considering,
      cta_declined: acc.cta_declined + s.cta_declined,
      callbacks: acc.callbacks + s.callbacks_pending,
      unique_attempted: acc.unique_attempted + s.unique_contacts_attempted,
    }),
    {
      total_attempts: 0, connected: 0, no_answer: 0, voicemail: 0,
      bad_number: 0, dnc: 0, positive: 0, neutral: 0, negative: 0,
      cta_accepted: 0, cta_considering: 0, cta_declined: 0,
      callbacks: 0, unique_attempted: 0,
    }
  )

  const connectRate = totals.total_attempts > 0
    ? Math.round((totals.connected / totals.total_attempts) * 100)
    : 0

  const dispositionPieData = [
    { name: 'Connected', value: totals.connected },
    { name: 'No Answer', value: totals.no_answer },
    { name: 'Voicemail', value: totals.voicemail },
    { name: 'Bad Number', value: totals.bad_number },
    { name: 'DNC', value: totals.dnc },
  ].filter((d) => d.value > 0)

  const ctaPieData = [
    { name: 'Accepted', value: totals.cta_accepted },
    { name: 'Considering', value: totals.cta_considering },
    { name: 'Declined', value: totals.cta_declined },
  ].filter((d) => d.value > 0)

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<Phone className="h-4 w-4" />}
          label="Total Attempts"
          value={totals.total_attempts}
        />
        <KpiCard
          icon={<PhoneCall className="h-4 w-4 text-green-600" />}
          label="Connect Rate"
          value={`${connectRate}%`}
          subtext={`${totals.connected} connected`}
        />
        <KpiCard
          icon={<CheckCircle className="h-4 w-4 text-green-600" />}
          label="CTA Accepted"
          value={totals.cta_accepted}
          subtext={totals.connected > 0 ? `${Math.round((totals.cta_accepted / totals.connected) * 100)}% of connected` : undefined}
        />
        <KpiCard
          icon={<Clock className="h-4 w-4 text-purple-600" />}
          label="Callbacks Pending"
          value={totals.callbacks}
        />
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Dial Disposition Pie */}
        {dispositionPieData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Dial Outcomes</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={dispositionPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(props: Record<string, unknown>) => `${props.name ?? ''} ${(((props.percent as number) ?? 0) * 100).toFixed(0)}%`}
                  >
                    {dispositionPieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* CTA Response Pie */}
        {ctaPieData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">CTA Responses</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={ctaPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(props: Record<string, unknown>) => `${props.name ?? ''} ${(((props.percent as number) ?? 0) * 100).toFixed(0)}%`}
                  >
                    <Cell fill="#22c55e" />
                    <Cell fill="#f59e0b" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Section Funnel */}
      {funnelData && funnelData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Script Section Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={funnelData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="section_title" tick={{ fontSize: 11 }} />
                <YAxis unit="%" />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, 'Reached']}
                />
                <Bar dataKey="reach_rate_pct" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Per-list breakdown */}
      {summaries.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Per-List Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summaries.map((s) => (
                <div key={s.list_id} className="flex items-center gap-3 p-2 rounded border">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.list_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.total_attempts} attempts, {s.connect_rate_pct}% connect rate
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {s.completed_items}/{s.total_items}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  subtext,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  subtext?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
        {subtext && <p className="text-xs text-muted-foreground mt-0.5">{subtext}</p>}
      </CardContent>
    </Card>
  )
}
