"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, UserSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchApi } from "@/lib/api/fetch-api";
import type { ParticipationMatchCandidate } from "@/lib/import/participation-import-shared";

interface SearchResult {
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  in_campaign: boolean;
}

/**
 * Manual worker lookup for the match step: search this campaign's
 * workforce (or the whole database) by name / email / phone and link
 * the row to the picked worker.
 */
export function WorkerSearchPopover({
  campaignId,
  initialQuery,
  onPick,
}: {
  campaignId: string;
  /** Seeded from the row's name so one click usually shows candidates. */
  initialQuery: string;
  onPick: (candidate: ParticipationMatchCandidate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [allWorkers, setAllWorkers] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const scope = allWorkers ? "all" : "campaign";
        const res = await fetchApi(
          `/api/campaigns/${campaignId}/participation-import/search-workers?q=${encodeURIComponent(q)}&scope=${scope}`
        );
        const json = await res.json();
        if (cancelled) return;
        if (!json.success) throw new Error(json.error ?? "Search failed");
        setResults(json.results);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, allWorkers, campaignId]);

  function pick(r: SearchResult) {
    onPick({
      worker_id: r.worker_id,
      first_name: r.first_name,
      last_name: r.last_name,
      preferred_name: null,
      email: r.email,
      phone: r.phone,
      in_campaign: r.in_campaign,
      method: "name",
      already_rated: false,
    });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-xs"
          title="Search workers"
        >
          <UserSearch className="h-3.5 w-3.5" aria-hidden />
          Search
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="space-y-2">
          <div className="relative">
            <Search
              className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, email or phone…"
              className="h-8 pl-7 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Checkbox
              id="ws-all"
              checked={allWorkers}
              onCheckedChange={(checked) => setAllWorkers(checked === true)}
            />
            <Label htmlFor="ws-all" className="text-[11px] font-normal">
              Search all workers (not just this campaign)
            </Label>
          </div>
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {loading ? (
              <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Searching…
              </div>
            ) : error ? (
              <p className="p-2 text-xs text-destructive">{error}</p>
            ) : results.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">
                {query.trim().length < 2
                  ? "Type at least 2 characters to search."
                  : "No workers found."}
              </p>
            ) : (
              results.map((r) => (
                <button
                  key={r.worker_id}
                  type="button"
                  onClick={() => pick(r)}
                  className="flex w-full items-center justify-between gap-2 rounded-md p-1.5 text-left text-xs hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {r.first_name} {r.last_name}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[r.email, r.phone].filter(Boolean).join(" · ") || "no contact details"}
                    </span>
                  </span>
                  {r.in_campaign ? (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      In campaign
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      All workers
                    </Badge>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
