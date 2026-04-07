"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Mail, Send } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampaignSendPanel } from "./campaign-send-panel";
import { CampaignListBuilder } from "./campaign-list-builder";

interface CampaignCommsSectionProps {
  campaignId: string | number;
  canWrite: boolean;
}

export function CampaignCommsSection({
  campaignId,
  canWrite,
}: CampaignCommsSectionProps) {
  const supabase = createClient();
  const { user } = useAuth();
  const numericId = Number(campaignId);

  const { data: stats } = useQuery({
    queryKey: ["campaign-comms-stats", numericId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_comms_drafts")
        .select("draft_id, status")
        .eq("campaign_id", numericId);
      if (error) throw error;
      const all = data ?? [];
      return {
        total: all.length,
        sent: all.filter((d) => d.status === "sent").length,
      };
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-4">
      {stats && stats.total > 0 && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Mail className="h-4 w-4" />
            {stats.total} draft{stats.total !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1.5">
            <Send className="h-4 w-4" />
            {stats.sent} sent
          </span>
        </div>
      )}

      <Tabs defaultValue="drafts">
        <TabsList>
          <TabsTrigger value="drafts">Drafts & Send</TabsTrigger>
          <TabsTrigger value="list-builder">List Builder</TabsTrigger>
        </TabsList>

        <TabsContent value="drafts">
          <CampaignSendPanel campaignId={campaignId} canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="list-builder">
          <CampaignListBuilder campaignId={campaignId} canWrite={canWrite} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
