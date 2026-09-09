"use client";

/**
 * CampaignSwitcher — WP1.4, organiser mode only.
 *
 * Appendix D §6 records that there is no global campaign switcher at all
 * today, and that inside a campaign the only way to another campaign is
 * Back → the list. This is the organiser-mode answer: a recency-sorted
 * popover in the campaign header.
 *
 * Plan §4 principle 16 asks for it to collapse "to a label for
 * single-campaign users", so with one campaign (or none, or while the list
 * is loading) this renders a plain heading: no popover mounts, no keyboard
 * listener is registered.
 *
 * Either way the name is inside the page's `<h1>`, because organiser mode's
 * header shows the campaign name here and nowhere else.
 *
 * Full mode is byte-for-byte today's header, so the switcher is not
 * rendered there. Adding it later is one condition removed in
 * campaign-detail-header-bar.tsx.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ALL_CAMPAIGNS_HREF, MY_CAMPAIGNS_HREF } from "@/lib/nav/nav-model";
import {
  SWITCHER_CHORD_HINT,
  stepChord,
  toShortcutKeyEvent,
  type ChordState,
} from "@/lib/campaign/switcher-shortcut";
import { useSwitcherCampaigns } from "@/lib/hooks/useSwitcherCampaigns";

interface CampaignSwitcherProps {
  /** The campaign currently open, so it can be marked and named. */
  campaignId: string;
  /** The open campaign's name, from the header's own useCampaign(). */
  campaignName: string | null;
}

export function CampaignSwitcher({ campaignId, campaignName }: CampaignSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: campaigns, isLoading } = useSwitcherCampaigns();

  const numericId = Number(campaignId);
  const current = campaigns.find((c) => c.campaign_id === numericId);
  const label = campaignName ?? current?.name ?? "Campaign";
  // One campaign is not a choice; nor is a list that has not arrived.
  const collapsed = isLoading || campaigns.length <= 1;

  const pending = useRef<ChordState | null>(null);
  useEffect(() => {
    // R5/R3: no listener at all on the plain-label branch.
    if (collapsed) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      const next = stepChord(pending.current, toShortcutKeyEvent(ev), Date.now());
      pending.current = next.pending;
      if (next.open) {
        ev.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [collapsed]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  // WP1.4 fix round 1: in organiser mode the header no longer repeats the
  // campaign name in a second block, so this control *is* the page heading.
  // Both branches are an <h1> carrying the name, styled as the heading it
  // replaces, so the document keeps exactly one h1 either way.
  if (collapsed) {
    return (
      <h1 className="min-w-0 truncate text-base font-semibold md:text-lg">{label}</h1>
    );
  }

  return (
    <h1 className="min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="max-w-[14rem] shrink-0 justify-between gap-1 text-base font-semibold md:text-lg"
            aria-haspopup="listbox"
            aria-expanded={open}
            title={`Switch campaign (${SWITCHER_CHORD_HINT})`}
          >
            <span className="truncate">{label}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Find a campaign" />
            <CommandList>
              <CommandEmpty>No campaign found.</CommandEmpty>
              <CommandGroup heading="Recent">
                {campaigns.map((c) => (
                  <CommandItem
                    key={c.campaign_id}
                    value={`${c.name} ${c.campaign_id}`}
                    onSelect={() => go(`/campaigns/${c.campaign_id}`)}
                  >
                    <span className="truncate">{c.name}</span>
                    {c.isTeam && (
                      <span className="ml-auto pl-2 text-xs text-muted-foreground">Team</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                {/* Two destinations, because they are two different pages:
                    "All campaigns" is plan 5.4's wording and must mean the
                    full list at /campaigns, so WP1.3's personal home gets its
                    own row rather than quietly taking the other one's label. */}
                <CommandItem
                  value="my-campaigns"
                  onSelect={() => go(MY_CAMPAIGNS_HREF)}
                >
                  My campaigns
                  <CommandShortcut>{SWITCHER_CHORD_HINT}</CommandShortcut>
                </CommandItem>
                <CommandItem value="all-campaigns" onSelect={() => go(ALL_CAMPAIGNS_HREF)}>
                  All campaigns
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </h1>
  );
}
