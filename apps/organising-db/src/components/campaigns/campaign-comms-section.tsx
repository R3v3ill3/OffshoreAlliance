"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Mail, Send } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampaignSendPanel, type PreparedTag } from "./campaign-send-panel";
import { CampaignListBuilder } from "./campaign-list-builder";
import { EmailInboxPanel } from "@/components/email/inbox/EmailInboxPanel";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const numericId = Number(campaignId);
  const [preparedTag, setPreparedTag] = useState<PreparedTag | null>(null);
  const [activeTab, setActiveTab] = useState(
    searchParams.get("email_view") === "inbox" ? "inbox" : "drafts"
  );
  const conversationRaw = Number(searchParams.get("conversation"));
  const initialConversationId =
    Number.isFinite(conversationRaw) && conversationRaw > 0
      ? conversationRaw
      : null;

  const setEmailView = (view: string) => {
    setActiveTab(view);
    const params = new URLSearchParams(searchParams.toString());
    if (view === "inbox") params.set("email_view", "inbox");
    else params.delete("email_view");
    if (view !== "inbox") params.delete("conversation");
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const setConversationParam = (conversationId: number | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (conversationId == null) params.delete("conversation");
    else params.set("conversation", String(conversationId));
    params.set("email_view", "inbox");
    router.replace(`?${params.toString()}`, { scroll: false });
  };

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

      <Tabs value={activeTab} onValueChange={setEmailView}>
        <TabsList>
          <TabsTrigger value="drafts">Drafts & Send</TabsTrigger>
          <TabsTrigger value="list-builder">List Builder</TabsTrigger>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
        </TabsList>

        <TabsContent value="drafts">
          <CampaignSendPanel
            campaignId={campaignId}
            canWrite={canWrite}
            preparedTag={preparedTag}
          />
        </TabsContent>

        <TabsContent value="list-builder">
          <CampaignListBuilder
            campaignId={campaignId}
            canWrite={canWrite}
            onListPrepared={(tag) => {
              setPreparedTag(tag);
              setActiveTab("drafts");
            }}
          />
        </TabsContent>

        <TabsContent value="inbox">
          <EmailInboxPanel
            campaignId={numericId}
            initialConversationId={initialConversationId}
            className="h-[75vh]"
            onConversationIdChange={setConversationParam}
            onCampaignIdChange={(next) => {
              if (next !== numericId) {
                router.push(
                  next == null ? "/email/inbox" : `/email/inbox?campaign=${next}`
                );
              }
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
