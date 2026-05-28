"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Users, Info } from "lucide-react";

interface StepWorkerEstimateProps {
  selectedEmployers: number[];
  selectedWorksites: number[];
  worksiteSectorWide: boolean;
  totalWorkerEstimate: string;
  setTotalWorkerEstimate: (v: string) => void;
  isPending: boolean;
  onBack: () => void;
  onContinue: () => void;
  showBackButton?: boolean;
  continueLabel?: string;
}

interface CountBreakdown {
  total: number;
  members: number;
  by_employer: { employer_id: number; employer_name: string; count: number }[];
  by_worksite: { worksite_id: number; worksite_name: string; count: number }[];
}

export function StepWorkerEstimate({
  selectedEmployers,
  selectedWorksites,
  worksiteSectorWide,
  totalWorkerEstimate,
  setTotalWorkerEstimate,
  isPending,
  onBack,
  onContinue,
  showBackButton = true,
  continueLabel,
}: StepWorkerEstimateProps) {
  const supabase = createClient();
  const { user } = useAuth();

  const { data: counts, isPending: countsLoading } = useQuery<CountBreakdown>({
    queryKey: [
      "campaign-wizard-worker-counts",
      selectedEmployers,
      selectedWorksites,
      worksiteSectorWide,
    ],
    queryFn: async () => {
      // Pull active workers across selected employers (and worksites if not sector-wide).
      let q = supabase
        .from("workers")
        .select(
          `worker_id, employer_id, worksite_id,
           employers:employer_id(employer_name),
           worksites:worksite_id(worksite_name)`
        )
        .eq("is_active", true)
        .limit(10000);

      if (selectedEmployers.length > 0) {
        q = q.in("employer_id", selectedEmployers);
      }
      if (selectedWorksites.length > 0 && !worksiteSectorWide) {
        q = q.in("worksite_id", selectedWorksites);
      }

      const { data, error } = await q;
      if (error) throw error;

      const rows = ((data ?? []) as unknown) as Array<{
        worker_id: number;
        employer_id: number | null;
        worksite_id: number | null;
        employers: { employer_name: string } | null;
        worksites: { worksite_name: string } | null;
      }>;

      const byEmp = new Map<number, { name: string; count: number }>();
      const byWs = new Map<number, { name: string; count: number }>();

      for (const r of rows) {
        if (r.employer_id != null) {
          const existing = byEmp.get(r.employer_id);
          byEmp.set(r.employer_id, {
            name: r.employers?.employer_name ?? `Employer #${r.employer_id}`,
            count: (existing?.count ?? 0) + 1,
          });
        }
        if (r.worksite_id != null) {
          const existing = byWs.get(r.worksite_id);
          byWs.set(r.worksite_id, {
            name: r.worksites?.worksite_name ?? `Worksite #${r.worksite_id}`,
            count: (existing?.count ?? 0) + 1,
          });
        }
      }

      return {
        total: rows.length,
        members: 0, // Member count is intentionally omitted at this step; available later in allocate step.
        by_employer: Array.from(byEmp.entries()).map(([employer_id, v]) => ({
          employer_id,
          employer_name: v.name,
          count: v.count,
        })),
        by_worksite: Array.from(byWs.entries()).map(([worksite_id, v]) => ({
          worksite_id,
          worksite_name: v.name,
          count: v.count,
        })),
      };
    },
    enabled: !!user,
  });

  // Suggested estimate: live count + 10% buffer for unknown/incoming workers, rounded up to nearest 10.
  const suggested = useMemo(() => {
    if (!counts || counts.total === 0) return null;
    const padded = Math.ceil((counts.total * 1.1) / 10) * 10;
    return padded;
  }, [counts]);

  // Auto-populate the estimate the first time we have a live count and the field is empty.
  useEffect(() => {
    if (!suggested || totalWorkerEstimate) return;
    setTotalWorkerEstimate(String(suggested));
  }, [suggested, totalWorkerEstimate, setTotalWorkerEstimate]);

  const liveCount = counts?.total ?? 0;
  const enteredEstimate = totalWorkerEstimate ? Number(totalWorkerEstimate) : null;
  const variance =
    enteredEstimate != null && liveCount > 0
      ? ((enteredEstimate - liveCount) / liveCount) * 100
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Total worker estimate</CardTitle>
        <CardDescription>
          How many workers do you expect this campaign to cover? We&apos;ve counted the active
          workers currently linked to your selected employers and worksites — use that as a
          starting point and adjust upwards for workers you expect to add during the campaign.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live count summary */}
        <div className="rounded-md border bg-muted/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Workers currently in scope</span>
            {countsLoading && (
              <Badge variant="outline" className="text-xs">
                Counting…
              </Badge>
            )}
          </div>
          <div className="text-3xl font-semibold">{liveCount.toLocaleString()}</div>

          {counts && counts.by_employer.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">By employer</p>
              <div className="flex flex-wrap gap-1.5">
                {counts.by_employer
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 12)
                  .map((e) => (
                    <Badge
                      key={e.employer_id}
                      variant="secondary"
                      className="text-xs font-normal"
                    >
                      {e.employer_name}: {e.count}
                    </Badge>
                  ))}
              </div>
            </div>
          )}

          {!worksiteSectorWide && counts && counts.by_worksite.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">By worksite</p>
              <div className="flex flex-wrap gap-1.5">
                {counts.by_worksite
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 12)
                  .map((w) => (
                    <Badge
                      key={w.worksite_id}
                      variant="secondary"
                      className="text-xs font-normal"
                    >
                      {w.worksite_name}: {w.count}
                    </Badge>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Estimate input */}
        <div className="space-y-2">
          <Label>Total worker estimate</Label>
          <Input
            type="number"
            min={0}
            value={totalWorkerEstimate}
            onChange={(e) => setTotalWorkerEstimate(e.target.value)}
            placeholder="Headcount estimate"
          />
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Suggested:{" "}
              {suggested != null ? (
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setTotalWorkerEstimate(String(suggested))}
                >
                  {suggested}
                </button>
              ) : (
                "—"
              )}{" "}
              ({liveCount} in scope today, plus a 10% buffer rounded up). Override if you have
              better intel — for example, expected new hires, casuals to be onboarded, or
              workforce shifts during bargaining.
            </span>
          </div>
        </div>

        {variance != null && enteredEstimate != null && (
          <div
            className={`rounded-md border p-3 text-xs ${
              variance < -20
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : variance > 50
                ? "border-blue-200 bg-blue-50 text-blue-900"
                : "border-muted bg-muted/30 text-muted-foreground"
            }`}
          >
            {variance < -20 ? (
              <span>
                Your estimate is {Math.abs(variance).toFixed(0)}% below the live count — double
                check that the right employers/worksites are selected.
              </span>
            ) : variance > 50 ? (
              <span>
                You&apos;re estimating {variance.toFixed(0)}% above today&apos;s count. That&apos;s a big jump
                — make sure the campaign units in the next step plan for that growth.
              </span>
            ) : (
              <span>
                {enteredEstimate.toLocaleString()} estimated against {liveCount.toLocaleString()}{" "}
                in scope ({variance >= 0 ? "+" : ""}
                {variance.toFixed(0)}%).
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          {showBackButton && (
            <Button variant="ghost" onClick={onBack} disabled={isPending}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
          <Button
            onClick={onContinue}
            disabled={isPending}
            className={showBackButton ? undefined : "ml-auto"}
          >
            {isPending ? "Saving…" : (continueLabel ?? "Continue")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
