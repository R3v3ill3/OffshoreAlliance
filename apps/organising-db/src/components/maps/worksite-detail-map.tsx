"use client";

import { useEffect, useState } from "react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { Button } from "@/components/ui/button";
import { Map, Layers } from "lucide-react";

interface WorksiteDetailMapProps {
  latitude: number;
  longitude: number;
  worksiteName: string;
  worksiteType: string;
  isOffshore: boolean;
  height?: string;
}

const ZOOM_BY_TYPE: Record<string, number> = {
  FPSO: 10,
  FPU: 10,
  FLNG: 10,
  Platform: 10,
  CPF: 10,
  Drill_Centre: 10,
  Gas_Field: 9,
  Onshore_LNG: 14,
  Gas_Plant: 14,
  Onshore_Facilities: 14,
  Heliport: 15,
  Airfield: 14,
  Pipeline: 8,
  Region: 6,
  Other: 12,
};

type TileMode = "satellite" | "street";

export function WorksiteDetailMap({
  latitude,
  longitude,
  worksiteName,
  worksiteType,
  isOffshore,
  height = "16rem",
}: WorksiteDetailMapProps) {
  const [mounted, setMounted] = useState(false);
  const [tileMode, setTileMode] = useState<TileMode>(
    isOffshore ? "satellite" : "street"
  );
  const [MapComponents, setMapComponents] = useState<{
    MapContainer: React.ComponentType<Record<string, unknown>>;
    TileLayer: React.ComponentType<Record<string, unknown>>;
    CircleMarker: React.ComponentType<Record<string, unknown>>;
    Popup: React.ComponentType<Record<string, unknown>>;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
    import("react-leaflet").then((mod) => {
      setMapComponents({
        MapContainer:
          mod.MapContainer as unknown as React.ComponentType<
            Record<string, unknown>
          >,
        TileLayer:
          mod.TileLayer as unknown as React.ComponentType<
            Record<string, unknown>
          >,
        CircleMarker:
          mod.CircleMarker as unknown as React.ComponentType<
            Record<string, unknown>
          >,
        Popup:
          mod.Popup as unknown as React.ComponentType<
            Record<string, unknown>
          >,
      });
    });

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    return () => {
      document.head.removeChild(link);
    };
  }, []);

  if (!mounted || !MapComponents) {
    return (
      <div
        className="flex items-center justify-center bg-muted rounded-lg"
        style={{ height }}
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <EurekaLoadingSpinner size="sm" />
          <p className="text-xs">Loading map...</p>
        </div>
      </div>
    );
  }

  const { MapContainer, TileLayer, CircleMarker, Popup } = MapComponents;
  const zoom = ZOOM_BY_TYPE[worksiteType] ?? 12;

  const tileConfig =
    tileMode === "satellite"
      ? {
          url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          attribution:
            "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
        }
      : {
          url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        };

  return (
    <div className="relative">
      <div className="rounded-lg border overflow-hidden" style={{ height }}>
        <MapContainer
          center={[latitude, longitude]}
          zoom={zoom}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution={tileConfig.attribution}
            url={tileConfig.url}
          />
          <CircleMarker
            center={[latitude, longitude]}
            radius={9}
            pathOptions={{
              color: "#3B82F6",
              fillColor: "#3B82F6",
              fillOpacity: 0.7,
              weight: 3,
            }}
          >
            <Popup>
              <div className="min-w-36">
                <h3 className="font-semibold text-sm">{worksiteName}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {worksiteType.replace(/_/g, " ")}
                </p>
                <p className="text-xs mt-1">
                  {latitude.toFixed(4)}, {longitude.toFixed(4)}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        </MapContainer>
      </div>

      <div className="absolute top-2 right-2 z-[1000]">
        <Button
          size="sm"
          variant="secondary"
          className="h-7 gap-1 text-xs shadow-md"
          onClick={() =>
            setTileMode((m) => (m === "satellite" ? "street" : "satellite"))
          }
        >
          {tileMode === "satellite" ? (
            <>
              <Map className="h-3 w-3" />
              Street
            </>
          ) : (
            <>
              <Layers className="h-3 w-3" />
              Satellite
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
