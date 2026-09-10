"use client";

import { useRouter } from "next/navigation";
import { Wand2, Settings as SettingsIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The create-campaign selector, extracted verbatim from
 * `app/(dashboard)/campaigns/page.tsx` (WP1.3). Same two options, same copy,
 * same destinations (`/campaigns/new`, `/campaigns/new/manual`) — no new
 * creation path (decision 7, Amended). Rendered by `/campaigns`'s strip
 * button and by the My campaigns "New campaign" button.
 */
export function CreateCampaignDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a new campaign</DialogTitle>
          <DialogDescription>
            Choose how you&apos;d like to set up the campaign.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <button
            type="button"
            onClick={() => { onOpenChange(false); router.push("/campaigns/new"); }}
            className="flex items-start gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="mt-0.5 shrink-0 rounded-md bg-primary/10 p-2 text-primary">
              <Wand2 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold leading-tight">Campaign wizard</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Guided step-by-step setup. Walk through employers, worksites,
                agreements, worker estimates, units, ambitions, and hand off to
                the planner — all in one flow.
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => { onOpenChange(false); router.push("/campaigns/new/manual"); }}
            className="flex items-start gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="mt-0.5 shrink-0 rounded-md bg-muted p-2 text-muted-foreground">
              <SettingsIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold leading-tight">Manual create</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter just the campaign name, type, and status to create the
                record instantly, then configure every section — employers,
                agreements, units, ambitions — from one settings page at your
                own pace. Best for power users who already know what they want.
              </p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
