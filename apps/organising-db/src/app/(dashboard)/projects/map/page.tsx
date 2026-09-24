"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MobilisationMap, type ActivityPoint } from "@/app/(dashboard)/mobilisation/_components/map-view";
import { useUpcomingProjects } from "@/lib/hooks/useUpcomingProjects";
import { PROJECTS_PATH } from "@/lib/projects/routes";

export default function ProjectsMapPage() {
  const router = useRouter();
  const projects = useUpcomingProjects();
  const geofences = useQuery({
    queryKey: ["mobilisation-geofences"],
    queryFn: async () => {
      const sb = createClient();
      const { data, error } = await sb.from("geofences").select("geofence_id, name, geometry, is_active").order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const vessels = useQuery({
    queryKey: ["mobilisation-vessel-positions"],
    queryFn: async () => {
      const sb = createClient();
      const { data, error } = await sb
        .from("vessels")
        .select("vessel_id, name, imo, last_lat, last_lng, last_position_at, owner_name, is_active")
        .eq("is_active", true);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const activities = useMemo<ActivityPoint[]>(() => {
    return (projects.data ?? [])
      .filter((row) => row.latitude != null && row.longitude != null)
      .map((row) => ({
        id: row.id,
        title: row.title ?? "Untitled activity",
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        lifecycle: row.lifecycle_classification,
      }));
  }, [projects.data]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Geofences, last vessel positions, and approved activities that have coordinates. Positions stay inside the app.
      </p>
      {(geofences.error || vessels.error || projects.error) && (
        <p className="text-sm text-destructive">
          {((geofences.error || vessels.error || projects.error) as Error).message}
        </p>
      )}
      <MobilisationMap
        geofences={(geofences.data ?? []) as never}
        vessels={(vessels.data ?? []) as never}
        activities={activities}
        onActivityClick={(id) => router.push(`${PROJECTS_PATH}?activity=${id}`)}
      />
    </div>
  );
}
