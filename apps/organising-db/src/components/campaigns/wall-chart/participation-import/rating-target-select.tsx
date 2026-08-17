"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RATING_LEVELS } from "@/types/planner-types";
import { VOTE_SUPPORTER_OPTIONS } from "@/lib/campaign/constants";
import type { ResponseValueTarget } from "@/lib/import/participation-import-shared";

const IGNORE = "__ignore__";

/** Import targets extend the vote options with "maybe" (neutral, never supportive). */
const IMPORT_BINARY_OPTIONS: { value: string; label: string }[] = [
  ...VOTE_SUPPORTER_OPTIONS,
  { value: "maybe", label: "Maybe" },
];

/**
 * Picker for what a response value (or the whole import) maps to:
 * a 1–5 rating (with the campaign's labels) or a binary value.
 */
export function RatingTargetSelect({
  value,
  onChange,
  isBinary,
  ratingLabels,
  allowIgnore = false,
  className,
}: {
  value: ResponseValueTarget;
  onChange: (next: ResponseValueTarget) => void;
  /** Whether the target assessment is binary. */
  isBinary: boolean;
  /** Custom per-assessment 1–5 labels (keys "1".."5"). */
  ratingLabels?: Record<string, string> | null;
  allowIgnore?: boolean;
  className?: string;
}) {
  const current =
    value.kind === "ignore"
      ? IGNORE
      : value.kind === "rating"
        ? `r${value.rating}`
        : `b${value.value}`;

  function handleChange(next: string) {
    if (next === IGNORE) onChange({ kind: "ignore" });
    else if (next.startsWith("r"))
      onChange({ kind: "rating", rating: Number(next.slice(1)) as 1 | 2 | 3 | 4 | 5 });
    else onChange({ kind: "binary", value: next.slice(1) });
  }

  return (
    <Select value={current} onValueChange={handleChange}>
      <SelectTrigger className={className ?? "h-8 w-56 text-xs"}>
        <SelectValue placeholder="Map to…" />
      </SelectTrigger>
      <SelectContent>
        {allowIgnore && (
          <SelectItem value={IGNORE} className="text-xs">
            Don&apos;t record (ignore)
          </SelectItem>
        )}
        {isBinary
          ? IMPORT_BINARY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={`b${o.value}`} className="text-xs">
                {o.label}
              </SelectItem>
            ))
          : RATING_LEVELS.filter((l) => l.value >= 1).map((l) => (
              <SelectItem key={l.value} value={`r${l.value}`} className="text-xs">
                <span className="inline-flex items-center gap-2">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${l.tailwindBg}`}
                    aria-hidden
                  />
                  {l.value} — {ratingLabels?.[String(l.value)] || l.label}
                </span>
              </SelectItem>
            ))}
      </SelectContent>
    </Select>
  );
}
