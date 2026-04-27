import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddWorkersClient } from "@/components/campaigns/add-workers-client";

export default async function AddWorkersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    redirect("/campaigns");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?reason=session_expired");
  }

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("campaign_id, name")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  const campaignName = campaign?.name;
  if (!campaignName) {
    redirect("/campaigns");
  }

  return (
    <AddWorkersClient campaignId={campaignId} campaignName={campaignName} />
  );
}
