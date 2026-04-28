"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Target } from "lucide-react";
import type { CampaignAmbitionCategory } from "@/types/database";
import { isWorkerMemberLike } from "@/lib/campaign/constants";

export interface CampaignAmbitionDraft {
  draft_id: string;
  /** Server id once saved. null for newly added rows. */
  campaign_ambition_id: number | null;
  category: CampaignAmbitionCategory;
  subcategory: string | null;
  label: string;
  target_value: string;
  target_value_max: string;
  target_unit: string;
  target_date: string;
  notes: string;
}

interface StepCampaignAmbitionsProps {
  campaignId: number;
  ambitions: CampaignAmbitionDraft[];
  setAmbitions: (next: CampaignAmbitionDraft[]) => void;
  isPending: boolean;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
}

interface CategoryTemplate {
  subcategory: string;
  label: string;
  default_unit: string;
  hint: string;
}

const CATEGORY_LABELS: Record<CampaignAmbitionCategory, string> = {
  membership: "Membership",
  member_leaders: "Member leaders",
  activism: "Activism",
  industrial_outcomes: "Industrial outcomes",
};

const CATEGORY_DESCRIPTIONS: Record<CampaignAmbitionCategory, string> = {
  membership:
    "How big do you want the union to be in this campaign? Density % or hard member count.",
  member_leaders:
    "How many leaders of each kind do you want to develop or recruit?",
  activism:
    "How much active participation are you aiming for from members?",
  industrial_outcomes:
    "What concrete bargaining outcomes do you want to land?",
};

const CATEGORY_TEMPLATES: Record<CampaignAmbitionCategory, CategoryTemplate[]> = {
  membership: [
    {
      subcategory: "density",
      label: "Membership density",
      default_unit: "%",
      hint: "Members as a share of workers in scope",
    },
    {
      subcategory: "members",
      label: "Member count",
      default_unit: "members",
      hint: "Total members across the campaign",
    },
  ],
  member_leaders: [
    {
      subcategory: "contacts",
      label: "Contacts",
      default_unit: "people",
      hint: "Identified contacts with reliable comms details",
    },
    {
      subcategory: "activists",
      label: "Activists",
      default_unit: "people",
      hint: "Members willing to take action",
    },
    {
      subcategory: "delegates",
      label: "Delegates",
      default_unit: "people",
      hint: "Elected union representatives",
    },
    {
      subcategory: "bargaining_reps",
      label: "Bargaining reps",
      default_unit: "people",
      hint: "Workers representing the campaign at the bargaining table",
    },
    {
      subcategory: "hsrs",
      label: "HSRs",
      default_unit: "people",
      hint: "Health & Safety Representatives",
    },
  ],
  activism: [
    {
      subcategory: "supportive_participation",
      label: "Supportive participation",
      default_unit: "%",
      hint: "Share of members who actively participate in actions",
    },
    {
      subcategory: "action_count",
      label: "Actions taken",
      default_unit: "actions",
      hint: "Number of mobilisation actions planned",
    },
  ],
  industrial_outcomes: [
    {
      subcategory: "pay_rise",
      label: "Pay rise",
      default_unit: "%",
      hint: "Annualised increase target",
    },
    {
      subcategory: "benchmark",
      label: "Benchmark / industry parity",
      default_unit: "",
      hint: "Free-form description of the benchmark you want to hit or beat",
    },
  ],
};

const CATEGORY_ORDER: CampaignAmbitionCategory[] = [
  "membership",
  "member_leaders",
  "activism",
  "industrial_outcomes",
];

function newDraftId(): string {
  return `draft_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeWorkerRel<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function pctOf(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

export function StepCampaignAmbitions({
  campaignId,
  ambitions,
  setAmbitions,
  isPending,
  onBack,
  onContinue,
  onSkip,
}: StepCampaignAmbitionsProps) {
  const supabase = createClient();

  const [pendingByCategory, setPendingByCategory] = useState<
    Record<CampaignAmbitionCategory, string>
  >({
    membership: "",
    member_leaders: "",
    activism: "",
    industrial_outcomes: "",
  });

  // ── Current situation baseline ─────────────────────────────────────────────
  // Fetch membership & leadership data for workers already on this campaign.
  const { data: memberRows = [] } = useQuery({
    queryKey: ["step-ambitions-members", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_membership")
        .select(
          `worker_id, worker:workers(
            worker_id, is_hsr, is_bargaining_rep,
            member_role_type:member_role_types(role_name),
            union_membership_type:union_membership_types(type_name)
          )`
        )
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        worker_id: number;
        worker: {
          worker_id: number;
          is_hsr: boolean | null;
          is_bargaining_rep: boolean | null;
          member_role_type: { role_name: string } | { role_name: string }[] | null;
          union_membership_type: { type_name: string } | { type_name: string }[] | null;
        } | null;
      }>;
    },
    enabled: !!campaignId,
    staleTime: 30_000,
  });

  // Fetch assessment ratings to compute activism baseline.
  const { data: ratingRows = [] } = useQuery({
    queryKey: ["step-ambitions-ratings", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_worker_rating_summary")
        .select("worker_id, has_supportive_activity_rating")
        .eq("campaign_id", campaignId);
      if (error) throw error;
      return (data ?? []) as Array<{
        worker_id: number;
        has_supportive_activity_rating: boolean | null;
      }>;
    },
    enabled: !!campaignId,
    staleTime: 30_000,
  });

  const baseline = useMemo(() => {
    const total = memberRows.length;
    let members = 0;
    let delegates = 0;
    let activists = 0;
    let contacts = 0;
    let hsrs = 0;
    let bargainingReps = 0;

    for (const row of memberRows) {
      const w = normalizeWorkerRel(row.worker);
      if (!w) continue;
      const mt = normalizeWorkerRel(w.member_role_type);
      const um = normalizeWorkerRel(w.union_membership_type);
      const roleName = (mt as { role_name?: string } | null)?.role_name ?? null;
      const typeName = (um as { type_name?: string } | null)?.type_name ?? null;

      if (isWorkerMemberLike({ unionMembershipTypeName: typeName, memberRoleName: roleName, isBargainingRep: w.is_bargaining_rep })) {
        members++;
      }
      if (roleName === "delegate") delegates++;
      else if (roleName === "activist" || roleName === "Activist") activists++;
      else if (roleName === "contact") contacts++;
      if (w.is_hsr) hsrs++;
      if (w.is_bargaining_rep) bargainingReps++;
    }

    const leadersTotal = delegates + activists + contacts + hsrs + bargainingReps;
    const supportiveRatings = ratingRows.filter((r) => r.has_supportive_activity_rating).length;

    return { total, members, delegates, activists, contacts, hsrs, bargainingReps, leadersTotal, supportiveRatings };
  }, [memberRows, ratingRows]);

  const grouped = useMemo(() => {
    const map: Record<CampaignAmbitionCategory, CampaignAmbitionDraft[]> = {
      membership: [],
      member_leaders: [],
      activism: [],
      industrial_outcomes: [],
    };
    for (const a of ambitions) {
      map[a.category].push(a);
    }
    return map;
  }, [ambitions]);

  function addAmbition(category: CampaignAmbitionCategory, templateKey: string) {
    if (!templateKey) return;
    const tpl =
      templateKey === "__custom__"
        ? null
        : CATEGORY_TEMPLATES[category].find((t) => t.subcategory === templateKey);

    if (templateKey !== "__custom__" && !tpl) return;
    if (
      tpl &&
      ambitions.some(
        (a) => a.category === category && a.subcategory === tpl.subcategory
      )
    ) {
      return; // No duplicates of same template within one category.
    }

    setAmbitions([
      ...ambitions,
      {
        draft_id: newDraftId(),
        campaign_ambition_id: null,
        category,
        subcategory: tpl ? tpl.subcategory : "custom",
        label: tpl ? tpl.label : "",
        target_value: "",
        target_value_max: "",
        target_unit: tpl ? tpl.default_unit : "",
        target_date: "",
        notes: "",
      },
    ]);
    setPendingByCategory((prev) => ({ ...prev, [category]: "" }));
  }

  function updateAmbition(draftId: string, partial: Partial<CampaignAmbitionDraft>) {
    setAmbitions(
      ambitions.map((a) =>
        a.draft_id === draftId ? { ...a, ...partial } : a
      )
    );
  }

  function removeAmbition(draftId: string) {
    setAmbitions(ambitions.filter((a) => a.draft_id !== draftId));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campaign ambitions</CardTitle>
        <CardDescription>
          Set the high-level goals for this campaign. These campaign-wide ambitions
          frame the stage planning that follows — every stage ambition can optionally
          link back to one of these so progress rolls up to a single picture. Skip any
          category that doesn&apos;t apply.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {CATEGORY_ORDER.map((category) => {
          const items = grouped[category];
          const templates = CATEGORY_TEMPLATES[category];
          const pendingValue = pendingByCategory[category] ?? "";
          const usedSubcats = new Set(items.map((i) => i.subcategory ?? ""));

          return (
            <section key={category} className="space-y-2">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{CATEGORY_LABELS[category]}</h3>
                <Badge variant="outline" className="text-[10px] h-4 px-1">
                  {items.length}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {CATEGORY_DESCRIPTIONS[category]}
              </p>

              {/* Current situation baseline — shown for categories with measurable data */}
              {category === "membership" && baseline.total > 0 && (
                <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Starting point: </span>
                  <span>
                    {baseline.members} member{baseline.members !== 1 ? "s" : ""}{" "}
                    ({pctOf(baseline.members, baseline.total)} of {baseline.total} named workers)
                  </span>
                </div>
              )}
              {category === "member_leaders" && baseline.total > 0 && (
                <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                  <div>
                    <span className="font-semibold text-foreground">Starting point: </span>
                    <span>
                      {baseline.leadersTotal} leader{baseline.leadersTotal !== 1 ? "s" : ""}{" "}
                      ({pctOf(baseline.leadersTotal, baseline.total)} of {baseline.total})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 pl-1">
                    {[
                      { label: "Delegates", value: baseline.delegates },
                      { label: "Activists", value: baseline.activists },
                      { label: "Contacts", value: baseline.contacts },
                      { label: "HSRs", value: baseline.hsrs },
                      { label: "Bargaining reps", value: baseline.bargainingReps },
                    ].map(({ label, value }) => (
                      <span key={label}>
                        <span className="text-foreground font-medium">{value}</span> {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {category === "activism" && (
                <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Starting point: </span>
                  <span>
                    {baseline.supportiveRatings} worker{baseline.supportiveRatings !== 1 ? "s" : ""} with supportive activity ratings
                    {baseline.supportiveRatings === 0 && baseline.total > 0 && (
                      <span className="ml-1 italic">
                        — assessments are recorded during the campaign as organisers make contact.
                      </span>
                    )}
                  </span>
                </div>
              )}

              {items.length > 0 && (
                <div className="space-y-2">
                  {items.map((a) => (
                    <div
                      key={a.draft_id}
                      className="rounded-md border p-3 space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-1">
                          <Input
                            value={a.label}
                            onChange={(e) =>
                              updateAmbition(a.draft_id, { label: e.target.value })
                            }
                            className="text-sm font-medium"
                            placeholder="Ambition label"
                          />
                          {a.subcategory && a.subcategory !== "custom" && (
                            <p className="text-[10px] text-muted-foreground">
                              {a.subcategory}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAmbition(a.draft_id)}
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          title="Remove ambition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid sm:grid-cols-[1fr_120px_120px] gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Target</Label>
                          <Input
                            value={a.target_value}
                            onChange={(e) =>
                              updateAmbition(a.draft_id, {
                                target_value: e.target.value,
                              })
                            }
                            placeholder="e.g. 60"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Unit</Label>
                          <Input
                            value={a.target_unit}
                            onChange={(e) =>
                              updateAmbition(a.draft_id, {
                                target_unit: e.target.value,
                              })
                            }
                            placeholder="%, count, …"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">By date</Label>
                          <Input
                            type="date"
                            value={a.target_date}
                            onChange={(e) =>
                              updateAmbition(a.draft_id, {
                                target_date: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>

                      <Textarea
                        rows={2}
                        value={a.notes}
                        onChange={(e) =>
                          updateAmbition(a.draft_id, { notes: e.target.value })
                        }
                        placeholder="Notes (why this matters, how it'll be measured…)"
                        className="text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Add another row */}
              <div className="flex items-center gap-2">
                <Select
                  value={pendingValue}
                  onValueChange={(v) =>
                    setPendingByCategory((prev) => ({ ...prev, [category]: v }))
                  }
                >
                  <SelectTrigger className="flex-1 h-9">
                    <SelectValue placeholder={`Add ${CATEGORY_LABELS[category].toLowerCase()} ambition…`} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates
                      .filter((t) => !usedSubcats.has(t.subcategory))
                      .map((t) => (
                        <SelectItem key={t.subcategory} value={t.subcategory}>
                          {t.label}{" "}
                          <span className="text-muted-foreground text-xs">
                            — {t.hint}
                          </span>
                        </SelectItem>
                      ))}
                    <SelectItem value="__custom__">Custom ambition…</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!pendingValue}
                  onClick={() => addAmbition(category, pendingValue)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>
            </section>
          );
        })}

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" onClick={onBack} disabled={isPending}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onSkip} disabled={isPending}>
              Skip for now
            </Button>
            <Button onClick={onContinue} disabled={isPending}>
              {isPending ? "Saving…" : "Continue"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
