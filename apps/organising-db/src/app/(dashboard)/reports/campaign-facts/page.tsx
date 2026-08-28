"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import { excludeSmsEpisodes } from "@/lib/campaign/visible-campaigns"
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
import { CampaignFactsReport } from "@/components/campaigns/data-fields/campaign-facts-report"
import {
  FACT_CATEGORIES,
  FACT_CATEGORY_LABELS,
  type FactCategory,
} from "@/lib/campaign-facts/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"

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
    queryKey: ["facts-report-picker"],
    queryFn: async () => {
      const { data, error } = await excludeSmsEpisodes(
        supabase
          .from("campaigns")
          .select("campaign_id, name, campaign_type, status")
          .order("name")
      )
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
          Claim ranks and compliance witnesses live on the campaign. Pick one
          to see distributions, worksite/occupation counts, and a worker export.
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
              className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-muted/40 transition-colors"
            >
              <span className="text-sm font-medium truncate">{c.name}</span>
              <span className="flex items-center gap-1 shrink-0">
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

function CampaignFactsPicker() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { canWrite } = useAuth()
  const cidParam = searchParams.get("cid")
  const campaignId = cidParam ? Number(cidParam) : null
  const categoryParam = searchParams.get("category")
  const category: FactCategory | "all" =
    categoryParam === "claims" ||
    categoryParam === "compliance" ||
    categoryParam === "other"
      ? categoryParam
      : "all"

  function pick(id: number) {
    router.replace(`/reports/campaign-facts?cid=${id}`, { scroll: false })
  }

  function setCategory(next: FactCategory | "all") {
    if (campaignId == null) return
    const qs = new URLSearchParams()
    qs.set("cid", String(campaignId))
    if (next !== "all") qs.set("category", next)
    router.replace(`/reports/campaign-facts?${qs.toString()}`, { scroll: false })
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
          <h1 className="text-xl font-bold">Campaign data fields</h1>
          <p className="text-xs text-muted-foreground">
            Claim importance ranks and compliance witnesses. These do not
            colour the wall chart.
          </p>
        </div>
        {campaignId != null && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/campaigns/${campaignId}?tab=workforce&sub=data-fields`}>
              Open campaign fields
            </Link>
          </Button>
        )}
      </div>

      {campaignId == null ? (
        <PickerView onPick={pick} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as FactCategory | "all")}
            >
              <SelectTrigger className="h-8 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {FACT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {FACT_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CampaignFactsReport
            campaignId={String(campaignId)}
            category={category === "all" ? null : category}
            canWrite={canWrite}
          />
        </div>
      )}
    </div>
  )
}

export default function CampaignFactsReportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <EurekaLoadingSpinner />
        </div>
      }
    >
      <CampaignFactsPicker />
    </Suspense>
  )
}
