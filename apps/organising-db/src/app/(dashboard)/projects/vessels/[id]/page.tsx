"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { confidenceLabel, layerLabel } from "@/app/(dashboard)/mobilisation/_components/tabs";
import { Badge } from "@/components/ui/badge";

export default function VesselDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const vessel = useQuery({
    queryKey: ["mobilisation-vessel", id],
    queryFn: async () => {
      const sb = createClient();
      const { data, error } = await sb.from("vessels").select("*").eq("vessel_id", Number(id)).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const signals = useQuery({
    queryKey: ["mobilisation-vessel-signals", id],
    queryFn: async () => {
      const sb = createClient();
      const { data, error } = await sb
        .from("mobilisation_signals")
        .select("signal_id, source_layer, signal_type, occurred_at, title, url, confidence, extract")
        .eq("vessel_id", Number(id))
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const row = vessel.data;

  return (
    <div className="space-y-4">
      {vessel.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {row && (
        <>
          <div>
            <h1 className="text-2xl font-semibold">{row.name}</h1>
            <p className="text-sm text-muted-foreground">
              {row.owner_name} · {row.vessel_type} · {row.imo ? `IMO ${row.imo}` : "IMO not resolved"}
              {row.mmsi ? ` · MMSI ${row.mmsi}` : ""} · {row.relevance}
            </p>
            {row.owner_operator_id && (
              <Link className="text-sm underline" href={`/employers/${row.owner_operator_id}`}>Open contractor record</Link>
            )}
            {row.notes && <p className="mt-2 text-sm">{row.notes}</p>}
            {row.resolution_note && <p className="mt-1 text-xs text-muted-foreground">{row.resolution_note}</p>}
          </div>
          <div className="rounded-lg border p-3 text-sm">
            <div>Last position: {row.last_lat != null ? `${row.last_lat}, ${row.last_lng}` : "none stored"}</div>
            <div>Destination (AIS text, unreliable): {row.last_destination || "—"}</div>
            <div>Observed: {row.last_position_at ? format(new Date(row.last_position_at), "dd MMM yyyy HH:mm") : "—"}</div>
          </div>
          <ul className="divide-y rounded-lg border">
            {(signals.data ?? []).map((signal) => (
              <li key={signal.signal_id} className="space-y-1 p-3 text-sm">
                <div className="flex gap-2">
                  <Badge variant="outline">{layerLabel(signal.source_layer)}</Badge>
                  <span>{confidenceLabel(Number(signal.confidence))}</span>
                  <span className="text-muted-foreground">{format(new Date(signal.occurred_at), "dd MMM yyyy")}</span>
                </div>
                <div>{signal.title}</div>
                {signal.extract && <p className="text-muted-foreground">{signal.extract}</p>}
                {signal.url && <a className="underline" href={signal.url} target="_blank" rel="noreferrer">Source</a>}
              </li>
            ))}
            {(signals.data ?? []).length === 0 && <li className="p-3 text-sm text-muted-foreground">No signals yet.</li>}
          </ul>
        </>
      )}
    </div>
  );
}
