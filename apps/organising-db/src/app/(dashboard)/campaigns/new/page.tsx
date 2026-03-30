import { Suspense } from "react";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";

export default function NewCampaignPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <EurekaLoadingSpinner />
        </div>
      }
    >
      <CampaignWizard />
    </Suspense>
  );
}
