"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api/fetch-api";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { useCampaignDataFields } from "@/lib/hooks/useCampaignDataFields";
import {
  FACT_CATEGORIES,
  FACT_CATEGORY_LABELS,
  FACT_VALUE_TYPE_LABELS,
  FACT_VALUE_TYPES,
  type CampaignDataField,
  type FactCategory,
  type FactValueType,
} from "@/lib/campaign-facts/types";
import { enumOptionLabel, enumOptionValue } from "@/lib/campaign-facts/values";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { CampaignFactsReport } from "./campaign-facts-report";

type Draft = {
  label: string;
  category: FactCategory;
  value_type: FactValueType;
  fieldset_id: string;
  optionsText: string;
  scale_min: string;
  scale_max: string;
  filterable: boolean;
  sortable: boolean;
};

const EMPTY_DRAFT = (): Draft => ({
  label: "",
  category: "claims",
  value_type: "boolean",
  fieldset_id: "none",
  optionsText: "",
  scale_min: "1",
  scale_max: "5",
  filterable: true,
  sortable: false,
});

export function CampaignDataFieldsSection({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useCampaignDataFields(campaignId);
  const fields = data?.fields ?? [];
  const fieldsets = data?.fieldsets ?? [];
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [newSetTitle, setNewSetTitle] = useState("");
  const [reportCategory, setReportCategory] = useState<FactCategory | "all">("all");

  const grouped = useMemo(() => {
    const bySet = new Map<number | "none", CampaignDataField[]>();
    bySet.set("none", []);
    for (const s of fieldsets) bySet.set(s.fieldset_id, []);
    for (const f of fields) {
      const key = f.fieldset_id ?? "none";
      const arr = bySet.get(key) ?? [];
      arr.push(f);
      bySet.set(key, arr);
    }
    return bySet;
  }, [fields, fieldsets]);

  const createField = useAuthAwareMutation({
    mutationFn: async () => {
      const options = draft.optionsText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const res = await fetchApi(`/api/campaigns/${campaignId}/data-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: draft.label,
          category: draft.category,
          value_type: draft.value_type,
          fieldset_id:
            draft.fieldset_id === "none" ? null : Number(draft.fieldset_id),
          enum_options:
            draft.value_type === "enum" || draft.value_type === "multi_enum"
              ? options
              : null,
          scale_min:
            draft.value_type === "scale" || draft.value_type === "integer"
              ? Number(draft.scale_min) || null
              : null,
          scale_max:
            draft.value_type === "scale" || draft.value_type === "integer"
              ? Number(draft.scale_max) || null
              : null,
          filterable: draft.filterable,
          sortable: draft.sortable || draft.value_type === "integer" || draft.value_type === "scale",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Create failed");
      return json;
    },
    onSuccess: () => {
      toast.success("Field added");
      setDraft(EMPTY_DRAFT());
      queryClient.invalidateQueries({ queryKey: ["campaign-data-fields", campaignId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createSet = useAuthAwareMutation({
    mutationFn: async () => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/data-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "fieldset",
          title: newSetTitle,
          category: draft.category,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Create failed");
      return json;
    },
    onSuccess: () => {
      toast.success("Group added");
      setNewSetTitle("");
      queryClient.invalidateQueries({ queryKey: ["campaign-data-fields", campaignId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteField = useAuthAwareMutation({
    mutationFn: async (fieldId: number) => {
      const res = await fetchApi(
        `/api/campaigns/${campaignId}/data-fields/${fieldId}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Delete failed");
    },
    onSuccess: () => {
      toast.success("Field deleted");
      queryClient.invalidateQueries({ queryKey: ["campaign-data-fields", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-facts", campaignId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Data fields</CardTitle>
          <CardDescription>
            Claim rankings, compliance witnesses, and other survey facts. These do
            not colour the wall chart — assessments stay the organising 1–5 / yes-no
            scale.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canWrite && (
            <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>New field</Label>
                <Input
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  placeholder="e.g. Fatigue importance, Witnessed underpayment"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={draft.category}
                  onValueChange={(v) =>
                    setDraft({ ...draft, category: v as FactCategory })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FACT_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {FACT_CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={draft.value_type}
                  onValueChange={(v) =>
                    setDraft({ ...draft, value_type: v as FactValueType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FACT_VALUE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {FACT_VALUE_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Group (optional)</Label>
                <Select
                  value={draft.fieldset_id}
                  onValueChange={(v) => setDraft({ ...draft, fieldset_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ungrouped</SelectItem>
                    {fieldsets.map((s) => (
                      <SelectItem key={s.fieldset_id} value={String(s.fieldset_id)}>
                        {s.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(draft.value_type === "enum" || draft.value_type === "multi_enum") && (
                <div className="space-y-2 md:col-span-2">
                  <Label>Options (one per line)</Label>
                  <textarea
                    className="min-h-[80px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={draft.optionsText}
                    onChange={(e) =>
                      setDraft({ ...draft, optionsText: e.target.value })
                    }
                    placeholder={"fatigue\nunderpayment\nrostering"}
                  />
                </div>
              )}
              {(draft.value_type === "scale" || draft.value_type === "integer") && (
                <div className="flex gap-2">
                  <div className="space-y-2">
                    <Label>Min</Label>
                    <Input
                      value={draft.scale_min}
                      onChange={(e) =>
                        setDraft({ ...draft, scale_min: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max</Label>
                    <Input
                      value={draft.scale_max}
                      onChange={(e) =>
                        setDraft({ ...draft, scale_max: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}
              <div className="flex items-center gap-4 md:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.filterable}
                    onCheckedChange={(v) =>
                      setDraft({ ...draft, filterable: v === true })
                    }
                  />
                  Filterable
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.sortable}
                    onCheckedChange={(v) =>
                      setDraft({ ...draft, sortable: v === true })
                    }
                  />
                  Sortable
                </label>
                <Button
                  size="sm"
                  onClick={() => createField.mutate()}
                  disabled={!draft.label.trim() || createField.isPending}
                >
                  Add field
                </Button>
              </div>
              <div className="flex items-end gap-2 md:col-span-2">
                <div className="flex-1 space-y-2">
                  <Label>New group</Label>
                  <Input
                    value={newSetTitle}
                    onChange={(e) => setNewSetTitle(e.target.value)}
                    placeholder="e.g. August 2026 claims log"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => createSet.mutate()}
                  disabled={!newSetTitle.trim() || createSet.isPending}
                >
                  Add group
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading fields…</p>
          ) : fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No data fields yet. Add claim ranks or compliance witnesses above,
              then map SMS / Action Network answers onto them.
            </p>
          ) : (
            <div className="space-y-4">
              {fieldsets.map((s) => (
                <FieldGroup
                  key={s.fieldset_id}
                  title={s.title}
                  fields={grouped.get(s.fieldset_id) ?? []}
                  canWrite={canWrite}
                  onDelete={(id) => deleteField.mutate(id)}
                />
              ))}
              <FieldGroup
                title="Ungrouped"
                fields={grouped.get("none") ?? []}
                canWrite={canWrite}
                onDelete={(id) => deleteField.mutate(id)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Label className="text-sm">Report</Label>
        <Select
          value={reportCategory}
          onValueChange={(v) => setReportCategory(v as FactCategory | "all")}
        >
          <SelectTrigger className="h-8 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {FACT_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {FACT_CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <CampaignFactsReport
        campaignId={campaignId}
        category={reportCategory === "all" ? null : reportCategory}
        canWrite={canWrite}
      />
    </div>
  );
}

function FieldGroup({
  title,
  fields,
  canWrite,
  onDelete,
}: {
  title: string;
  fields: CampaignDataField[];
  canWrite: boolean;
  onDelete: (id: number) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">{title}</h4>
      <ul className="divide-y rounded-md border">
        {fields.map((f) => (
          <li
            key={f.field_id}
            className="flex items-start justify-between gap-3 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-sm">{f.label}</span>
                <Badge variant="secondary">{FACT_CATEGORY_LABELS[f.category]}</Badge>
                <Badge variant="outline">{FACT_VALUE_TYPE_LABELS[f.value_type]}</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{f.key}</p>
              {(f.value_type === "enum" || f.value_type === "multi_enum") &&
                f.enum_options && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {f.enum_options.map(enumOptionLabel).join(" · ")}
                  </p>
                )}
            </div>
            {canWrite && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => onDelete(f.field_id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
