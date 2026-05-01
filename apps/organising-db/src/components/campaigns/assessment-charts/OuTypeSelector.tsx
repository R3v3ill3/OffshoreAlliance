"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { humanizeOuType } from "@/components/campaigns/wall-chart/types";
import type { OuGroup } from "@/lib/hooks/useAssessmentDistributions";

interface OuTypeSelectorProps {
  groups: OuGroup[];
  value: string | null;
  onChange: (ouType: string | null) => void;
}

export function OuTypeSelector({ groups, value, onChange }: OuTypeSelectorProps) {
  if (groups.length <= 1) return null;

  const selectValue = value ?? "__null__";

  const handleChange = (v: string) => {
    onChange(v === "__null__" ? null : v);
  };

  return (
    <div className="flex flex-col gap-1 min-w-[12rem]">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Group units by
      </Label>
      <Select value={selectValue} onValueChange={handleChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {groups.map((g) => (
            <SelectItem key={g.ouType ?? "__null__"} value={g.ouType ?? "__null__"}>
              {humanizeOuType(g.ouType)} ({g.units.length} unit{g.units.length !== 1 ? "s" : ""})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
