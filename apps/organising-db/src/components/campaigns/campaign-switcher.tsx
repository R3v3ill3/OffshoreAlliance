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
 * is loading) this renders a plain span: no popover mounts, no keyboard
 * listener is registered.
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
import { MY_CAMPAIGNS_HREF } from "@/lib/nav/nav-model";
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

  if (collapsed) {
    return (
      <span className="min-w-0 truncate text-sm text-muted-foreground">{label}</span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-w-[14rem] shrink-0 justify-between gap-1"
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
              <CommandItem value="all-campaigns" onSelect={() => go(MY_CAMPAIGNS_HREF)}>
                All campaigns
                <CommandShortcut>{SWITCHER_CHORD_HINT}</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
