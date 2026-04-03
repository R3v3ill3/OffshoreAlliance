"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WorkerImportWizard } from "@/components/import/worker-import-wizard";
import { ArrowLeft, Upload, Users } from "lucide-react";
import Link from "next/link";

interface StepAllocateWorkersProps {
  campaignId: number;
  selectedEmployers: number[];
  selectedWorksites: number[];
  worksiteSectorWide: boolean;
  selectedWorkers: number[];
  setSelectedWorkers: (v: number[]) => void;
  isPending: boolean;
  onBack: () => void;
  onContinue: () => void;
}

export function StepAllocateWorkers({
  campaignId,
  selectedEmployers,
  selectedWorksites,
  worksiteSectorWide,
  selectedWorkers,
  setSelectedWorkers,
  isPending,
  onBack,
  onContinue,
}: StepAllocateWorkersProps) {
  const supabase = createClient();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: candidateWorkers = [], isFetching } = useQuery({
    queryKey: ["wizard-workers", selectedEmployers, selectedWorksites, worksiteSectorWide],
    queryFn: async () => {
      let q = supabase
        .from("workers")
        .select("worker_id, first_name, last_name, employer_id, worksite_id")
        .eq("is_active", true);

      if (selectedEmployers.length > 0) {
        q = q.in("employer_id", selectedEmployers);
      }
      if (selectedWorksites.length > 0 && !worksiteSectorWide) {
        q = q.in("worksite_id", selectedWorksites);
      }

      const { data, error } = await q.order("last_name").limit(5000);
      if (error) throw error;
      return data ?? [];
    },
    enabled:
      !!user &&
      (selectedEmployers.length > 0 || selectedWorksites.length > 0 || worksiteSectorWide),
  });

  const toggle = (id: number) => {
    if (selectedWorkers.includes(id)) {
      setSelectedWorkers(selectedWorkers.filter((x) => x !== id));
    } else {
      setSelectedWorkers([...selectedWorkers, id]);
    }
  };

  const filtered = candidateWorkers.filter((w) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      w.first_name.toLowerCase().includes(term) ||
      w.last_name.toLowerCase().includes(term)
    );
  });

  const noWorkers =
    !isFetching &&
    candidateWorkers.length === 0 &&
    (selectedEmployers.length > 0 || selectedWorksites.length > 0 || worksiteSectorWide);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allocate workers</CardTitle>
        <CardDescription>
          Workers are filtered by your employer and worksite selections.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isFetching && (
          <p className="text-sm text-muted-foreground">Loading workers…</p>
        )}

        {noWorkers && (
          <div className="rounded-lg border border-dashed p-6 space-y-4 text-center">
            <div className="flex justify-center">
              <div className="rounded-full bg-muted p-3">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-sm">No workers found</p>
              <p className="text-sm text-muted-foreground">
                There are no workers currently linked to the selected employers or worksites.
                Import workers to add them, or adjust your selections in the previous step.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button
                type="button"
                onClick={() => setImportOpen(true)}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Import workers
              </Button>
              <Button variant="outline" type="button" asChild>
                <Link href="/workers" target="_blank">
                  Go to Workers page
                </Link>
              </Button>
            </div>
          </div>
        )}

        {candidateWorkers.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-2">
              <Input
                placeholder="Search workers…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <div className="flex gap-2 text-sm text-muted-foreground shrink-0">
                <button
                  type="button"
                  className="underline-offset-2 hover:underline"
                  onClick={() => setSelectedWorkers(filtered.map((w) => w.worker_id))}
                >
                  Select all
                </button>
                <span>·</span>
                <button
                  type="button"
                  className="underline-offset-2 hover:underline"
                  onClick={() => setSelectedWorkers([])}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border p-2 space-y-1">
              {filtered.map((w) => (
                <label key={w.worker_id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedWorkers.includes(w.worker_id)}
                    onChange={() => toggle(w.worker_id)}
                  />
                  {w.first_name} {w.last_name}
                </label>
              ))}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground px-1 py-2">
                  No workers match your search.
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedWorkers.length} of {candidateWorkers.length} selected
              {candidateWorkers.length > 0 && (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="underline-offset-2 hover:underline"
                    onClick={() => setImportOpen(true)}
                  >
                    Import more workers
                  </button>
                </>
              )}
            </p>
          </>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Button onClick={onContinue} disabled={isPending}>
            {isPending ? "Saving…" : "Finish"}
          </Button>
        </div>
      </CardContent>

      <WorkerImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        onComplete={() => {
          queryClient.invalidateQueries({
            queryKey: ["wizard-workers", selectedEmployers, selectedWorksites, worksiteSectorWide],
          });
        }}
      />
    </Card>
  );
}
