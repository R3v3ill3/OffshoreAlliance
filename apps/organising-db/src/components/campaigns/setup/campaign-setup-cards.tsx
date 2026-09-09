"use client";

/**
 * CampaignSetupCards — WP1.4, organiser mode only.
 *
 * Plan 5.4's Setup tab names five things. Two of them — Who's in and Units —
 * are real ?sub= surfaces and are the tab's sub-row. The other three
 * (Organisers, Basics, "add a strategic plan") have no ?tab=&sub= today, so
 * they are link cards above the sub-row, each pointing at where the feature
 * already lives. Nothing new is built here: all five destinations exist.
 *
 * Building in-place editors for Organisers and Basics is the setup-checklist
 * work in WP3.1/WP3.2 and is deliberately out of scope.
 */

import Link from "next/link";
import { FileText, Pencil, Upload, Users, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface CampaignSetupCardsProps {
  campaignId: string;
  canWrite: boolean;
  /** The campaign has at least one stage plan; changes this card's copy only. */
  hasPlan: boolean;
  /** Opens the WorkerImportWizard the page already mounts. */
  onImportWorkers: () => void;
}

export function CampaignSetupCards({
  campaignId,
  canWrite,
  hasPlan,
  onImportWorkers,
}: CampaignSetupCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SetupCard
        icon={<Users className="h-4 w-4 text-muted-foreground" />}
        title="Organisers"
        description="Who is on this campaign, and in which role."
      >
        <Button variant="outline" size="sm" asChild>
          <Link href={`/campaigns/${campaignId}/plan#campaign-team`}>Manage team</Link>
        </Button>
      </SetupCard>

      <SetupCard
        icon={<Pencil className="h-4 w-4 text-muted-foreground" />}
        title="Basics"
        description="Name, type, status, dates and the lead organiser."
      >
        <Button variant="outline" size="sm" asChild>
          <Link href={`/campaigns/${campaignId}/settings`}>Basics &amp; all settings</Link>
        </Button>
      </SetupCard>

      <SetupCard
        icon={<FileText className="h-4 w-4 text-muted-foreground" />}
        title="Strategic plan"
        description={
          hasPlan
            ? "The Playing to Win stages, gates and ambitions for this campaign."
            : "This campaign has no strategic plan yet."
        }
      >
        <Button variant="outline" size="sm" asChild>
          <Link href={`/campaigns/${campaignId}/plan`}>
            {hasPlan ? "View full plan" : "Add a strategic plan"}
          </Link>
        </Button>
      </SetupCard>

      {canWrite && (
        <SetupCard
          icon={<Upload className="h-4 w-4 text-muted-foreground" />}
          title="Import worker list"
          description="Bring a spreadsheet of workers into this campaign."
        >
          <Button variant="outline" size="sm" onClick={onImportWorkers}>
            Import worker list
          </Button>
        </SetupCard>
      )}

      {canWrite && (
        <SetupCard
          icon={<Wand2 className="h-4 w-4 text-muted-foreground" />}
          title="Re-run wizard"
          description="Step back through the setup wizard for this campaign."
        >
          <Button variant="outline" size="sm" asChild>
            <Link href={`/campaigns/new?cid=${campaignId}&edit=1`}>Re-run wizard</Link>
          </Button>
        </SetupCard>
      )}
    </div>
  );
}

function SetupCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
