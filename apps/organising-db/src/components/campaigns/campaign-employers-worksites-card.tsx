"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, MapPin, ExternalLink, Settings } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";

type CampaignEmployerRow = {
  id: number;
  employer_id: number;
  employer: { employer_id: number; employer_name: string } | { employer_id: number; employer_name: string }[] | null;
};

type CampaignWorksiteRow = {
  id: number;
  worksite_id: number | null;
  sector_wide: boolean | null;
  worksite: { worksite_id: number; worksite_name: string } | { worksite_id: number; worksite_name: string }[] | null;
};

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/**
 * Read-only summary of the employers and worksites that scope a campaign,
 * surfaced on the Campaign Overview tab. Clicking a chip opens the existing
 * `/employers/[id]` or `/worksites/[id]` detail page. The "Manage scope"
 * action deep-links to the Workforce → Scope sub-tab where editing lives.
 */
export function CampaignEmployersWorksitesCard({ campaignId }: { campaignId: string }) {
  const supabase = createClient();
  const { user } = useAuth();
  const cid = Number(campaignId);

  const { data: employers = [] } = useQuery({
    queryKey: ["campaign-universe-employers", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_employers")
        .select(
          `id, employer_id,
           employer:employers(employer_id, employer_name)`
        )
        .eq("campaign_id", cid)
        .order("employer_id");
      if (error) throw error;
      return (data ?? []) as unknown as CampaignEmployerRow[];
    },
    enabled: !!user && Number.isFinite(cid),
  });

  const { data: worksites = [] } = useQuery({
    queryKey: ["campaign-universe-worksites", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worksites")
        .select(
          `id, worksite_id, sector_wide,
           worksite:worksites(worksite_id, worksite_name)`
        )
        .eq("campaign_id", cid);
      if (error) throw error;
      return (data ?? []) as unknown as CampaignWorksiteRow[];
    },
    enabled: !!user && Number.isFinite(cid),
  });

  const sectorWide = worksites.some((w) => w.sector_wide === true);
  const specificWorksites = worksites.filter((w) => !w.sector_wide && w.worksite_id != null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <CardTitle className="text-base">Employers & worksites</CardTitle>
          <CardDescription>
            Scope of this campaign. Click a chip for full details, or manage scope to
            add or remove.
          </CardDescription>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`/campaigns/${campaignId}?tab=workforce&sub=universe`}>
            <Settings className="h-3.5 w-3.5 mr-1" aria-hidden />
            Manage scope
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" aria-hidden />
            Employers ({employers.length})
          </h3>
          {employers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No employers linked yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {employers.map((row) => {
                const emp = pickOne(row.employer);
                const name = emp?.employer_name ?? `Employer #${row.employer_id}`;
                return (
                  <Link
                    key={row.id}
                    href={`/employers/${row.employer_id}`}
                    className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                  >
                    {name}
                    <ExternalLink className="h-3 w-3 opacity-50" aria-hidden />
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            Worksites
            {sectorWide ? "" : ` (${specificWorksites.length})`}
          </h3>
          {sectorWide ? (
            <Badge variant="secondary" className="text-xs">
              Sector-wide — all sites under the selected employers
            </Badge>
          ) : specificWorksites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No worksites linked yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {specificWorksites.map((row) => {
                const ws = pickOne(row.worksite);
                const name = ws?.worksite_name ?? `Worksite #${row.worksite_id}`;
                return (
                  <Link
                    key={row.id}
                    href={`/worksites/${row.worksite_id}`}
                    className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                  >
                    {name}
                    <ExternalLink className="h-3 w-3 opacity-50" aria-hidden />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
