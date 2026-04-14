import { Suspense } from "react";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";
import { CampaignCreationWizard } from "@/components/campaigns/planner-wizard";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";

type SearchParams = Record<string, string | string[] | undefined>;

function hasPlannerContext(searchParams: SearchParams): boolean {
  const plannerKeys = ["campaign_id", "agreement_id", "organiser_id", "expiry_date"];
  return plannerKeys.some((key) => {
    const value = searchParams[key];
    if (Array.isArray(value)) return value.length > 0 && value[0].length > 0;
    return typeof value === "string" && value.length > 0;
  });
}

export default function NewCampaignPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const showPlannerWizard = hasPlannerContext(searchParams);

  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <EurekaLoadingSpinner />
        </div>
      }
    >
      {showPlannerWizard ? <CampaignCreationWizard /> : <CampaignWizard />}
    </Suspense>
  );
}
