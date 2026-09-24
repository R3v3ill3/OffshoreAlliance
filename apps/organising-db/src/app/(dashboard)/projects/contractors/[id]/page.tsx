"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { confidenceLabel, layerLabel } from "@/app/(dashboard)/mobilisation/_components/tabs";
import { projectVesselPath } from "@/lib/projects/routes";

export default function ContractorRadarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const contractor = useQuery({
    queryKey: ["mobilisation-contractor", id],
    queryFn: async () => {
      const sb = createClient();
      const { data, error } = await sb.from("mobilisation_watch_contractors").select("*").eq("watch_id", Number(id)).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const signals = useQuery({
    queryKey: ["mobilisation-contractor-signals", id],
    queryFn: async () => {
      const sb = createClient();
      const { data, error } = await sb
        .from("mobilisation_signals")
        .select("signal_id, source_layer, signal_type, occurred_at, title, url, confidence, region_label, vessel_id, vessels(name)")
        .eq("watch_contractor_id", Number(id))
        .order("occurred_at", { ascending: false })
        .limit(80);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const row = contractor.data;

  return (
    <div className="space-y-4">
      {row && (
        <div>
          <h1 className="text-2xl font-semibold">{row.canonical_name}</h1>
          <p className="text-sm text-muted-foreground">
            {row.tier} · {row.is_active ? "on the watchlist" : "paused"}
            {row.asx_ticker ? ` · ASX ${row.asx_ticker}` : ""}
          </p>
          {row.employer_id && (
            <Link className="text-sm underline" href={`/employers/${row.employer_id}`}>Open employer record</Link>
          )}
        </div>
      )}
      <ul className="divide-y rounded-lg border">
        {(signals.data ?? []).map((signal) => {
          const vessel = signal.vessels as { name?: string } | null;
          return (
            <li key={signal.signal_id} className="space-y-1 p-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{layerLabel(signal.source_layer)}</Badge>
                <span>{confidenceLabel(Number(signal.confidence))}</span>
                <span className="text-muted-foreground">{format(new Date(signal.occurred_at), "dd MMM yyyy")}</span>
                {signal.region_label && <span className="text-muted-foreground">{signal.region_label}</span>}
              </div>
              <div>{signal.title}</div>
              {vessel?.name && signal.vessel_id && (
                <Link className="underline" href={projectVesselPath(signal.vessel_id)}>{vessel.name}</Link>
              )}
              {signal.url && (
                <div><a className="underline" href={signal.url} target="_blank" rel="noreferrer">Source</a></div>
              )}
            </li>
          );
        })}
        {(signals.data ?? []).length === 0 && <li className="p-3 text-sm text-muted-foreground">No signals yet.</li>}
      </ul>
    </div>
  );
}
