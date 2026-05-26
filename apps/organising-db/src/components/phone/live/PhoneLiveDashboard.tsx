"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Activity,
  Users,
  Link as LinkIcon,
  Phone,
  AlertTriangle,
  RefreshCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { fetchApi } from "@/lib/api/fetch-api";
import { CallerTile } from "./CallerTile";
import { ShareTokenPanel } from "./ShareTokenPanel";
import { LiveActivityFeed } from "./LiveActivityFeed";
import { OutcomeRollupCard } from "./OutcomeRollupCard";

const POLL_INTERVAL_MS = 15_000;

interface LivePayload {
  header: {
    total_contacts: number;
    completed: number;
    in_progress: number;
    deferred: number;
    abandoned_claims: number;
  };
  lists: {
    list_id: number;
    name: string;
    status: string;
    total_items: number | null;
    completed_items: number | null;
  }[];
  callers: {
    id: string;
    label: string | null;
    source: "staff" | "share";
    worker_id: number | null;
    attempts_15m: number;
    connected_15m: number;
    connect_rate_15m: number | null;
    last_action_at: string | null;
    attempts_total: number;
    current_claim_item_id: number | null;
    current_claim_age_min: number | null;
    idle_minutes: number | null;
  }[];
  tokens: {
    token_id: number;
    list_id: number;
    list_name: string;
    attempts: number;
    unique_workers: number;
    active_claims: number;
    last_used_at: string | null;
    expires_at: string | null;
  }[];
  activity: {
    kind: "attempt" | "event";
    at: string;
    label: string;
    detail: string;
  }[];
  rollup: {
    outcome_counts: Record<string, number>;
    objection_clusters: { label: string; count: number }[];
    issue_heat: { label: string; heat: number }[];
  };
}

interface PhoneLiveDashboardProps {
  campaignId: string;
}

export function PhoneLiveDashboard({ campaignId }: PhoneLiveDashboardProps) {
  const router = useRouter();
  const [data, setData] = useState<LivePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchApi(`/api/campaigns/${campaignId}/phone/live`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error ?? "Failed to load");
      setData(body as LivePayload);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load live data");
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  const handleRevokeToken = useCallback(
    async (tokenId: number, listId: number) => {
      try {
        const res = await fetchApi(
          `/api/campaigns/${campaignId}/call-lists/${listId}/share-tokens/revoke`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tokenId }),
          },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error ?? "Failed to revoke");
        const released = (body as { released_claims?: number }).released_claims ?? 0;
        toast.success(
          released > 0
            ? `Token revoked. Released ${released} active claim${released === 1 ? "" : "s"}.`
            : "Token revoked.",
        );
        void load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to revoke");
      }
    },
    [campaignId, load],
  );

  const handleForceRelease = useCallback(
    async (target: { tokenId?: number; itemId?: number; listId: number }) => {
      try {
        const res = await fetchApi(
          `/api/campaigns/${campaignId}/call-lists/${target.listId}/share-tokens/force-release`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              target.tokenId ? { tokenId: target.tokenId } : { itemId: target.itemId },
            ),
          },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error ?? "Failed to release");
        const released = (body as { released_claims?: number }).released_claims ?? 0;
        toast.success(`Released ${released} claim${released === 1 ? "" : "s"}.`);
        void load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to release");
      }
    },
    [campaignId, load],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/campaigns/${campaignId}/phone`)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Phone ops
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Live phone action
          </h2>
          <p className="text-sm text-muted-foreground">
            Real-time view of every caller and share link on this campaign.
            {lastUpdated ? (
              <span className="ml-1 text-xs">
                Updated {lastUpdated.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            ) : null}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={isLoading}>
          <RefreshCcw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <Card className="border-rose-300 bg-rose-50">
          <CardContent className="flex items-start gap-2 p-3 text-sm text-rose-900">
            <AlertTriangle className="h-4 w-4 mt-0.5" />
            {error}
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <HeaderStat label="Contacts" value={data.header.total_contacts} />
            <HeaderStat label="Completed" value={data.header.completed} />
            <HeaderStat label="In progress" value={data.header.in_progress} />
            <HeaderStat label="Deferred" value={data.header.deferred} />
            <HeaderStat
              label="Abandoned claims"
              value={data.header.abandoned_claims}
              variant={data.header.abandoned_claims > 0 ? "warn" : "default"}
            />
          </div>

          <section className="space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Callers
              <Badge variant="secondary" className="text-xs">{data.callers.length}</Badge>
            </h3>
            {data.callers.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No active callers yet. Share a call list link and they will appear here as
                they sign in.
              </p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {data.callers.map((caller) => (
                  <CallerTile
                    key={caller.id}
                    caller={caller}
                    onForceRelease={
                      caller.current_claim_item_id
                        ? () => {
                            const item = data.callers.find((c) => c.id === caller.id);
                            const itemId = item?.current_claim_item_id ?? null;
                            const list = data.lists.find((l) => l.list_id !== undefined);
                            if (!itemId || !list) return;
                            void handleForceRelease({ itemId, listId: list.list_id });
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              Active share links
              <Badge variant="secondary" className="text-xs">{data.tokens.length}</Badge>
            </h3>
            {data.tokens.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No active share links. Open a call list and use “Share” to create one.
              </p>
            ) : (
              <div className="space-y-2">
                {data.tokens.map((tok) => (
                  <ShareTokenPanel
                    key={tok.token_id}
                    token={tok}
                    onRevoke={() => void handleRevokeToken(tok.token_id, tok.list_id)}
                    onForceRelease={() =>
                      void handleForceRelease({ tokenId: tok.token_id, listId: tok.list_id })
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <LiveActivityFeed activity={data.activity} />
            </div>
            <div className="space-y-4">
              <OutcomeRollupCard outcomes={data.rollup.outcome_counts} />
            </div>
          </div>
        </>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : null}
    </div>
  );
}

function HeaderStat({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: number;
  variant?: "default" | "warn";
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`mt-1 text-2xl font-semibold tabular-nums ${
            variant === "warn" && value > 0 ? "text-amber-700" : "text-foreground"
          }`}
        >
          {value}
        </p>
        {variant === "warn" && value > 0 ? (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-700">
            <Phone className="h-3 w-3" />
            Held &gt; 10 min
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
