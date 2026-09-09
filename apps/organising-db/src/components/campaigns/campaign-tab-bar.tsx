"use client";

/**
 * CampaignTabBar — WP1.4. The only new component the campaign page mounts.
 *
 * page.tsx is not restructured. The whole <Tabs>…</Tabs> tree and every
 * TabsContent child stay exactly where they are; five slots inside it — the
 * top-level TabsList and the four cluster TabsLists — become this component.
 *
 *   full mode      renders today's markup for the requested cluster, with
 *                  labels taken from CAMPAIGN_TAB_REGISTRY instead of being
 *                  inline strings. The rendered text is unchanged, which is
 *                  what the full-mode fixture and snapshot pin.
 *   organiser mode renders the four-tab bar plus More for cluster="top",
 *                  and null for the four clusters — the Radix Tabs wrapper
 *                  and its `value` stay, so the correct TabsContent still
 *                  renders and every deep link still works.
 *
 * Mode is presentation, never permission: a muted item in More is disabled
 * with "Ask an admin to enable" (WP1.2's wording), but the surface itself
 * still renders on a deep link and the More trigger names it.
 */

import { ChevronDown } from "lucide-react";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";
import {
  PendingReviewTabTrigger,
  RoleCheckTabTrigger,
} from "@/components/campaigns/plan-tab-triggers";
import { CampaignSetupCards } from "@/components/campaigns/setup/campaign-setup-cards";
import {
  ORGANISER_TAB_LABELS,
  type CampaignNavModel,
  type CampaignSurfaceRef,
  type CampaignTabModel,
} from "@/lib/campaign/workspace-tabs";

/** WP1.2's wording for a module that is merely switched off. */
const MUTED_REASON = "Ask an admin to enable";

export type CampaignTabCluster = "top" | "plan" | "outcomes" | "workforce" | "outreach";

export interface CampaignTabBarProps {
  campaignId: string;
  canWrite: boolean;
  model: CampaignNavModel;
  /** Which cluster's row to draw in full mode; "top" for the primary bar. */
  cluster: CampaignTabCluster;
  onNavigate: (ref: CampaignSurfaceRef) => void;
  hasPlan: boolean;
  onImportWorkers: () => void;
}

export function CampaignTabBar(props: CampaignTabBarProps) {
  const { model, cluster } = props;

  if (model.mode === "full") {
    return cluster === "top" ? <FullTopBar model={model} /> : <FullClusterBar {...props} />;
  }

  // Organiser mode: the cluster rows are not drawn at all.
  return cluster === "top" ? <OrganiserBar {...props} /> : null;
}

// ── full mode ───────────────────────────────────────────────────────────

function FullTopBar({ model }: { model: CampaignNavModel }) {
  return (
    <TabsList className="flex flex-wrap h-auto gap-1">
      {model.tabs.map((tab) => (
        <TabsTrigger key={tab.id} value={tab.id}>
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

function FullClusterBar({
  model,
  cluster,
  campaignId,
}: Pick<CampaignTabBarProps, "model" | "cluster" | "campaignId">) {
  const tab = model.tabs.find((t) => t.id === cluster);
  if (!tab) return null;
  const numericId = Number(campaignId);
  return (
    <TabsList className="mb-4">
      {tab.subs.map((sub) => {
        // The two count-badged triggers keep their own components, and so
        // their live counts, unchanged.
        if (sub.id === "pending-review") {
          return <PendingReviewTabTrigger key={sub.id} campaignId={numericId} />;
        }
        if (sub.id === "role-check") {
          return <RoleCheckTabTrigger key={sub.id} campaignId={numericId} />;
        }
        return (
          <TabsTrigger key={sub.id} value={sub.id}>
            {sub.label}
          </TabsTrigger>
        );
      })}
    </TabsList>
  );
}

// ── organiser mode ──────────────────────────────────────────────────────

/** The same shape a TabsTrigger has, so the two modes read as one product. */
const PILL =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
const PILL_ACTIVE = "bg-background text-foreground shadow";
const PILL_IDLE = "text-muted-foreground hover:text-foreground";

function OrganiserBar({
  model,
  campaignId,
  canWrite,
  hasPlan,
  onNavigate,
  onImportWorkers,
}: CampaignTabBarProps) {
  const activeTab = model.tabs.find((t) => t.id === model.activeTabId) ?? null;

  return (
    <div className="space-y-4">
      <nav
        aria-label="Campaign sections"
        className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1"
      >
        {model.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-current={model.activeTabId === tab.id ? "page" : undefined}
            title={tab.state === "muted" ? MUTED_REASON : undefined}
            onClick={() => onNavigate(tab.href)}
            className={cn(
              PILL,
              model.activeTabId === tab.id ? PILL_ACTIVE : PILL_IDLE,
              // A tab is never removed (V5). When its module is off it is
              // dimmed and says why, but it stays navigable — the surface
              // renders either way.
              tab.state !== "on" && "opacity-60"
            )}
          >
            {tab.label}
          </button>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-current={model.activeTabId === null ? "page" : undefined}
              className={cn(
                PILL,
                "gap-1",
                model.activeTabId === null ? PILL_ACTIVE : PILL_IDLE
              )}
            >
              {ORGANISER_TAB_LABELS.more}
              {model.activeMoreLabel && <span>· {model.activeMoreLabel}</span>}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[70vh] w-64 overflow-y-auto">
            {model.more.map((group, i) => (
              <MoreGroup
                key={group.id}
                group={group}
                first={i === 0}
                onNavigate={onNavigate}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      {activeTab && activeTab.subs.length > 0 && (
        <nav
          aria-label={`${activeTab.label} views`}
          className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1"
        >
          {activeTab.subs.map((sub) => (
            <button
              key={sub.id}
              type="button"
              aria-current={model.activeSubId === sub.id ? "page" : undefined}
              title={sub.state === "muted" ? MUTED_REASON : undefined}
              onClick={() => onNavigate(sub.href)}
              className={cn(
                PILL,
                model.activeSubId === sub.id ? PILL_ACTIVE : PILL_IDLE,
                sub.state !== "on" && "opacity-60"
              )}
            >
              {sub.label}
            </button>
          ))}
        </nav>
      )}

      {model.activeTabId === "setup" && (
        <CampaignSetupCards
          campaignId={campaignId}
          canWrite={canWrite}
          hasPlan={hasPlan}
          onImportWorkers={onImportWorkers}
        />
      )}
    </div>
  );
}

function MoreGroup({
  group,
  first,
  onNavigate,
}: {
  group: CampaignTabModel;
  first: boolean;
  onNavigate: (ref: CampaignSurfaceRef) => void;
}) {
  // A tab with no sub-tabs of its own is one item, not a heading.
  if (group.subs.length === 0) {
    return (
      <>
        {!first && <DropdownMenuSeparator />}
        <MoreItem
          label={group.label}
          state={group.state}
          href={group.href}
          onNavigate={onNavigate}
        />
      </>
    );
  }
  return (
    <>
      {!first && <DropdownMenuSeparator />}
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        {group.label}
      </DropdownMenuLabel>
      {group.subs.map((sub) => (
        <MoreItem
          key={sub.id}
          label={sub.label}
          state={sub.state}
          href={sub.href}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}

function MoreItem({
  label,
  state,
  href,
  onNavigate,
}: {
  label: string;
  state: CampaignTabModel["state"];
  href: CampaignSurfaceRef;
  onNavigate: (ref: CampaignSurfaceRef) => void;
}) {
  if (state === "muted") {
    return (
      <DropdownMenuItem disabled className="flex-col items-start gap-0">
        <span>{label}</span>
        <span className="text-xs text-muted-foreground">{MUTED_REASON}</span>
      </DropdownMenuItem>
    );
  }
  return <DropdownMenuItem onClick={() => onNavigate(href)}>{label}</DropdownMenuItem>;
}
