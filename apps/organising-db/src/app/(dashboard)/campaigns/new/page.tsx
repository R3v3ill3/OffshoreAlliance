"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";
import { CampaignCreationWizard } from "@/components/campaigns/planner-wizard";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";

function WizardEntryPoint() {
  const searchParams = useSearchParams();
  const plannerKeys = ["campaign_id", "agreement_id", "organiser_id", "expiry_date"];

  const showPlannerWizard = plannerKeys.some((key) => {
    const value = searchParams.get(key);
    return !!value && value.length > 0;
  });

  return showPlannerWizard ? <CampaignCreationWizard /> : <CampaignWizard />;
}

export default function NewCampaignPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <EurekaLoadingSpinner />
        </div>
      }
    >
      <WizardEntryPoint />
    </Suspense>
  );
}
