"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  ChevronDown,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCampaign } from "@/lib/hooks/usePlannerCampaigns";
import { SMS_EPISODE_TOOLS_HREF } from "@/lib/campaign/visible-campaigns";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MobileNav } from "@/components/layout/mobile-nav";
import { CampaignBasicsEditSheet } from "@/components/campaigns/campaign-basics-edit-sheet";
import { CreateAssessmentDialog } from "@/components/campaigns/assessments/create-assessment-dialog";
import { CreatePhoneCallOrchestrator } from "@/components/phone/CreatePhoneCallOrchestrator";
import { ResumeBanner } from "@/components/phone/orchestrator/ResumeBanner";
import { CreateEmailOrchestrator } from "@/components/email/CreateEmailOrchestrator";
import { EmailResumeBanner } from "@/components/email/orchestrator/EmailResumeBanner";
import { CreateSmsOrchestrator } from "@/components/sms/CreateSmsOrchestrator";
import { SmsResumeBanner } from "@/components/sms/orchestrator/SmsResumeBanner";
import type { CampaignStatus, CampaignType } from "@/types/database";

const STATUS_VARIANT: Record<CampaignStatus, "secondary" | "success" | "info" | "warning"> = {
  planning: "secondary",
  active: "success",
  completed: "info",
  suspended: "warning",
};

const TYPE_VARIANT: Record<CampaignType, "default" | "info" | "warning" | "secondary"> = {
  bargaining: "info",
  organising: "default",
  mobilisation: "warning",
  political: "secondary",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd MMM yyyy");
  } catch {
    return d;
  }
}

interface CampaignDetailHeaderBarProps {
  campaignId: string;
}

export function CampaignDetailHeaderBar({ campaignId }: CampaignDetailHeaderBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { canWrite } = useAuth();

  const numericCampaignId = Number(campaignId);
  const campaignIdValid = Number.isFinite(numericCampaignId);

  const [basicsSheetOpen, setBasicsSheetOpen] = useState(false);
  const [createAssessmentOpen, setCreateAssessmentOpen] = useState(false);

  const isBuildListOpen = searchParams.get("buildList") === "1";
  const handleToggleBuildList = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    const currentlyOpen = params.get("buildList") === "1";
    if (currentlyOpen) {
      params.delete("buildList");
    } else {
      params.set("buildList", "1");
      params.set("tab", "workforce");
      params.set("sub", "wall-chart");
      params.delete("view");
    }
    const qs = params.toString();
    const mainCampaignPath = `/campaigns/${campaignId}`;
    const onMainCampaignPage =
      pathname === mainCampaignPath || pathname === `${mainCampaignPath}/`;
    const targetPath =
      currentlyOpen || onMainCampaignPage ? pathname : mainCampaignPath;
    router.replace(`${targetPath}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [campaignId, pathname, router, searchParams]);

  const { data: campaign, isLoading } = useCampaign(numericCampaignId, {
    enabled: campaignIdValid,
  });

  useEffect(() => {
    if (campaign?.is_sms_episode) {
      router.replace(SMS_EPISODE_TOOLS_HREF);
    }
  }, [campaign, router]);

  const actionButtons = canWrite ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Build
            <ChevronDown className="h-4 w-4 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DropdownMenuCheckboxItem
            checked={isBuildListOpen}
            onCheckedChange={() => handleToggleBuildList()}
            title={
              isBuildListOpen
                ? "Close build list panel"
                : "Open build list panel — drag tiles, units or selections to assemble a cohort"
            }
          >
            Build list
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateAssessmentOpen(true)}>
            Add assessment
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`/campaigns/${campaignId}?tab=plan&sub=task-lists&from=header`}>
              Task management
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreatePhoneCallOrchestrator
        campaignId={campaignId}
        trigger={
          <Button type="button" size="sm">
            <Phone className="h-4 w-4 mr-2" />
            Create Phone Call
          </Button>
        }
      />
      <CreateEmailOrchestrator
        campaignId={campaignId}
        trigger={
          <Button type="button" size="sm">
            <Mail className="h-4 w-4 mr-2" />
            Create Email
          </Button>
        }
      />
      <CreateSmsOrchestrator
        campaignId={campaignId}
        trigger={
          <Button type="button" size="sm">
            <MessageSquare className="h-4 w-4 mr-2" />
            Create SMS
          </Button>
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Actions
            <ChevronDown className="h-4 w-4 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => router.push(`/campaigns/new?cid=${campaignId}&edit=1`)}
          >
            <Pencil className="h-4 w-4 mr-2" />
            Re-run wizard
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => router.push(`/campaigns/${campaignId}/settings`)}
          >
            <SettingsIcon className="h-4 w-4 mr-2" />
            All settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`/campaigns/${campaignId}/plan`)}>
            View full plan
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ) : null;

  if (campaign?.is_sms_episode) {
    return null;
  }

  return (
    <>
      <header className="border-b bg-background px-4 md:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 md:py-3">
          <MobileNav />
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => router.push("/campaigns")}
            title="Back to campaigns"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="min-w-0 flex-1">
            {isLoading || !campaign ? (
              <div className="space-y-1">
                <div className="h-6 w-48 max-w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-36 max-w-full animate-pulse rounded bg-muted" />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h1 className="truncate text-base font-semibold md:text-lg">{campaign.name}</h1>
                  {canWrite && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => setBasicsSheetOpen(true)}
                      title="Edit campaign basics"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Badge variant={TYPE_VARIANT[campaign.campaign_type as CampaignType]}>
                    {campaign.campaign_type}
                  </Badge>
                  <Badge variant={STATUS_VARIANT[campaign.status as CampaignStatus]}>
                    {campaign.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground md:text-sm">
                  {formatDate(campaign.start_date)} — {formatDate(campaign.end_date)}
                </p>
              </>
            )}
          </div>

          {actionButtons}
        </div>

        {campaignIdValid && (
          <div className="pb-2 space-y-2">
            <ResumeBanner campaignId={campaignId} />
            <EmailResumeBanner campaignId={campaignId} />
            <SmsResumeBanner campaignId={campaignId} />
          </div>
        )}
      </header>

      {campaign && campaignIdValid && (
        <>
          <CampaignBasicsEditSheet
            open={basicsSheetOpen}
            onOpenChange={setBasicsSheetOpen}
            campaign={campaign}
            campaignId={numericCampaignId}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] })}
          />
          <CreateAssessmentDialog
            campaignId={String(campaignId)}
            open={createAssessmentOpen}
            onOpenChange={setCreateAssessmentOpen}
            lockKind="assessment"
            onCreated={() => {
              queryClient.invalidateQueries({
                queryKey: ["campaign-rating-summary", numericCampaignId],
              });
              queryClient.invalidateQueries({
                queryKey: ["campaign-assessments-rated", numericCampaignId],
              });
            }}
          />
        </>
      )}
    </>
  );
}
