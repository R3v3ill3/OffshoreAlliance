"use client";

import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CampaignDataField, FactFilter } from "@/lib/campaign-facts/types";
import { enumOptionLabel, enumOptionValue } from "@/lib/campaign-facts/values";

export function FactFilterControls({
  fields,
  filters,
  onChange,
}: {
  fields: CampaignDataField[];
  filters: FactFilter[];
  onChange: (next: FactFilter[]) => void;
}) {
  const filterable = fields.filter((f) => f.filterable);
  if (filterable.length === 0) return null;

  const upsert = (fieldId: number, next: FactFilter | null) => {
    const rest = filters.filter((f) => f.field_id !== fieldId);
    onChange(next ? [...rest, next] : rest);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Data fields</p>
      {filterable.map((field) => {
        const current = filters.find((f) => f.field_id === field.field_id);
        return (
          <div key={field.field_id} className="space-y-1.5">
            <Label className="text-xs">{field.label}</Label>
            {field.value_type === "boolean" ? (
              <Select
                value={
                  current?.op === "missing"
                    ? "missing"
                    : current?.bool === true
                      ? "yes"
                      : current?.bool === false
                        ? "no"
                        : "any"
                }
                onValueChange={(v) => {
                  if (v === "any") upsert(field.field_id, null);
                  else if (v === "missing") {
                    upsert(field.field_id, { field_id: field.field_id, op: "missing" });
                  } else {
                    upsert(field.field_id, {
                      field_id: field.field_id,
                      op: "eq",
                      bool: v === "yes",
                    });
                  }
                }}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="missing">Not recorded</SelectItem>
                </SelectContent>
              </Select>
            ) : field.value_type === "enum" || field.value_type === "multi_enum" ? (
              <div className="flex flex-wrap gap-1.5">
                {(field.enum_options ?? []).map((o) => {
                  const v = enumOptionValue(o);
                  const on = current?.enums?.includes(v) ?? false;
                  return (
                    <label key={v} className="flex items-center gap-1 text-xs">
                      <Checkbox
                        checked={on}
                        onCheckedChange={() => {
                          const set = new Set(current?.enums ?? []);
                          if (on) set.delete(v);
                          else set.add(v);
                          upsert(
                            field.field_id,
                            set.size === 0
                              ? null
                              : { field_id: field.field_id, op: "in", enums: [...set] }
                          );
                        }}
                      />
                      {enumOptionLabel(o)}
                    </label>
                  );
                })}
              </div>
            ) : field.value_type === "integer" || field.value_type === "scale" ? (
              <div className="flex items-center gap-1">
                <Input
                  className="h-8 w-16"
                  type="number"
                  placeholder="min"
                  value={current?.int ?? ""}
                  onChange={(e) => {
                    const n = e.target.value === "" ? undefined : Number(e.target.value);
                    const max = current?.int_max;
                    if (n == null && max == null) upsert(field.field_id, null);
                    else {
                      upsert(field.field_id, {
                        field_id: field.field_id,
                        op: "between",
                        int: n ?? field.scale_min ?? 0,
                        int_max: max ?? field.scale_max ?? 99,
                      });
                    }
                  }}
                />
                <span className="text-xs text-muted-foreground">–</span>
                <Input
                  className="h-8 w-16"
                  type="number"
                  placeholder="max"
                  value={current?.int_max ?? ""}
                  onChange={(e) => {
                    const max = e.target.value === "" ? undefined : Number(e.target.value);
                    const n = current?.int;
                    if (n == null && max == null) upsert(field.field_id, null);
                    else {
                      upsert(field.field_id, {
                        field_id: field.field_id,
                        op: "between",
                        int: n ?? field.scale_min ?? 0,
                        int_max: max ?? field.scale_max ?? 99,
                      });
                    }
                  }}
                />
              </div>
            ) : (
              <Input
                className="h-8"
                placeholder="Contains…"
                value={current?.text ?? ""}
                onChange={(e) => {
                  const t = e.target.value.trim();
                  upsert(
                    field.field_id,
                    t
                      ? { field_id: field.field_id, op: "contains", text: t }
                      : null
                  );
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
