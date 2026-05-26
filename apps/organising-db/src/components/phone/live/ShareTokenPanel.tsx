"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link as LinkIcon, X, Hand } from "lucide-react";

interface ShareTokenPanelProps {
  token: {
    token_id: number;
    list_id: number;
    list_name: string;
    attempts: number;
    unique_workers: number;
    active_claims: number;
    last_used_at: string | null;
    expires_at: string | null;
  };
  onRevoke: () => void;
  onForceRelease: () => void;
  onDrillDown?: () => void;
}

export function ShareTokenPanel({ token, onRevoke, onForceRelease, onDrillDown }: ShareTokenPanelProps) {
  return (
    <Card
      className={onDrillDown ? "cursor-pointer transition hover:bg-muted/30" : undefined}
      onClick={(event) => {
        if (!onDrillDown) return;
        const target = event.target as HTMLElement;
        if (target.closest("button")) return;
        onDrillDown();
      }}
    >
      <CardContent className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <LinkIcon className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{token.list_name}</p>
              <p className="text-[11px] text-muted-foreground">
                Token #{token.token_id} · expires{" "}
                {token.expires_at
                  ? new Date(token.expires_at).toLocaleString("en-AU", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-3 text-xs">
            <Stat label="Attempts" value={token.attempts} />
            <Stat label="Workers" value={token.unique_workers} />
            <Stat label="Active" value={token.active_claims} />
            {token.last_used_at ? (
              <Badge variant="outline" className="text-[11px]">
                Last seen {new Date(token.last_used_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
              </Badge>
            ) : null}
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onForceRelease}
              disabled={token.active_claims === 0}
              title="Release every active claim from this share token"
            >
              <Hand className="h-3 w-3 mr-1" />
              Release claims
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={onRevoke}
            >
              <X className="h-3 w-3 mr-1" />
              Revoke
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </span>
  );
}
