"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";

const LINKS = [
  { href: "/mobilisation", label: "Feed" },
  { href: "/mobilisation/map", label: "Map" },
  { href: "/mobilisation/watchlist", label: "Watchlist" },
  { href: "/mobilisation/settings", label: "Notifications" },
];

export function MobilisationTabs({ current }: { current: string }) {
  return (
    <div className="flex flex-wrap gap-2 border-b pb-3">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm",
            current === link.href ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

export function confidenceLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function layerLabel(layer: string): string {
  if (layer === "regulatory") return "Regulatory";
  if (layer === "commercial") return "Commercial";
  if (layer === "ais") return "AIS";
  return layer;
}
