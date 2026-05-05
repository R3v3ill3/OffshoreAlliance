"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";

// ── Types ──────────────────────────────────────────────────────────────────────

interface CampaignBasics {
  campaign_id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  plan_timeframe_weeks?: number | null;
  total_worker_estimate: number | null;
}

interface FormState {
  name: string;
  start_date: string;
  end_date: string;
  plan_timeframe_mode: "weeks" | "months" | "custom";
  plan_timeframe_weeks: string;
  total_worker_estimate: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDateForInput(d: string | null | undefined): string {
  if (!d) return "";
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function computeEndDate(form: FormState): { weeks: number | null; endDate: string | null } {
  if (form.plan_timeframe_mode === "custom") {
    return { weeks: null, endDate: form.end_date || null };
  }
  const raw = Number(form.plan_timeframe_weeks);
  if (!form.plan_timeframe_weeks || Number.isNaN(raw) || raw <= 0) {
    return { weeks: null, endDate: null };
  }
  const weeks = form.plan_timeframe_mode === "months" ? raw * 4 : raw;
  if (!form.start_date) return { weeks, endDate: null };
  const start = new Date(`${form.start_date}T12:00:00`);
  const end = new Date(start.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
  const yyyy = end.getFullYear();
  const mm = String(end.getMonth() + 1).padStart(2, "0");
  const dd = String(end.getDate()).padStart(2, "0");
  return { weeks, endDate: `${yyyy}-${mm}-${dd}` };
}

function hydrateForm(campaign: CampaignBasics): FormState {
  const planWeeks = campaign.plan_timeframe_weeks ?? null;
  const hasEndDate = !!campaign.end_date;
  const inferredMode: "weeks" | "months" | "custom" =
    planWeeks != null
      ? planWeeks % 4 === 0
        ? "months"
        : "weeks"
      : hasEndDate
      ? "custom"
      : "weeks";

  return {
    name: campaign.name ?? "",
    start_date: formatDateForInput(campaign.start_date),
    end_date: formatDateForInput(campaign.end_date),
    plan_timeframe_mode: inferredMode,
    plan_timeframe_weeks:
      planWeeks != null
        ? inferredMode === "months"
          ? String(planWeeks / 4)
          : String(planWeeks)
        : "",
    total_worker_estimate:
      campaign.total_worker_estimate != null ? String(campaign.total_worker_estimate) : "",
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export interface CampaignBasicsEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: CampaignBasics;
  campaignId: number;
  onSaved: () => void;
}

export function CampaignBasicsEditSheet({
  open,
  onOpenChange,
  campaign,
  campaignId,
  onSaved,
}: CampaignBasicsEditSheetProps) {
  const supabase = createClient();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>(() => hydrateForm(campaign));

  // Re-hydrate whenever the sheet opens or source campaign data changes.
  useEffect(() => {
    if (open) {
      setForm(hydrateForm(campaign));
    }
  }, [open, campaign]);

  // ── Compatibility data ─────────────────────────────────────────────────────

  const { data: namedCount } = useQuery({
    queryKey: ["campaign-named-count", campaignId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("campaign_worker_membership")
        .select("worker_id", { count: "exact", head: true })
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user && open,
  });

  const { data: coverage } = useQuery({
    queryKey: ["campaign-ou-coverage", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_ou_coverage_summary")
        .select("total_assigned_workers")
        .eq("campaign_id", campaignId)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data as { total_assigned_workers: number } | null;
    },
    enabled: !!user && open,
  });

  const assignedCount = coverage?.total_assigned_workers ?? 0;

  // ── Computed warnings ──────────────────────────────────────────────────────

  const warnings = useMemo(() => {
    const msgs: string[] = [];
    const entered = form.total_worker_estimate ? Number(form.total_worker_estimate) : null;
    if (entered == null || entered <= 0) return msgs;

    if (namedCount != null && entered < namedCount) {
      msgs.push(
        `This estimate (${entered}) is lower than the ${namedCount} workers currently named in the campaign. ` +
          `The wall chart will show no placeholder slots and progress metrics may exceed 100%.`
      );
    }

    if (assignedCount > 0 && entered < assignedCount) {
      msgs.push(
        `This estimate is lower than the ${assignedCount} workers assigned to organising units. ` +
          `Unit coverage summaries will appear over-capacity.`
      );
    }

    return msgs;
  }, [form.total_worker_estimate, namedCount, assignedCount]);

  const computedTimeframe = useMemo(() => computeEndDate(form), [form]);

  // ── Save mutation ──────────────────────────────────────────────────────────

  const saveMutation = useAuthAwareMutation({
    mutationFn: async () => {
      const { weeks, endDate } = computeEndDate(form);

      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        start_date: form.start_date || null,
        end_date: endDate,
        plan_timeframe_weeks: weeks,
        total_worker_estimate: form.total_worker_estimate
          ? Number(form.total_worker_estimate)
          : null,
      };

      const { error } = await supabase
        .from("campaigns")
        .update(payload)
        .eq("campaign_id", campaignId);
      if (error) throw error;
    },
    onSuccess: () => {
      // Invalidate all queries that derive from campaign fundamentals.
      queryClient.invalidateQueries({ queryKey: ["campaign", String(campaignId)] });
      queryClient.invalidateQueries({ queryKey: ["campaign-settings", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaign-wall-chart", campaignId] });
      onSaved();
      onOpenChange(false);
    },
  });

  const canSave = form.name.trim().length > 0 && !saveMutation.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit campaign basics</SheetTitle>
          <SheetDescription>
            Update the campaign name, timeline and worker estimate. Changes take effect
            immediately.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="basics-name">Campaign name *</Label>
            <Input
              id="basics-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Campaign name"
            />
          </div>

          {/* Start date */}
          <div className="space-y-2">
            <Label htmlFor="basics-start">Start date</Label>
            <Input
              id="basics-start"
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </div>

          {/* Plan timeframe / end date */}
          <div className="space-y-2">
            <Label>Plan timeframe</Label>
            <div className="grid grid-cols-3 gap-2">
              <Select
                value={form.plan_timeframe_mode}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    plan_timeframe_mode: v as "weeks" | "months" | "custom",
                    plan_timeframe_weeks:
                      v === "custom" ? "" : form.plan_timeframe_weeks,
                    end_date: v === "custom" ? form.end_date : "",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weeks">Weeks</SelectItem>
                  <SelectItem value="months">Months</SelectItem>
                  <SelectItem value="custom">Custom date</SelectItem>
                </SelectContent>
              </Select>

              {form.plan_timeframe_mode === "custom" ? (
                <Input
                  className="col-span-2"
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              ) : (
                <Input
                  className="col-span-2"
                  type="number"
                  min={1}
                  value={form.plan_timeframe_weeks}
                  onChange={(e) =>
                    setForm({ ...form, plan_timeframe_weeks: e.target.value })
                  }
                  placeholder={
                    form.plan_timeframe_mode === "months" ? "e.g. 6" : "e.g. 12"
                  }
                />
              )}
            </div>

            {form.plan_timeframe_mode !== "custom" && computedTimeframe.endDate && (
              <p className="text-xs text-muted-foreground">
                Computed end date:{" "}
                {new Date(`${computedTimeframe.endDate}T12:00:00`).toLocaleDateString(
                  undefined,
                  { day: "numeric", month: "short", year: "numeric" }
                )}
              </p>
            )}
          </div>

          {/* Worker estimate */}
          <div className="space-y-2">
            <Label htmlFor="basics-estimate">Total worker estimate</Label>
            <Input
              id="basics-estimate"
              type="number"
              min={0}
              value={form.total_worker_estimate}
              onChange={(e) =>
                setForm({ ...form, total_worker_estimate: e.target.value })
              }
              placeholder="Headcount estimate"
            />
            {namedCount != null && (
              <p className="text-xs text-muted-foreground">
                {namedCount} workers currently named in campaign
                {assignedCount > 0 && `, ${assignedCount} assigned to units`}.
              </p>
            )}
          </div>

          {/* Compatibility warnings */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              {warnings.map((msg, i) => (
                <div
                  key={i}
                  className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{msg}</span>
                </div>
              ))}
            </div>
          )}

          {/* Save error */}
          {saveMutation.isError && (
            <p className="text-xs text-destructive">
              Failed to save:{" "}
              {saveMutation.error instanceof Error
                ? saveMutation.error.message
                : "Unknown error"}
            </p>
          )}
        </div>

        <SheetFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saveMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!canSave}>
            {saveMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
