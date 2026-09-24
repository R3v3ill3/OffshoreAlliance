"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MobilisationMap } from "@/app/(dashboard)/mobilisation/_components/map-view";
import { projectContractorPath, projectVesselPath } from "@/lib/projects/routes";
import { useUpcomingProjects } from "@/lib/hooks/useUpcomingProjects";

export default function WatchlistPage() {
  const { canWrite } = useAuth();
  const projects = useUpcomingProjects();
  const queryClient = useQueryClient();
  const contractors = useQuery({
    queryKey: ["mobilisation-contractors"],
    queryFn: async () => {
      const sb = createClient();
      const { data, error } = await sb.from("mobilisation_watch_contractors").select("*").order("canonical_name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const vessels = useQuery({
    queryKey: ["mobilisation-vessels"],
    queryFn: async () => {
      const sb = createClient();
      const { data, error } = await sb.from("vessels").select("*").order("owner_name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const keywords = useQuery({
    queryKey: ["mobilisation-keywords"],
    queryFn: async () => {
      const sb = createClient();
      const { data, error } = await sb.from("mobilisation_watch_keywords").select("*").order("kind");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const geofences = useQuery({
    queryKey: ["mobilisation-geofences"],
    queryFn: async () => {
      const sb = createClient();
      const { data, error } = await sb.from("geofences").select("*").order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const [contractorName, setContractorName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [keywordKind, setKeywordKind] = useState("project");
  const [vesselName, setVesselName] = useState("");
  const [vesselImo, setVesselImo] = useState("");
  const [vesselOwner, setVesselOwner] = useState("");
  const [searchHits, setSearchHits] = useState<{ name: string; imo: string | null; mmsi: string | null }[]>([]);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [fenceName, setFenceName] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["mobilisation-contractors"] });
    queryClient.invalidateQueries({ queryKey: ["mobilisation-vessels"] });
    queryClient.invalidateQueries({ queryKey: ["mobilisation-keywords"] });
    queryClient.invalidateQueries({ queryKey: ["mobilisation-geofences"] });
  };

  const addContractor = useMutation({
    mutationFn: async () => {
      const sb = createClient();
      const name = contractorName.trim();
      const { data: employers } = await sb.from("employers").select("employer_id, employer_name").ilike("employer_name", name).limit(1);
      const { error } = await sb.from("mobilisation_watch_contractors").insert({
        canonical_name: name,
        tier: "adjacent",
        is_active: true,
        employer_id: employers?.[0]?.employer_id ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setContractorName("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleContractor = useMutation({
    mutationFn: async (row: { watch_id: number; is_active: boolean }) => {
      const sb = createClient();
      const { error } = await sb.from("mobilisation_watch_contractors").update({ is_active: !row.is_active }).eq("watch_id", row.watch_id);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const addKeyword = useMutation({
    mutationFn: async () => {
      const sb = createClient();
      const { error } = await sb.from("mobilisation_watch_keywords").insert({ keyword: keyword.trim(), kind: keywordKind, is_active: true });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setKeyword("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addVessel = useMutation({
    mutationFn: async (input: { name: string; imo: string | null; owner: string; mmsi?: string | null }) => {
      const sb = createClient();
      const { data, error } = await sb
        .from("vessels")
        .insert({
          name: input.name,
          imo: input.imo,
          mmsi: input.mmsi ?? null,
          owner_name: input.owner || "Unknown",
          vessel_type: "other",
          relevance: "nw",
          is_active: true,
        })
        .select("vessel_id")
        .single();
      if (error) throw new Error(error.message);
      const link = await sb.from("mobilisation_watch_vessels").insert({ vessel_id: data.vessel_id, is_active: true });
      if (link.error) throw new Error(link.error.message);
    },
    onSuccess: () => {
      setVesselName("");
      setVesselImo("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveFence = useMutation({
    mutationFn: async () => {
      if (draft.length < 3) throw new Error("A geofence needs at least 3 points.");
      const ring = [...draft, draft[0]!];
      const sb = createClient();
      const slug = fenceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `fence-${Date.now()}`;
      const { error } = await sb.from("geofences").insert({
        name: fenceName.trim(),
        slug,
        geometry: { type: "Polygon", coordinates: [ring] },
        is_active: true,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setDraft([]);
      setFenceName("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleVessel = useMutation({
    mutationFn: async (row: { vessel_id: number; is_active: boolean }) => {
      const sb = createClient();
      const next = !row.is_active;
      const vesselUpdate = await sb.from("vessels").update({ is_active: next }).eq("vessel_id", row.vessel_id);
      if (vesselUpdate.error) throw new Error(vesselUpdate.error.message);
      const watchUpdate = await sb.from("mobilisation_watch_vessels").update({ is_active: next }).eq("vessel_id", row.vessel_id);
      if (watchUpdate.error) throw new Error(watchUpdate.error.message);
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const removeKeyword = useMutation({
    mutationFn: async (keywordId: number) => {
      const sb = createClient();
      const { error } = await sb.from("mobilisation_watch_keywords").delete().eq("keyword_id", keywordId);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const replaceFence = useMutation({
    mutationFn: async (geofenceId: number) => {
      if (draft.length < 3) throw new Error("Draw at least 3 points, then replace the polygon.");
      const ring = [...draft, draft[0]!];
      const sb = createClient();
      const { error } = await sb
        .from("geofences")
        .update({ geometry: { type: "Polygon", coordinates: [ring] } })
        .eq("geofence_id", geofenceId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setDraft([]);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleFence = useMutation({
    mutationFn: async (row: { geofence_id: number; is_active: boolean }) => {
      const sb = createClient();
      const { error } = await sb.from("geofences").update({ is_active: !row.is_active }).eq("geofence_id", row.geofence_id);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Contractors, vessels, keywords and the polygons that define the North-West region. Adjacent contractors are seeded inactive.
      </p>

      <section className="space-y-3">
        <h2 className="font-medium">Contractors</h2>
        {canWrite && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addContractor.mutate();
            }}
          >
            <Input value={contractorName} onChange={(e) => setContractorName(e.target.value)} placeholder="Add contractor name" />
            <Button type="submit" disabled={!contractorName.trim()}>Add</Button>
          </form>
        )}
        <ul className="divide-y rounded-lg border">
          {(contractors.data ?? []).map((row) => (
            <li key={row.watch_id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div>
                <Link className="font-medium underline" href={projectContractorPath(row.watch_id)}>{row.canonical_name}</Link>
                <div className="text-xs text-muted-foreground">
                  {row.tier} {row.employer_id ? `· linked employer ${row.employer_id}` : "· not linked to an employer yet"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={row.is_active ? "secondary" : "outline"}>{row.is_active ? "Watching" : "Off"}</Badge>
                {canWrite && (
                  <Button size="sm" variant="outline" onClick={() => toggleContractor.mutate(row)}>
                    {row.is_active ? "Pause" : "Watch"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Vessels</h2>
        {canWrite && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Input value={vesselName} onChange={(e) => setVesselName(e.target.value)} placeholder="Name" className="max-w-xs" />
              <Input value={vesselImo} onChange={(e) => setVesselImo(e.target.value)} placeholder="IMO" className="max-w-[140px]" />
              <Input value={vesselOwner} onChange={(e) => setVesselOwner(e.target.value)} placeholder="Contractor" className="max-w-xs" />
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  const response = await fetch(`/api/mobilisation/vessels/search?q=${encodeURIComponent(vesselName)}`);
                  const body = await response.json();
                  setSearchHits(body.results ?? []);
                  if (body.warning) toast.message(body.warning);
                }}
              >
                Search AIS
              </Button>
              <Button
                type="button"
                disabled={!vesselName.trim()}
                onClick={() => addVessel.mutate({ name: vesselName.trim(), imo: vesselImo.trim() || null, owner: vesselOwner.trim() })}
              >
                Add
              </Button>
            </div>
            {searchHits.length > 0 && (
              <ul className="rounded-lg border text-sm">
                {searchHits.map((hit) => (
                  <li key={`${hit.imo}-${hit.name}`} className="flex items-center justify-between p-2">
                    <span>{hit.name} {hit.imo ? `· IMO ${hit.imo}` : ""}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => addVessel.mutate({ name: hit.name, imo: hit.imo, owner: vesselOwner.trim() || "Unknown", mmsi: hit.mmsi })}
                    >
                      Use
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <ul className="divide-y rounded-lg border">
          {(vessels.data ?? []).map((row) => (
            <li key={row.vessel_id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <Link className="font-medium underline" href={projectVesselPath(row.vessel_id)}>{row.name}</Link>
                <div className="text-xs text-muted-foreground">
                  {row.owner_name} · {row.vessel_type} · {row.imo ? `IMO ${row.imo}` : "IMO pending"} · {row.relevance}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={row.is_active ? "secondary" : "outline"}>{row.is_active ? "Watching" : "Off"}</Badge>
                {canWrite && (
                  <Button size="sm" variant="outline" onClick={() => toggleVessel.mutate(row)}>
                    {row.is_active ? "Remove" : "Watch"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Keywords</h2>
        {canWrite && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addKeyword.mutate();
            }}
          >
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Project, operator or place" />
            <select className="rounded-md border bg-background px-2 text-sm" value={keywordKind} onChange={(e) => setKeywordKind(e.target.value)}>
              <option value="project">Project</option>
              <option value="operator">Operator</option>
              <option value="region">Region</option>
              <option value="general">General</option>
            </select>
            <Button type="submit" disabled={!keyword.trim()}>Add</Button>
          </form>
        )}
        <div className="flex flex-wrap gap-2">
          {(keywords.data ?? []).map((row) => (
            <Badge key={row.keyword_id} variant="outline" className="gap-1">
              {row.kind}: {row.keyword}{row.asx_ticker ? ` (${row.asx_ticker})` : ""}
              {canWrite && (
                <button type="button" className="ml-1" onClick={() => removeKeyword.mutate(row.keyword_id)} aria-label={`Remove ${row.keyword}`}>
                  ×
                </button>
              )}
            </Badge>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Geofences</h2>
        <p className="text-sm text-muted-foreground">
          Click the map to drop vertices, then save. The seeded polygons cover the Carnarvon / North West Shelf, Browse, and Bonaparte / Timor Sea. Bass Strait is outside them.
        </p>
        <MobilisationMap
          height="420px"
          geofences={(geofences.data ?? []) as never}
          vessels={(vessels.data ?? []) as never}
          activities={(projects.data ?? [])
            .filter((row) => row.latitude != null && row.longitude != null)
            .map((row) => ({
              id: row.id,
              title: row.title ?? "Untitled activity",
              latitude: Number(row.latitude),
              longitude: Number(row.longitude),
              lifecycle: row.lifecycle_classification,
            }))}
          draft={draft}
          onClick={canWrite ? (lng, lat) => setDraft((points) => [...points, [Number(lng.toFixed(4)), Number(lat.toFixed(4))]]) : undefined}
        />
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <Input value={fenceName} onChange={(e) => setFenceName(e.target.value)} placeholder="Geofence name" className="max-w-xs" />
            <Button disabled={draft.length < 3 || !fenceName.trim()} onClick={() => saveFence.mutate()}>
              Save polygon ({draft.length} points)
            </Button>
            <Button variant="outline" onClick={() => setDraft((points) => points.slice(0, -1))}>Undo point</Button>
            <Button variant="ghost" onClick={() => setDraft([])}>Clear</Button>
          </div>
        )}
        <ul className="divide-y rounded-lg border">
          {(geofences.data ?? []).map((row) => (
            <li key={row.geofence_id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <div className="font-medium">{row.name}</div>
                <div className="text-xs text-muted-foreground">{row.description}</div>
              </div>
              {canWrite && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={draft.length < 3}
                    onClick={() => replaceFence.mutate(row.geofence_id)}
                  >
                    Replace shape
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toggleFence.mutate(row)}>
                    {row.is_active ? "Disable" : "Enable"}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
