"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils/cn";
import { scheduleColumnMissing } from "@/lib/mobilisation/schedule";
import { MobilisationTabs, confidenceLabel, layerLabel } from "./_components/tabs";

interface SignalRow {
  signal_id: number;
  source_layer: string;
  source: string;
  signal_type: string;
  occurred_at: string;
  title: string;
  extract: string | null;
  url: string | null;
  confidence: number;
  in_region: boolean;
  region_label: string | null;
  matched_terms: string[] | null;
  vessel_id: number | null;
  contractor_id: number | null;
  watch_contractor_id: number | null;
  operator_id: number | null;
  worksite_id: number | null;
  arrival_at?: string | null;
  ends_at?: string | null;
  vessels: { name: string; imo: string | null } | null;
  watch: { canonical_name: string; employer_id: number | null } | null;
  operator: { employer_name: string } | null;
  sector: { sector_name: string } | null;
}

interface AlertRow {
  alert_id: number;
  status: string;
  priority: string;
  title: string;
  summary: string;
  confidence: number;
  created_at: string;
  snoozed_until: string | null;
  watch_contractor_id: number | null;
  vessel_id: number | null;
  signal_ids: number[];
}

const SIGNAL_COLUMNS =
  "signal_id, source_layer, source, signal_type, occurred_at, title, extract, url, confidence, in_region, region_label, matched_terms, vessel_id, contractor_id, watch_contractor_id, operator_id, worksite_id, vessels(name, imo), watch:mobilisation_watch_contractors(canonical_name, employer_id), operator:employers!mobilisation_signals_operator_id_fkey(employer_name), sector:sectors(sector_name)";

async function loadSignals(): Promise<SignalRow[]> {
  const sb = createClient();
  const withSchedule = await sb
    .from("mobilisation_signals")
    .select(`${SIGNAL_COLUMNS}, arrival_at, ends_at`)
    .order("occurred_at", { ascending: false })
    .limit(1000);
  const result =
    withSchedule.error && scheduleColumnMissing(withSchedule.error.message)
      ? await sb.from("mobilisation_signals").select(SIGNAL_COLUMNS).order("occurred_at", { ascending: false }).limit(1000)
      : withSchedule;
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as unknown as SignalRow[];
}

async function loadAlerts(): Promise<AlertRow[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("mobilisation_alerts")
    .select(
      "alert_id, status, priority, title, summary, confidence, created_at, snoozed_until, watch_contractor_id, vessel_id, mobilisation_alert_signals(signal_id)"
    )
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const links = (row.mobilisation_alert_signals ?? []) as { signal_id: number }[];
    const { mobilisation_alert_signals: _links, ...rest } = row as typeof row & {
      mobilisation_alert_signals?: { signal_id: number }[];
    };
    void _links;
    return {
      ...rest,
      signal_ids: links.map((link) => Number(link.signal_id)).filter((id) => Number.isFinite(id)),
    } as AlertRow;
  });
}

const SNOOZE_HINT =
  "Hides this alert from the open list for 3 days. After that it comes back so you can act on it or dismiss it.";

function hashSignalId(): number | null {
  const match = window.location.hash.match(/^#signal-(\d+)$/);
  return match ? Number(match[1]) : null;
}

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function noLinkedSignal(): null {
  return null;
}

export default function MobilisationFeedPage() {
  const { canWrite, user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const signals = useQuery({ queryKey: ["mobilisation-signals"], queryFn: loadSignals });
  const alerts = useQuery({ queryKey: ["mobilisation-alerts"], queryFn: loadAlerts });
  const [layer, setLayer] = useState("all");
  const [contractor, setContractor] = useState("all");
  const [minConfidence, setMinConfidence] = useState("0");
  const [includeOutOfRegion, setIncludeOutOfRegion] = useState(false);
  const [region, setRegion] = useState("all");
  const [operator, setOperator] = useState("all");
  const [sector, setSector] = useState("all");
  const linkedSignalId = useSyncExternalStore(subscribeToHash, hashSignalId, noLinkedSignal);
  const [clickedSignalId, setClickedSignalId] = useState<number | null>(null);
  const focusSignalId = clickedSignalId ?? linkedSignalId;
  const warnedMissingSignal = useRef(false);

  const names = useMemo(() => {
    const set = new Set<string>();
    for (const row of signals.data ?? []) {
      if (row.watch?.canonical_name) set.add(row.watch.canonical_name);
    }
    return [...set].sort();
  }, [signals.data]);

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const row of signals.data ?? []) {
      if (row.region_label) set.add(row.region_label);
    }
    return [...set].sort();
  }, [signals.data]);

  const operators = useMemo(() => {
    const set = new Set<string>();
    for (const row of signals.data ?? []) {
      if (row.operator?.employer_name) set.add(row.operator.employer_name);
    }
    return [...set].sort();
  }, [signals.data]);

  const sectors = useMemo(() => {
    const set = new Set<string>();
    for (const row of signals.data ?? []) {
      if (row.sector?.sector_name) set.add(row.sector.sector_name);
    }
    return [...set].sort();
  }, [signals.data]);

  const filtered = (signals.data ?? []).filter((row) => {
    if (focusSignalId != null && row.signal_id === focusSignalId) return true;
    if (!includeOutOfRegion && !row.in_region) return false;
    if (layer !== "all" && row.source_layer !== layer) return false;
    if (contractor !== "all" && row.watch?.canonical_name !== contractor) return false;
    if (region !== "all" && row.region_label !== region) return false;
    if (operator !== "all" && row.operator?.employer_name !== operator) return false;
    if (sector !== "all" && row.sector?.sector_name !== sector) return false;
    if (Number(row.confidence) < Number(minConfidence)) return false;
    return true;
  });

  useEffect(() => {
    if (linkedSignalId == null || !signals.data || warnedMissingSignal.current) return;
    if (signals.data.some((row) => row.signal_id === linkedSignalId)) return;
    warnedMissingSignal.current = true;
    toast.message("That feed item is older than the list on this page.");
  }, [linkedSignalId, signals.data]);

  useEffect(() => {
    if (focusSignalId == null) return;
    const el = document.getElementById(`signal-${focusSignalId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusSignalId, filtered]);

  const updateAlert = useMutation({
    mutationFn: async (patch: { alert_id: number; status: string; snoozed_until?: string | null; status_note?: string }) => {
      const sb = createClient();
      const extra: Record<string, string | null> = {};
      if (patch.status === "acknowledged") {
        extra.acknowledged_by = user?.id ?? null;
        extra.acknowledged_at = new Date().toISOString();
      }
      if (patch.status === "dismissed") {
        extra.dismissed_by = user?.id ?? null;
        extra.dismissed_at = new Date().toISOString();
      }
      const { error } = await sb
        .from("mobilisation_alerts")
        .update({
          status: patch.status,
          snoozed_until: patch.snoozed_until ?? null,
          status_note: patch.status_note ?? null,
          ...extra,
        })
        .eq("alert_id", patch.alert_id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mobilisation-alerts"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const poll = useMutation({
    mutationFn: async (target: string) => {
      const response = await fetch("/api/mobilisation/poll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ layer: target }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Poll failed");
      return body.notes as string[];
    },
    onSuccess: (notes) => {
      toast.success(notes.join(" · ") || "Poll finished");
      queryClient.invalidateQueries({ queryKey: ["mobilisation-signals"] });
      queryClient.invalidateQueries({ queryKey: ["mobilisation-alerts"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openAlertInFeed(alert: AlertRow) {
    const known = new Set((signals.data ?? []).map((row) => row.signal_id));
    const signalId =
      alert.signal_ids.find((id) => known.has(id)) ??
      (alert.signal_ids.length > 0 ? Math.max(...alert.signal_ids) : null);
    if (signalId == null) {
      toast.message("No linked feed item for this alert yet.");
      return;
    }
    if (!known.has(signalId)) {
      toast.message("That feed item is older than the list on this page.");
      return;
    }
    setClickedSignalId(signalId);
  }

  const openAlerts = (alerts.data ?? []).filter((a) => a.status === "new" || a.status === "snoozed");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mobilisation</h1>
          <p className="text-sm text-muted-foreground">
            Regulatory filings, contract news, and AIS movement for the North-West Australia watchlist, in one feed.
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={poll.isPending} onClick={() => poll.mutate("regulatory")}>
              Poll NOPSEMA
            </Button>
            <Button size="sm" variant="outline" disabled={poll.isPending} onClick={() => poll.mutate("commercial")}>
              Poll news
            </Button>
            <Button size="sm" variant="outline" disabled={poll.isPending} onClick={() => poll.mutate("ais")}>
              Poll AIS
            </Button>
          </div>
        )}
      </div>
      <MobilisationTabs current="/mobilisation" />

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Open alerts</h2>
        {openAlerts.length === 0 && <p className="text-sm text-muted-foreground">No open alerts.</p>}
        {openAlerts.map((alert) => (
          <div
            key={alert.alert_id}
            role="button"
            tabIndex={0}
            onClick={() => openAlertInFeed(alert)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openAlertInFeed(alert);
              }
            }}
            className="flex cursor-pointer flex-wrap items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div>
              <div className="flex items-center gap-2">
                <Badge variant={alert.priority === "critical" || alert.priority === "high" ? "destructive" : "secondary"}>
                  {alert.priority}
                </Badge>
                <span className="font-medium">{alert.title}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{alert.summary}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {confidenceLabel(Number(alert.confidence))} · {format(new Date(alert.created_at), "dd MMM yyyy HH:mm")}
                {alert.vessel_id && (
                  <>
                    {" "}
                    ·{" "}
                    <Link
                      className="underline"
                      href={`/mobilisation/vessels/${alert.vessel_id}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      vessel
                    </Link>
                  </>
                )}
                {alert.watch_contractor_id && (
                  <>
                    {" "}
                    ·{" "}
                    <Link
                      className="underline"
                      href={`/mobilisation/contractors/${alert.watch_contractor_id}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      contractor
                    </Link>
                  </>
                )}
                <span className="text-muted-foreground/80"> · Open in feed</span>
              </p>
            </div>
            {canWrite && alert.status !== "dismissed" && (
              <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                <Button size="sm" variant="outline" onClick={() => updateAlert.mutate({ alert_id: alert.alert_id, status: "acknowledged", status_note: "Acknowledged" })}>
                  Acknowledge
                </Button>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updateAlert.mutate({
                        alert_id: alert.alert_id,
                        status: "snoozed",
                        snoozed_until: new Date(Date.now() + 3 * 86400000).toISOString(),
                        status_note: "Snoozed 3 days",
                      })
                    }
                  >
                    Snooze
                  </Button>
                  <TooltipProvider delayDuration={200}>
                    <Popover>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label={SNOOZE_HINT}
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-64">
                          {SNOOZE_HINT}
                        </TooltipContent>
                      </Tooltip>
                      <PopoverContent side="top" align="end" className="w-64 p-3 text-sm">
                        {SNOOZE_HINT}
                      </PopoverContent>
                    </Popover>
                  </TooltipProvider>
                </div>
                <Button size="sm" variant="ghost" onClick={() => updateAlert.mutate({ alert_id: alert.alert_id, status: "dismissed", status_note: "Dismissed as false positive" })}>
                  Dismiss
                </Button>
              </div>
            )}
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        <select className="rounded-md border bg-background px-2 py-1 text-sm" value={layer} onChange={(e) => setLayer(e.target.value)}>
          <option value="all">All layers</option>
          <option value="regulatory">Regulatory</option>
          <option value="commercial">Commercial</option>
          <option value="ais">AIS</option>
        </select>
        <select className="rounded-md border bg-background px-2 py-1 text-sm" value={contractor} onChange={(e) => setContractor(e.target.value)}>
          <option value="all">All contractors</option>
          {names.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select className="rounded-md border bg-background px-2 py-1 text-sm" value={operator} onChange={(e) => setOperator(e.target.value)}>
          <option value="all">All operators</option>
          {operators.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select className="rounded-md border bg-background px-2 py-1 text-sm" value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="all">All sub-sectors</option>
          {sectors.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select className="rounded-md border bg-background px-2 py-1 text-sm" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="all">All regions</option>
          {regions.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select className="rounded-md border bg-background px-2 py-1 text-sm" value={minConfidence} onChange={(e) => setMinConfidence(e.target.value)}>
          <option value="0">Any confidence</option>
          <option value="0.5">50%+</option>
          <option value="0.7">70%+</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeOutOfRegion} onChange={(e) => setIncludeOutOfRegion(e.target.checked)} />
          Include Bass Strait / out of region
        </label>
      </div>

      {signals.isLoading && <p className="text-sm text-muted-foreground">Loading signals…</p>}
      {signals.error && <p className="text-sm text-destructive">{(signals.error as Error).message}</p>}
      <ul className="divide-y rounded-lg border">
        {filtered.map((row) => (
          <li
            key={row.signal_id}
            id={`signal-${row.signal_id}`}
            className={cn(
              "space-y-1 p-3 scroll-mt-24",
              focusSignalId === row.signal_id && "bg-muted/60 ring-2 ring-ring ring-offset-2"
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{layerLabel(row.source_layer)}</Badge>
              <Badge variant="secondary">{row.signal_type.replaceAll("_", " ")}</Badge>
              <span className="text-xs text-muted-foreground">{confidenceLabel(Number(row.confidence))}</span>
              <span className="text-xs text-muted-foreground">{format(new Date(row.occurred_at), "dd MMM yyyy")}</span>
              {row.region_label && <span className="text-xs text-muted-foreground">{row.region_label}</span>}
              {row.sector?.sector_name && <span className="text-xs text-muted-foreground">{row.sector.sector_name}</span>}
            </div>
            <div className="font-medium">{row.title}</div>
            {row.extract && <p className="text-sm text-muted-foreground line-clamp-3">{row.extract}</p>}
            {(row.arrival_at || row.ends_at) && (
              <p className="text-xs text-muted-foreground">
                {[
                  row.arrival_at ? `Estimated arrival ${format(new Date(row.arrival_at), "dd MMM yyyy")}` : null,
                  row.ends_at ? `Expected until ${format(new Date(row.ends_at), "dd MMM yyyy")}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <div className="flex flex-wrap gap-3 text-xs">
              {row.watch && (
                <Link className="underline" href={`/mobilisation/contractors/${row.watch_contractor_id}`}>
                  {row.watch.canonical_name}
                </Link>
              )}
              {row.watch?.employer_id && (
                <Link className="underline" href={`/employers/${row.watch.employer_id}`}>Employer record</Link>
              )}
              {row.vessels && (
                <Link className="underline" href={`/mobilisation/vessels/${row.vessel_id}`}>
                  {row.vessels.name}{row.vessels.imo ? ` · IMO ${row.vessels.imo}` : ""}
                </Link>
              )}
              {row.worksite_id && <Link className="underline" href={`/worksites/${row.worksite_id}`}>Worksite</Link>}
              {row.operator_id && (
                <Link className="underline" href={`/employers/${row.operator_id}`}>
                  {row.operator?.employer_name ?? "Operator"}
                </Link>
              )}
              {row.url && (
                <a className="underline" href={row.url} target="_blank" rel="noreferrer">Source</a>
              )}
            </div>
          </li>
        ))}
        {filtered.length === 0 && !signals.isLoading && (
          <li className="p-3 text-sm text-muted-foreground">No signals for this filter yet.</li>
        )}
      </ul>
    </div>
  );
}
