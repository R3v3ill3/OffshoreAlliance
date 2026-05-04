"use client";

/**
 * LibrarySection — top-level Library tab component.
 *
 * Wraps three sub-tabs: Documents / Agreements / Offers.
 * Sub-tab state is managed locally (useState) because this component is
 * rendered inside a TabsContent and the URL ?sub= param is handled at the
 * page.tsx level for the top-level tab. The Library sub-tabs are a second
 * nesting level and don't need to persist in the URL.
 */

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampaignLibraryDocuments } from "./campaign-library-documents";
import { CampaignLibraryAgreements } from "./campaign-library-agreements";
import { CampaignLibraryOffers } from "./campaign-library-offers";

interface Props {
  campaignId: number;
  canWrite: boolean;
}

export function LibrarySection({ campaignId, canWrite }: Props) {
  const [activeSub, setActiveSub] = useState("documents");

  return (
    <Tabs value={activeSub} onValueChange={setActiveSub}>
      <TabsList className="mb-4">
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="agreements">Agreements</TabsTrigger>
        <TabsTrigger value="offers">Offers</TabsTrigger>
      </TabsList>

      <TabsContent value="documents">
        <CampaignLibraryDocuments campaignId={campaignId} canWrite={canWrite} />
      </TabsContent>

      <TabsContent value="agreements">
        <CampaignLibraryAgreements campaignId={campaignId} canWrite={canWrite} />
      </TabsContent>

      <TabsContent value="offers">
        <CampaignLibraryOffers campaignId={campaignId} canWrite={canWrite} />
      </TabsContent>
    </Tabs>
  );
}
