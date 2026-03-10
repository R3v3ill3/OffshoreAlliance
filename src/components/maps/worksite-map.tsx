"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MapPin, Layers, Filter } from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import type { Worksite, Sector } from "@/types/database";

interface WorksiteMapProps {
  worksites: (Worksite & { operator_name?: string; agreement_count?: number; worker_count?: number })[];
  sectors?: Sector[];
  height?: string;
  showFilters?: boolean;
  onWorksiteClick?: (worksite: Worksite) => void;
}

const WORKSITE_TYPE_COLORS: Record<string, string> = {
  FPSO: "#3B82F6",
  FLNG: "#8B5CF6",
  Platform: "#EF4444",
  Onshore_LNG: "#F59E0B",
  Gas_Plant: "#10B981",
  Hub: "#6366F1",
  Drill_Centre: "#EC4899",
  Heliport: "#14B8A6",
  Pipeline: "#78716C",
  Airfield: "#06B6D4",
  Onshore_Facilities: "#84CC16",
  CPF: "#F97316",
  Gas_Field: "#A855F7",
  Region: "#64748B",
  Other: "#9CA3AF",
};

export function WorksiteMap({
  worksites,
  sectors = [],
  height = "500px",
  showFilters = true,
  onWorksiteClick,
}: WorksiteMapProps) {
  const [mounted, setMounted] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterOffshore, setFilterOffshore] = useState<string>("all");
  const [MapComponents, setMapComponents] = useState<{
    MapContainer: React.ComponentType<Record<string, unknown>>;
    TileLayer: React.ComponentType<Record<string, unknown>>;
    Marker: React.ComponentType<Record<string, unknown>>;
    Popup: React.ComponentType<Record<string, unknown>>;
    CircleMarker: React.ComponentType<Record<string, unknown>>;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
    import("react-leaflet").then((mod) => {
      setMapComponents({
        MapContainer: mod.MapContainer as unknown as React.ComponentType<Record<string, unknown>>,
        TileLayer: mod.TileLayer as unknown as React.ComponentType<Record<string, unknown>>,
        Marker: mod.Marker as unknown as React.ComponentType<Record<string, unknown>>,
        Popup: mod.Popup as unknown as React.ComponentType<Record<string, unknown>>,
        CircleMarker: mod.CircleMarker as unknown as React.ComponentType<Record<string, unknown>>,
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

  const filtered = worksites.filter((ws) => {
    if (filterType !== "all" && ws.worksite_type !== filterType) return false;
    if (filterOffshore === "offshore" && !ws.is_offshore) return false;
    if (filterOffshore === "onshore" && ws.is_offshore) return false;
    return true;
  });

  const geoWorksites = filtered.filter((ws) => ws.latitude && ws.longitude);

  const worksiteTypes = [...new Set(worksites.map((ws) => ws.worksite_type))].sort();

  if (!mounted || !MapComponents) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center" style={{ height }}>
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <EurekaLoadingSpinner size="lg" />
            <p>Loading map...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { MapContainer, TileLayer, CircleMarker, Popup } = MapComponents;

  const center = geoWorksites.length > 0
    ? {
        lat: geoWorksites.reduce((s, w) => s + (w.latitude || 0), 0) / geoWorksites.length,
        lng: geoWorksites.reduce((s, w) => s + (w.longitude || 0), 0) / geoWorksites.length,
      }
    : { lat: -20.7, lng: 116.8 };

  return (
    <div className="space-y-4">
      {showFilters && (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Worksite Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {worksiteTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterOffshore} onValueChange={setFilterOffshore}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              <SelectItem value="offshore">Offshore</SelectItem>
              <SelectItem value="onshore">Onshore</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-sm text-muted-foreground">
            {geoWorksites.length} of {filtered.length} worksites with coordinates
          </div>
        </div>
      )}

      <div className="rounded-lg border overflow-hidden" style={{ height }}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={6}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {geoWorksites.map((ws) => (
            <CircleMarker
              key={ws.worksite_id}
              center={[ws.latitude!, ws.longitude!]}
              radius={8}
              pathOptions={{
                color: WORKSITE_TYPE_COLORS[ws.worksite_type] || "#9CA3AF",
                fillColor: WORKSITE_TYPE_COLORS[ws.worksite_type] || "#9CA3AF",
                fillOpacity: 0.7,
                weight: 2,
              }}
              eventHandlers={{
                click: () => onWorksiteClick?.(ws),
              }}
            >
              <Popup>
                <div className="min-w-48">
                  <h3 className="font-semibold text-sm">{ws.worksite_name}</h3>
                  <div className="mt-1 space-y-0.5 text-xs">
                    <p><span className="font-medium">Type:</span> {ws.worksite_type.replace(/_/g, " ")}</p>
                    {ws.operator_name && (
                      <p><span className="font-medium">Operator:</span> {ws.operator_name}</p>
                    )}
                    {ws.location_description && (
                      <p><span className="font-medium">Location:</span> {ws.location_description}</p>
                    )}
                    {ws.basin && (
                      <p><span className="font-medium">Basin:</span> {ws.basin}</p>
                    )}
                    <p>
                      <span className="font-medium">Status:</span>{" "}
                      {ws.is_offshore ? "Offshore" : "Onshore"} | {ws.is_active ? "Active" : "Inactive"}
                    </p>
                    {ws.agreement_count !== undefined && (
                      <p><span className="font-medium">Agreements:</span> {ws.agreement_count}</p>
                    )}
                    {ws.worker_count !== undefined && (
                      <p><span className="font-medium">Workers:</span> {ws.worker_count}</p>
                    )}
                  </div>
                  {onWorksiteClick && (
                    <button
                      className="mt-2 text-xs text-blue-600 hover:underline"
                      onClick={() => onWorksiteClick(ws)}
                    >
                      View Details
                    </button>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {showFilters && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Legend
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="flex flex-wrap gap-2">
              {worksiteTypes.map((type) => (
                <Badge
                  key={type}
                  variant="outline"
                  className="cursor-pointer"
                  style={{
                    borderColor: WORKSITE_TYPE_COLORS[type],
                    backgroundColor: filterType === type ? WORKSITE_TYPE_COLORS[type] + "20" : undefined,
                  }}
                  onClick={() => setFilterType(filterType === type ? "all" : type)}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1"
                    style={{ backgroundColor: WORKSITE_TYPE_COLORS[type] }}
                  />
                  {type.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {filtered.filter((ws) => !ws.latitude || !ws.longitude).length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Worksites Without Coordinates</CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="space-y-1">
              {filtered
                .filter((ws) => !ws.latitude || !ws.longitude)
                .map((ws) => (
                  <div key={ws.worksite_id} className="flex items-center justify-between text-sm">
                    <span>{ws.worksite_name}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{ws.worksite_type.replace(/_/g, " ")}</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs"
                        onClick={() => onWorksiteClick?.(ws)}
                      >
                        Add coordinates
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
