"use client";

import { useMemo, useState } from "react";
import { fetchApi } from "@/lib/api/fetch-api";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import {
  useCampaignDataFields,
  useCampaignFacts,
} from "@/lib/hooks/useCampaignDataFields";
import type { CampaignDataField, WorkerCampaignFact } from "@/lib/campaign-facts/types";
import {
  FACT_CATEGORY_LABELS,
  FACT_SOURCE_LABELS,
} from "@/lib/campaign-facts/types";
import {
  displayFactValue,
  enumOptionLabel,
  enumOptionValue,
} from "@/lib/campaign-facts/values";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";

export function WorkerFactsTab({
  campaignId,
  workerId,
  canWrite,
}: {
  campaignId: string;
  workerId: number;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: cat } = useCampaignDataFields(campaignId);
  const { data: facts = [] } = useCampaignFacts(campaignId, { workerId });
  const fields = cat?.fields ?? [];
  const byField = useMemo(() => {
    const m = new Map<number, WorkerCampaignFact>();
    for (const f of facts) m.set(f.field_id, f);
    return m;
  }, [facts]);

  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No data fields on this campaign yet. Add them under Workforce → Data fields.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {fields.map((field) => (
        <FactEditor
          key={field.field_id}
          campaignId={campaignId}
          workerId={workerId}
          field={field}
          fact={byField.get(field.field_id) ?? null}
          canWrite={canWrite}
          onSaved={() => {
            queryClient.invalidateQueries({
              queryKey: ["campaign-facts", campaignId],
            });
          }}
        />
      ))}
    </div>
  );
}

function FactEditor({
  campaignId,
  workerId,
  field,
  fact,
  canWrite,
  onSaved,
}: {
  campaignId: string;
  workerId: number;
  field: CampaignDataField;
  fact: WorkerCampaignFact | null;
  canWrite: boolean;
  onSaved: () => void;
}) {
  const [text, setText] = useState(() => {
    if (!fact) return "";
    if (field.value_type === "text") return fact.value_text ?? "";
    if (field.value_type === "integer" || field.value_type === "scale") {
      return fact.value_int == null ? "" : String(fact.value_int);
    }
    return "";
  });

  const save = useAuthAwareMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetchApi(`/api/campaigns/${campaignId}/facts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: workerId, field_id: field.field_id, ...body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
    },
    onSuccess: () => {
      toast.success("Saved");
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const provenance = fact
    ? `${FACT_SOURCE_LABELS[fact.source]} · ${new Date(fact.collected_at).toLocaleDateString()}`
    : "Not recorded";

  return (
    <div className="rounded-md border px-3 py-2 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{field.label}</p>
          <p className="text-xs text-muted-foreground">
            {FACT_CATEGORY_LABELS[field.category]} · {provenance}
          </p>
        </div>
        {canWrite && fact && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => save.mutate({ clear: true })}
          >
            Clear
          </Button>
        )}
      </div>

      {!canWrite ? (
        <p className="text-sm">{displayFactValue(field, fact)}</p>
      ) : field.value_type === "boolean" ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={fact?.value_bool === true ? "default" : "outline"}
            onClick={() => save.mutate({ value_bool: true })}
          >
            Yes
          </Button>
          <Button
            size="sm"
            variant={fact?.value_bool === false ? "default" : "outline"}
            onClick={() => save.mutate({ value_bool: false })}
          >
            No
          </Button>
        </div>
      ) : field.value_type === "enum" ? (
        <Select
          value={fact?.value_enum ?? ""}
          onValueChange={(v) => save.mutate({ value_enum: v })}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {(field.enum_options ?? []).map((o) => (
              <SelectItem key={enumOptionValue(o)} value={enumOptionValue(o)}>
                {enumOptionLabel(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.value_type === "multi_enum" ? (
        <MultiEnumEditor
          field={field}
          fact={fact}
          onSave={(vals) => save.mutate({ value_json: vals })}
        />
      ) : (
        <div className="flex gap-2">
          <Input
            className="h-8"
            value={text}
            onChange={(e) => setText(e.target.value)}
            type={
              field.value_type === "integer" || field.value_type === "scale"
                ? "number"
                : "text"
            }
            min={field.scale_min ?? undefined}
            max={field.scale_max ?? undefined}
          />
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                field.value_type === "text"
                  ? { value_text: text }
                  : { value_int: Number(text) }
              )
            }
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

function MultiEnumEditor({
  field,
  fact,
  onSave,
}: {
  field: CampaignDataField;
  fact: WorkerCampaignFact | null;
  onSave: (vals: string[]) => void;
}) {
  const selected = new Set(
    Array.isArray(fact?.value_json) ? (fact!.value_json as unknown[]).map(String) : []
  );
  return (
    <div className="flex flex-wrap gap-2">
      {(field.enum_options ?? []).map((o) => {
        const v = enumOptionValue(o);
        const on = selected.has(v);
        return (
          <label key={v} className="flex items-center gap-1.5 text-sm">
            <Checkbox
              checked={on}
              onCheckedChange={() => {
                const next = new Set(selected);
                if (on) next.delete(v);
                else next.add(v);
                onSave([...next]);
              }}
            />
            {enumOptionLabel(o)}
          </label>
        );
      })}
    </div>
  );
}
