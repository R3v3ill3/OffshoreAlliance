"use client";

/**
 * OrganiserCampaignActions — WP1.4, the organiser-mode half of the campaign
 * header's action strip.
 *
 * Decision 7 was amended to "no creation path is retired; visibility and
 * prominence are reduced instead", so all twelve of appendix D 3.3's actions
 * keep a home. This component renders three controls —
 *
 *   New action ▾   Call list, SMS, Email, Task list, Assessment
 *   Build list     the existing ?buildList=1 toggle, promoted to top level
 *   ⋯              Import worker list, Task management, Re-run wizard,
 *                  All settings, View full plan
 *
 * — and the remaining two (the back arrow and the basics pencil) are
 * unchanged in campaign-detail-header-bar.tsx. The mapping is asserted as a
 * test in src/lib/campaign/__tests__/campaign-header-actions.fixture.ts.
 *
 * The three orchestrators are Link wrappers around whatever is passed as
 * `trigger`, so a DropdownMenuItem passed as the trigger becomes a menu item
 * inside an anchor — one navigation on click, no dialog to keep open, and no
 * `open`/`onOpenChange` fallback needed. The two dialogs (Assessment, Task
 * list) are mounted once, by the header bar, and opened through the setters
 * passed in here.
 */

import {
  ClipboardList,
  Ellipsis,
  ListChecks,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Settings as SettingsIcon,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateEmailOrchestrator } from "@/components/email/CreateEmailOrchestrator";
import { CreatePhoneCallOrchestrator } from "@/components/phone/CreatePhoneCallOrchestrator";
import { CreateSmsOrchestrator } from "@/components/sms/CreateSmsOrchestrator";

export interface OrganiserCampaignActionsProps {
  campaignId: string;
  isBuildListOpen: boolean;
  onToggleBuildList: () => void;
  onImportWorkers: () => void;
  onCreateAssessment: () => void;
  onCreateTaskList: () => void;
}

export function OrganiserCampaignActions({
  campaignId,
  isBuildListOpen,
  onToggleBuildList,
  onImportWorkers,
  onCreateAssessment,
  onCreateTaskList,
}: OrganiserCampaignActionsProps) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New action
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <CreatePhoneCallOrchestrator
            campaignId={campaignId}
            trigger={
              <DropdownMenuItem>
                <Phone className="h-4 w-4 mr-2" />
                Call list
              </DropdownMenuItem>
            }
          />
          <CreateSmsOrchestrator
            campaignId={campaignId}
            trigger={
              <DropdownMenuItem>
                <MessageSquare className="h-4 w-4 mr-2" />
                SMS
              </DropdownMenuItem>
            }
          />
          <CreateEmailOrchestrator
            campaignId={campaignId}
            trigger={
              <DropdownMenuItem>
                <Mail className="h-4 w-4 mr-2" />
                Email
              </DropdownMenuItem>
            }
          />
          <DropdownMenuItem onClick={onCreateTaskList}>
            <ListChecks className="h-4 w-4 mr-2" />
            Task list
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onCreateAssessment}>
            <ClipboardList className="h-4 w-4 mr-2" />
            Assessment
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-pressed={isBuildListOpen}
        onClick={onToggleBuildList}
        title={
          isBuildListOpen
            ? "Close build list panel"
            : "Open build list panel — drag tiles, units or selections to assemble a cohort"
        }
      >
        Build list
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" title="More campaign actions" aria-label="More campaign actions">
            <Ellipsis className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onImportWorkers}>
            <Upload className="h-4 w-4 mr-2" />
            Import worker list
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`/campaigns/${campaignId}?tab=plan&sub=task-lists&from=header`}>
              Task management
            </a>
          </DropdownMenuItem>
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
  );
}
