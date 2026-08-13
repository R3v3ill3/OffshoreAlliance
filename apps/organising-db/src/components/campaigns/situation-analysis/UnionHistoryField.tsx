"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { excludeSmsEpisodes } from "@/lib/campaign/visible-campaigns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Sparkles } from "lucide-react";
import type {
  PriorBallotOutcome,
  PriorCampaignSummary,
  UnionHistory,
} from "@/lib/situation-analysis/types";

interface UnionHistoryFieldProps {
  campaignId: number;
  campaignEmployerIds: number[];
  history: UnionHistory;
  onChange: (next: UnionHistory) => void;
}

interface PriorCampaignRow {
  campaign_id: number;
  name: string;
  status: string | null;
  campaign_type: string | null;
}

interface PriorAgreementRow {
  agreement_id: number;
  name: string;
  expiry_date: string | null;
}

export function UnionHistoryField({
  campaignId,
  campaignEmployerIds,
  history,
  onChange,
}: UnionHistoryFieldProps) {
  const supabase = createClient();

  // Auto-load prior campaigns at the same employers (excluding the current
  // campaign).
  const { data: priorCampaigns = [] } = useQuery<PriorCampaignRow[]>({
    queryKey: [
      "situation-analysis-prior-campaigns",
      campaignId,
      campaignEmployerIds,
    ],
    queryFn: async () => {
      if (campaignEmployerIds.length === 0) return [];
      const { data: links } = await supabase
        .from("campaign_employers")
        .select("campaign_id")
        .in("employer_id", campaignEmployerIds);
      const otherCampaignIds = Array.from(
        new Set(
          (links ?? [])
            .map((l) => l.campaign_id as number)
            .filter((id) => id !== campaignId)
        )
      );
      if (otherCampaignIds.length === 0) return [];
      const { data } = await excludeSmsEpisodes(
        supabase
          .from("campaigns")
          .select("campaign_id, name, status, campaign_type")
          .in("campaign_id", otherCampaignIds)
      );
      return (data ?? []) as PriorCampaignRow[];
    },
    enabled: campaignEmployerIds.length > 0,
  });

  // Auto-load prior agreements at the same employers.
  const { data: priorAgreements = [] } = useQuery<PriorAgreementRow[]>({
    queryKey: [
      "situation-analysis-prior-agreements",
      campaignEmployerIds,
    ],
    queryFn: async () => {
      if (campaignEmployerIds.length === 0) return [];
      const { data: links } = await supabase
        .from("agreement_employers")
        .select("agreement_id")
        .in("employer_id", campaignEmployerIds);
      const agreementIds = Array.from(
        new Set((links ?? []).map((l) => l.agreement_id as number))
      );
      if (agreementIds.length === 0) return [];
      const { data } = await supabase
        .from("agreements")
        .select("agreement_id, name, expiry_date")
        .in("agreement_id", agreementIds);
      return (data ?? []) as PriorAgreementRow[];
    },
    enabled: campaignEmployerIds.length > 0,
  });

  // On first load, suggest prior_campaigns rows from the auto-loaded data.
  const suggestedPriorCampaigns = useMemo<PriorCampaignSummary[]>(() => {
    return priorCampaigns.map((c) => ({
      source_campaign_id: c.campaign_id,
      name: c.name,
      outcome: c.status ?? "",
      notes: c.campaign_type ? `Type: ${c.campaign_type}` : "",
    }));
  }, [priorCampaigns]);

  useEffect(() => {
    if (suggestedPriorCampaigns.length === 0) return;
    const existingIds = new Set(
      (history.prior_campaigns ?? [])
        .map((c) => c.source_campaign_id)
        .filter((id): id is number => id != null)
    );
    const additions = suggestedPriorCampaigns.filter(
      (c) => c.source_campaign_id != null && !existingIds.has(c.source_campaign_id)
    );
    if (additions.length > 0) {
      onChange({
        ...history,
        prior_campaigns: [...(history.prior_campaigns ?? []), ...additions],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedPriorCampaigns]);

  const ballots = history.prior_ballot_outcomes ?? [];
  const campaigns = history.prior_campaigns ?? [];

  const updateBallot = (index: number, patch: Partial<PriorBallotOutcome>) => {
    onChange({
      ...history,
      prior_ballot_outcomes: ballots.map((b, i) =>
        i === index ? { ...b, ...patch } : b
      ),
    });
  };

  const addBallot = () => {
    onChange({
      ...history,
      prior_ballot_outcomes: [
        ...ballots,
        { when: "", outcome: "", yes_pct: undefined, no_pct: undefined, notes: "" },
      ],
    });
  };

  const removeBallot = (index: number) => {
    onChange({
      ...history,
      prior_ballot_outcomes: ballots.filter((_, i) => i !== index),
    });
  };

  const updatePriorCampaign = (
    index: number,
    patch: Partial<PriorCampaignSummary>
  ) => {
    onChange({
      ...history,
      prior_campaigns: campaigns.map((c, i) =>
        i === index ? { ...c, ...patch } : c
      ),
    });
  };

  const removePriorCampaign = (index: number) => {
    onChange({
      ...history,
      prior_campaigns: campaigns.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        What&apos;s the workforce&apos;s history with this employer and the
        union? Prior agreements and OA campaigns at the same employers are
        auto-loaded — confirm or edit the outcome notes.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Prior EBA count (at this employer)</Label>
          <Input
            type="number"
            min={0}
            value={history.prior_eba_count ?? ""}
            onChange={(e) =>
              onChange({
                ...history,
                prior_eba_count: e.target.value
                  ? Math.max(0, Number(e.target.value))
                  : undefined,
              })
            }
            className="w-32"
          />
          {priorAgreements.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Auto-detected: {priorAgreements.length} agreement
              {priorAgreements.length === 1 ? "" : "s"} on file (
              {priorAgreements
                .slice(0, 3)
                .map((a) => a.name)
                .join(", ")}
              {priorAgreements.length > 3 ? "…" : ""}).
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Delegate structure</Label>
          <Input
            value={history.delegate_structure ?? ""}
            onChange={(e) =>
              onChange({ ...history, delegate_structure: e.target.value })
            }
            placeholder="e.g. 4 delegates, 1 HSR per crew"
          />
        </div>
      </div>

      {/* ── Prior ballot outcomes ──────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Prior ballot outcomes</Label>
          <Button variant="outline" size="sm" onClick={addBallot}>
            <Plus className="h-4 w-4 mr-2" />
            Add ballot
          </Button>
        </div>
        {ballots.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No ballot history recorded.
          </p>
        )}
        {ballots.map((b, index) => (
          <div
            key={index}
            className="rounded-md border bg-muted/20 p-3 space-y-3"
          >
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>When</Label>
                <Input
                  value={b.when ?? ""}
                  onChange={(e) => updateBallot(index, { when: e.target.value })}
                  placeholder="e.g. 2024-09 or Sept 2024"
                />
              </div>
              <div className="space-y-2">
                <Label>Yes %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={b.yes_pct ?? ""}
                  onChange={(e) =>
                    updateBallot(index, {
                      yes_pct: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>No %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={b.no_pct ?? ""}
                  onChange={(e) =>
                    updateBallot(index, {
                      no_pct: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Outcome / notes</Label>
              <Textarea
                rows={2}
                value={b.outcome ?? ""}
                onChange={(e) =>
                  updateBallot(index, { outcome: e.target.value })
                }
                placeholder="e.g. First proposed agreement rejected 89% no on 254-strong permanent crew"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeBallot(index)}
              className="text-muted-foreground"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove
            </Button>
          </div>
        ))}
      </div>

      {/* ── Prior campaigns at these employers ─────────────────────────── */}
      <div className="space-y-2">
        <Label>Prior campaigns at these employers</Label>
        {campaigns.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            None on file.
          </p>
        )}
        {campaigns.map((c, index) => (
          <div
            key={index}
            className="rounded-md border bg-muted/20 p-3 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {c.name || "Untitled campaign"}
              </span>
              {c.source_campaign_id != null && (
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  Linked
                </Badge>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Outcome</Label>
                <Input
                  value={c.outcome ?? ""}
                  onChange={(e) =>
                    updatePriorCampaign(index, { outcome: e.target.value })
                  }
                  placeholder="e.g. Won, lost, ongoing"
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  value={c.notes ?? ""}
                  onChange={(e) =>
                    updatePriorCampaign(index, { notes: e.target.value })
                  }
                />
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removePriorCampaign(index)}
              className="text-muted-foreground"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remove from this analysis
            </Button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label>Other notes (optional)</Label>
        <Textarea
          rows={2}
          value={history.notes ?? ""}
          onChange={(e) => onChange({ ...history, notes: e.target.value })}
          placeholder="History of unionisation on this site / employer beyond the structured items above."
        />
      </div>
    </div>
  );
}
