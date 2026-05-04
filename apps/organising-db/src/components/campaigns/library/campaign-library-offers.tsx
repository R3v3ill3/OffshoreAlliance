"use client";

/**
 * CampaignLibraryOffers
 *
 * Offers sub-tab of the Library section.
 *
 * Schema note: No `offers` table was found in the migration files as of
 * 20260521000000. The schema has campaign_agreements → agreements but no
 * dedicated offers/offer_documents table. This component renders an
 * empty-state card until an offers table is introduced in a future migration.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  campaignId: number;
  canWrite: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CampaignLibraryOffers(_props: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Offers</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground text-center py-8">
          Offers will appear here once agreements are finalised.
        </p>
      </CardContent>
    </Card>
  );
}
