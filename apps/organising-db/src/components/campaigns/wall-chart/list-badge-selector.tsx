"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  LIST_ACTIVITY_CHANNELS,
  LIST_ACTIVITY_CHANNEL_LABELS,
  type ListActivityChannel,
} from "./types";

/** Resolve the channels a unit should show badges for: its override, else the campaign default. */
export function effectiveBadgesForScope(
  override: ReadonlySet<ListActivityChannel> | undefined,
  campaignDefault: ReadonlySet<ListActivityChannel>
): ReadonlySet<ListActivityChannel> {
  return override ?? campaignDefault;
}

function toggleChannel(
  set: ReadonlySet<ListActivityChannel>,
  channel: ListActivityChannel
): Set<ListActivityChannel> {
  const next = new Set(set);
  if (next.has(channel)) next.delete(channel);
  else next.add(channel);
  return next;
}

function summaryLabel(channels: ReadonlySet<ListActivityChannel>): string {
  if (channels.size === 0) return "none";
  return LIST_ACTIVITY_CHANNELS.filter((c) => channels.has(c))
    .map((c) => LIST_ACTIVITY_CHANNEL_LABELS[c])
    .join(", ");
}

export type ListBadgeSelectorProps = {
  /** Currently enabled channels (campaign default applied to all units). */
  value: ReadonlySet<ListActivityChannel>;
  onChange: (next: Set<ListActivityChannel>) => void;
};

/**
 * Campaign-level multi-select: choose which list-activity badges (phone / email
 * / activist list / sms) appear on every worker tile, unless a unit overrides.
 */
export function ListBadgeSelector({ value, onChange }: ListBadgeSelectorProps) {
  return (
    <div className="flex flex-col gap-1 min-w-[12rem]">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        List badges (campaign default)
      </Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={value.size > 0 ? "secondary" : "outline"}
            size="sm"
            className="h-8 justify-between text-xs font-normal"
          >
            <span className="truncate">Badges: {summaryLabel(value)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Show badges for
            </p>
            <div className="space-y-1">
              {LIST_ACTIVITY_CHANNELS.map((channel) => (
                <Label
                  key={channel}
                  className="flex items-center gap-2 text-xs cursor-pointer"
                >
                  <Checkbox
                    checked={value.has(channel)}
                    onCheckedChange={() => onChange(toggleChannel(value, channel))}
                  />
                  <span className="flex-1 truncate">
                    {LIST_ACTIVITY_CHANNEL_LABELS[channel]}
                  </span>
                </Label>
              ))}
            </div>
            {value.size > 0 && (
              <div className="pt-2 border-t">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(new Set())}
                  className="h-7 px-2 text-xs"
                >
                  Clear
                </Button>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export type UnitListBadgeControlProps = {
  /** Campaign-level default (used when this unit inherits). */
  campaignDefault: ReadonlySet<ListActivityChannel>;
  /** When undefined, this unit inherits `campaignDefault`. */
  override: ReadonlySet<ListActivityChannel> | undefined;
  onChangeOverride: (next: Set<ListActivityChannel> | undefined) => void;
};

/**
 * Per-unit override for which list badges show on its worker tiles: inherit the
 * campaign default, or pick a custom set of channels.
 */
export function UnitListBadgeControl({
  campaignDefault,
  override,
  onChangeOverride,
}: UnitListBadgeControlProps) {
  const inheriting = override === undefined;
  const effective = effectiveBadgesForScope(override, campaignDefault);

  const triggerLabel = inheriting
    ? `Badges: default (${summaryLabel(campaignDefault)})`
    : `Badges: ${summaryLabel(effective)}`;

  const handleToggle = (channel: ListActivityChannel) => {
    // First edit while inheriting forks a custom set off the current default.
    const base = inheriting ? campaignDefault : effective;
    onChangeOverride(toggleChannel(base, channel));
  };

  return (
    <div className="flex flex-col gap-0.5 min-w-[8rem] max-w-[11rem]">
      <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">
        Badges
      </Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={inheriting ? "outline" : "secondary"}
            size="sm"
            className="h-7 justify-between px-2 text-[10px] font-normal"
          >
            <span className="truncate">{triggerLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-52">
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={inheriting}
                onCheckedChange={(checked) => {
                  if (checked) onChangeOverride(undefined);
                  else onChangeOverride(new Set(campaignDefault));
                }}
              />
              <span className="flex-1 truncate">
                Use campaign default ({summaryLabel(campaignDefault)})
              </span>
            </Label>
            <div className="space-y-1 pt-1 border-t">
              {LIST_ACTIVITY_CHANNELS.map((channel) => (
                <Label
                  key={channel}
                  className="flex items-center gap-2 text-xs cursor-pointer"
                >
                  <Checkbox
                    checked={effective.has(channel)}
                    disabled={inheriting}
                    onCheckedChange={() => handleToggle(channel)}
                  />
                  <span className="flex-1 truncate">
                    {LIST_ACTIVITY_CHANNEL_LABELS[channel]}
                  </span>
                </Label>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
