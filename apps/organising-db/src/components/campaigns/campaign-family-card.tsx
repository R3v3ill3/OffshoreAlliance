"use client";

/**
 * WP3.8 (wp3.8.md §3.7 "Parent's Setup") — the family card on the Setup
 * tab, mounted by `[id]/page.tsx` on the line above `CampaignUniverseSection`
 * (that section and `campaign-settings.tsx` are untouched, §3.15).
 *
 * A child shows "Part of <parent>" with a link to the parent and, for a
 * writer, an Edit link that opens the Basics sheet (`?edit=basics`, read by
 * the campaign header — the sheet has no route of its own). A parent shows
 * "Child campaigns (N)" as a list of links. A campaign with neither renders
 * nothing, so the Setup tab is byte-identical for every campaign today.
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { useCampaignParent } from "@/lib/campaign/campaign-parent";

type ChildRow = { campaign_id: number; name: string; parent_campaign_id: number | null };

export function CampaignFamilyCard({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const supabase = createClient();
  const numericCampaignId = Number(campaignId);
  const { data: parent } = useCampaignParent(campaignId);

  const { data: children = [] } = useQuery({
    queryKey: ["campaign-children", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("campaign_id, name, parent_campaign_id")
        .eq("parent_campaign_id", numericCampaignId)
        .order("name");
      if (error) throw error;
      return ((data ?? []) as ChildRow[]).filter(
        (c) => Number(c.parent_campaign_id) === numericCampaignId
      );
    },
    enabled: Number.isInteger(numericCampaignId) && numericCampaignId > 0,
  });

  const parentId = parent?.parentId ?? null;
  if (parentId == null && children.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Campaign family</CardTitle>
        <CardDescription>
          {parentId != null
            ? "This campaign sees the assessments its parent shares; ratings recorded here land on the parent's assessment."
            : "Assessments marked “Share with family campaigns” are visible and ratable in every child campaign."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {parentId != null ? (
          <p className="flex flex-wrap items-center gap-2">
            <span>
              Part of{" "}
              <Link
                href={`/campaigns/${parentId}`}
                className="font-medium underline underline-offset-2 hover:text-foreground"
              >
                {parent?.parentName ?? `campaign ${parentId}`}
              </Link>
            </span>
            {canWrite && (
              <Link
                href={`/campaigns/${campaignId}?edit=basics`}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Edit
              </Link>
            )}
          </p>
        ) : (
          <div className="space-y-1">
            <p className="font-medium">Child campaigns ({children.length})</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {children.map((c) => (
                <li key={c.campaign_id}>
                  <Link
                    href={`/campaigns/${c.campaign_id}`}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
