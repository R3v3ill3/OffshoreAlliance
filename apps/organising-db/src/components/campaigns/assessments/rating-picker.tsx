"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VOTE_SUPPORTER_OPTIONS } from "@/lib/campaign/constants";
import { RATING_LEVELS } from "@/types/planner-types";

export type RatingPickerValue = {
  rating: number | null;
  binary_value: string | null;
};

export type RatingPickerProps = {
  value: RatingPickerValue;
  onChange: (value: RatingPickerValue) => void;
  isBinary: boolean;
  disabled?: boolean;
  placeholder?: string;
};

const UNASSESSED_VALUE = "__unassessed__";

export function RatingPicker({
  value,
  onChange,
  isBinary,
  disabled,
  placeholder,
}: RatingPickerProps) {
  if (isBinary) {
    const current = value.binary_value ?? UNASSESSED_VALUE;
    return (
      <Select
        value={current}
        onValueChange={(v) => {
          if (v === UNASSESSED_VALUE) {
            onChange({ rating: null, binary_value: null });
          } else {
            onChange({ rating: null, binary_value: v });
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder ?? "Select outcome…"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSESSED_VALUE}>Unassessed</SelectItem>
          {VOTE_SUPPORTER_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const current = value.rating == null ? "0" : String(value.rating);
  return (
    <Select
      value={current}
      onValueChange={(v) => {
        const n = Number(v);
        if (n === 0) {
          onChange({ rating: null, binary_value: null });
        } else {
          onChange({ rating: n, binary_value: null });
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder ?? "Select rating…"} />
      </SelectTrigger>
      <SelectContent>
        {RATING_LEVELS.map((lvl) => (
          <SelectItem key={lvl.value} value={String(lvl.value)}>
            {lvl.value === 0 ? "Unassessed" : `${lvl.value} — ${lvl.label}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
