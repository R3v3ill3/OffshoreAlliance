"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { MobilisationTabs } from "../_components/tabs";
import { MobilisationMap } from "../_components/map-view";

export default function MobilisationMapPage() {
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Mobilisation map</h1>
        <p className="text-sm text-muted-foreground">
          Geofences and the last AISStream position stored for each watchlisted vessel. A hull appears here only after it has been heard inside terrestrial range of the North-West. Positions are internal only.
        </p>
      </div>
      <MobilisationTabs current="/mobilisation/map" />
      {(geofences.error || vessels.error) && (
        <p className="text-sm text-destructive">{((geofences.error || vessels.error) as Error).message}</p>
      )}
      <MobilisationMap
        geofences={(geofences.data ?? []) as never}
        vessels={(vessels.data ?? []) as never}
      />
    </div>
  );
}
