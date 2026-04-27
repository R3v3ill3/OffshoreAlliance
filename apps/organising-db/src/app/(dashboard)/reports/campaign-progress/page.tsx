"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/lib/supabase/auth-context"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Search } from "lucide-react"
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading"
import { CampaignProgressReport } from "@/components/reports/CampaignProgressReport"

interface CampaignPickRow {
  campaign_id: number
  name: string
  campaign_type: string
  status: string
}

function PickerView({ onPick }: { onPick: (id: number) => void }) {
  const supabase = createClient()
  const { user } = useAuth()
  const [search, setSearch] = useState("")

  const { data: campaigns = [], isLoading } = useQuery<CampaignPickRow[]>({
    queryKey: ["progress-report-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("campaign_id, name, campaign_type, status")
        .order("name")
      if (error) return []
      return (data ?? []) as CampaignPickRow[]
    },
    enabled: !!user,
  })

  const filtered = search
    ? campaigns.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      )
    : campaigns

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pick a campaign</CardTitle>
        <CardDescription>
          The progress dashboard is per-campaign. Pick one to see stage
          timelines, gate outcomes, ambition rollups, and the plan-revision
          log in one place.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns…"
          />
        </div>
        <div className="max-h-96 overflow-y-auto rounded-md border divide-y">
          {isLoading && (
            <p className="text-sm text-muted-foreground p-4">Loading…</p>
          )}
          {!isLoading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground p-4">
              No campaigns match.
            </p>
          )}
          {filtered.map((c) => (
            <button
              key={c.campaign_id}
              type="button"
              onClick={() => onPick(c.campaign_id)}
              className="w-full text-left p-3 hover:bg-muted/40 transition-colors flex items-center justify-between gap-2"
            >
              <span className="text-sm font-medium truncate">{c.name}</span>
              <span className="flex gap-1 shrink-0">
                <Badge variant="outline" className="text-[10px] h-4 px-1">
                  {c.campaign_type}
                </Badge>
                <Badge variant="outline" className="text-[10px] h-4 px-1">
                  {c.status}
                </Badge>
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function CampaignProgressPicker() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const cidParam = searchParams.get("cid")
  const campaignId = cidParam ? Number(cidParam) : null

  function pick(id: number) {
    router.replace(`/reports/campaign-progress?cid=${id}`, { scroll: false })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/reports">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Campaign progress</h1>
          <p className="text-xs text-muted-foreground">
            Stage timelines, gate outcomes, campaign-level ambition rollups,
            and the plan-revision log per campaign.
          </p>
        </div>
        {campaignId != null && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/campaigns/${campaignId}`}>Open campaign</Link>
          </Button>
        )}
      </div>

      {campaignId == null ? (
        <PickerView onPick={pick} />
      ) : (
        <CampaignProgressReport campaignId={campaignId} />
      )}
    </div>
  )
}

export default function CampaignProgressPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <EurekaLoadingSpinner />
        </div>
      }
    >
      <CampaignProgressPicker />
    </Suspense>
  )
}
