"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface GeofenceShape {
  geofence_id: number;
  name: string;
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
  is_active: boolean;
}

interface VesselPoint {
  vessel_id: number;
  name: string;
  imo: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_position_at: string | null;
  owner_name: string;
}

interface Props {
  geofences: GeofenceShape[];
  vessels: VesselPoint[];
  height?: string;
  draft?: [number, number][];
  onClick?: (lng: number, lat: number) => void;
}

type LatLng = [number, number];

function rings(geometry: GeofenceShape["geometry"]): LatLng[][] {
  if (geometry.type === "Polygon") {
    return (geometry.coordinates as number[][][]).map((ring) => ring.map(([lng, lat]) => [lat, lng] as LatLng));
  }
  return (geometry.coordinates as number[][][][]).flatMap((poly) =>
    poly.map((ring) => ring.map(([lng, lat]) => [lat, lng] as LatLng))
  );
}

/**
 * Internal map of geofences and last-known positions. Positions come from the
 * AIS poll and stay inside the signed-in app.
 */
export function MobilisationMap({ geofences, vessels, height = "560px", draft, onClick }: Props) {
  const [mods, setMods] = useState<{
    MapContainer: React.ComponentType<Record<string, unknown>>;
    TileLayer: React.ComponentType<Record<string, unknown>>;
    Polygon: React.ComponentType<Record<string, unknown>>;
    CircleMarker: React.ComponentType<Record<string, unknown>>;
    Popup: React.ComponentType<Record<string, unknown>>;
    Clicker: React.ComponentType<{ onClick?: (lng: number, lat: number) => void }>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([import("react-leaflet"), import("leaflet")]).then(([rl]) => {
      if (cancelled) return;
      function Clicker({ onClick: click }: { onClick?: (lng: number, lat: number) => void }) {
        rl.useMapEvents({
          click(event) {
            click?.(event.latlng.lng, event.latlng.lat);
          },
        });
        return null;
      }
      setMods({
        MapContainer: rl.MapContainer as unknown as React.ComponentType<Record<string, unknown>>,
        TileLayer: rl.TileLayer as unknown as React.ComponentType<Record<string, unknown>>,
        Polygon: rl.Polygon as unknown as React.ComponentType<Record<string, unknown>>,
        CircleMarker: rl.CircleMarker as unknown as React.ComponentType<Record<string, unknown>>,
        Popup: rl.Popup as unknown as React.ComponentType<Record<string, unknown>>,
        Clicker,
      });
    });
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mods) {
    return <div className="rounded-lg border bg-muted/40" style={{ height }} />;
  }
  const { MapContainer, TileLayer, Polygon, CircleMarker, Popup, Clicker } = mods;
  const positioned = vessels.filter((v) => v.last_lat != null && v.last_lng != null);

  return (
    <div className="overflow-hidden rounded-lg border" style={{ height }}>
      <MapContainer center={[-18.5, 122]} zoom={5} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Clicker onClick={onClick} />
        {geofences.filter((g) => g.is_active).map((fence) => (
          <Polygon
            key={fence.geofence_id}
            positions={rings(fence.geometry)}
            pathOptions={{ color: "#0f766e", weight: 2, fillOpacity: 0.12 }}
          >
            <Popup>{fence.name}</Popup>
          </Polygon>
        ))}
        {draft && draft.length > 1 && (
          <Polygon
            positions={draft.map(([lng, lat]) => [lat, lng])}
            pathOptions={{ color: "#b45309", weight: 2, dashArray: "4 4", fillOpacity: 0.08 }}
          />
        )}
        {positioned.map((vessel) => (
          <CircleMarker
            key={vessel.vessel_id}
            center={[vessel.last_lat as number, vessel.last_lng as number]}
            radius={7}
            pathOptions={{ color: "#9f1239", fillColor: "#e11d48", fillOpacity: 0.9 }}
          >
            <Popup>
              <div className="text-sm">
                <Link href={`/mobilisation/vessels/${vessel.vessel_id}`} className="font-medium underline">
                  {vessel.name}
                </Link>
                <div>{vessel.owner_name}</div>
                <div>{vessel.imo ? `IMO ${vessel.imo}` : "IMO not resolved"}</div>
                <div>{vessel.last_position_at ? new Date(vessel.last_position_at).toLocaleString() : ""}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
