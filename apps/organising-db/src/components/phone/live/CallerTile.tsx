"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { User, UserCheck, Clock, AlertTriangle, Hand } from "lucide-react";

interface CallerTileProps {
  caller: {
    id: string;
    label: string | null;
    source: "staff" | "share";
    attempts_15m: number;
    connect_rate_15m: number | null;
    last_action_at: string | null;
    attempts_total: number;
    current_claim_item_id: number | null;
    current_claim_age_min: number | null;
    idle_minutes: number | null;
  };
  /** Coordinator force-release on the active claim. */
  onForceRelease?: () => void;
}

const IDLE_THRESHOLD_MIN = 8;

export function CallerTile({ caller, onForceRelease }: CallerTileProps) {
  const idleWarn =
    caller.idle_minutes != null && caller.idle_minutes > IDLE_THRESHOLD_MIN;

  return (
    <Card className={idleWarn ? "border-amber-300 bg-amber-50/40" : undefined}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          {caller.source === "staff" ? (
            <UserCheck className="h-4 w-4 text-blue-600" />
          ) : (
            <User className="h-4 w-4 text-emerald-600" />
          )}
          <span className="text-sm font-medium truncate">
            {caller.label ?? "Anonymous caller"}
          </span>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            {caller.source}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <Stat label="15m" value={String(caller.attempts_15m)} />
          <Stat
            label="Connect"
            value={caller.connect_rate_15m != null ? `${caller.connect_rate_15m}%` : "—"}
          />
          <Stat label="Total" value={String(caller.attempts_total)} />
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {caller.last_action_at
              ? `Last action ${formatRelative(caller.last_action_at)}`
              : "No actions yet"}
          </p>
          {caller.current_claim_item_id ? (
            <p>
              Holding contact #{caller.current_claim_item_id}
              {caller.current_claim_age_min != null
                ? ` for ${caller.current_claim_age_min}m`
                : null}
            </p>
          ) : (
            <p>No active claim</p>
          )}
          {idleWarn ? (
            <p className="inline-flex items-center gap-1 font-medium text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              Idle {caller.idle_minutes}m
            </p>
          ) : null}
        </div>

        {caller.current_claim_item_id && onForceRelease ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            onClick={onForceRelease}
          >
            <Hand className="h-3 w-3 mr-1" />
            Force release
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-muted/30 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso);
  if (diffMs < 60_000) return "just now";
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}
