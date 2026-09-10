import type { CampaignStatus, CampaignType } from "@/types/organising-row-types";

/**
 * Badge variants for the campaign status and type pills. Extracted from
 * `app/(dashboard)/campaigns/page.tsx` (WP1.3) so the campaigns list and the
 * My campaigns cards read one definition. `campaign-detail-header-bar.tsx`
 * and `CampaignsMetricsTable.tsx` still carry their own copies — out of
 * scope here.
 */
export const STATUS_VARIANT: Record<CampaignStatus, "secondary" | "success" | "info" | "warning"> = {
  planning: "secondary",
  active: "success",
  completed: "info",
  suspended: "warning",
};

export const TYPE_VARIANT: Record<CampaignType, "default" | "info" | "warning" | "secondary"> = {
  bargaining: "info",
  organising: "default",
  mobilisation: "warning",
  political: "secondary",
};
