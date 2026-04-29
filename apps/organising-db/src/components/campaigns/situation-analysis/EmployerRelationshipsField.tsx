"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Sparkles } from "lucide-react";
import {
  EMPLOYER_RELATIONSHIP_TYPES,
  type EmployerRelationshipType,
} from "@/lib/situation-analysis/constants";
import type { EmployerRelationshipEntry } from "@/lib/situation-analysis/types";

interface EmployerRelationshipsFieldProps {
  campaignEmployerIds: number[];
  relationships: EmployerRelationshipEntry[];
  onChange: (next: EmployerRelationshipEntry[]) => void;
}

interface EmployerRow {
  employer_id: number;
  name: string;
  parent_employer_id: number | null;
}

function newDraftId(): string {
  return `draft_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Auto-populates parent/child relationships for the campaign's employers
 * (using `employers.parent_employer_id`) and lets the organiser add tier-one
 * client / sister-site / peer rows by hand.
 */
export function EmployerRelationshipsField({
  campaignEmployerIds,
  relationships,
  onChange,
}: EmployerRelationshipsFieldProps) {
  const supabase = createClient();

  // Load the campaign's employers + any related parent rows so we can
  // suggest parent/child relationships automatically.
  const { data: employerGraph = { campaignEmployers: [], parents: [] } } =
    useQuery<{ campaignEmployers: EmployerRow[]; parents: EmployerRow[] }>({
      queryKey: ["situation-analysis-employer-graph", campaignEmployerIds],
      queryFn: async () => {
        if (campaignEmployerIds.length === 0)
          return { campaignEmployers: [], parents: [] };
        const { data: campaignEmployers } = await supabase
          .from("employers")
          .select("employer_id, name, parent_employer_id")
          .in("employer_id", campaignEmployerIds);
        const parentIds = (campaignEmployers ?? [])
          .map((e) => e.parent_employer_id)
          .filter((id): id is number => id != null);
        const uniqueParentIds = Array.from(new Set(parentIds)).filter(
          (id) => !campaignEmployerIds.includes(id)
        );
        if (uniqueParentIds.length === 0) {
          return {
            campaignEmployers: (campaignEmployers ?? []) as EmployerRow[],
            parents: [],
          };
        }
        const { data: parents } = await supabase
          .from("employers")
          .select("employer_id, name, parent_employer_id")
          .in("employer_id", uniqueParentIds);
        return {
          campaignEmployers: (campaignEmployers ?? []) as EmployerRow[],
          parents: (parents ?? []) as EmployerRow[],
        };
      },
      enabled: campaignEmployerIds.length > 0,
    });

  // Build the suggested auto-populated rows: each campaign employer that has
  // a parent, plus each parent linked to its children (so the organiser sees
  // both directions).
  const suggested = useMemo<EmployerRelationshipEntry[]>(() => {
    const out: EmployerRelationshipEntry[] = [];
    const parentLookup = new Map(
      employerGraph.parents.map((p) => [p.employer_id, p])
    );
    for (const employer of employerGraph.campaignEmployers) {
      if (employer.parent_employer_id != null) {
        const parent = parentLookup.get(employer.parent_employer_id);
        if (parent) {
          out.push({
            related_employer_id: parent.employer_id,
            related_employer_name: parent.name,
            relationship_type: "parent_company",
            recent_behaviour: "",
            notes: `Parent company of ${employer.name} (auto-populated from employer hierarchy).`,
            auto_populated: true,
          });
        }
      }
    }
    return out;
  }, [employerGraph]);

  // On first load, merge the suggested rows in if they are not already
  // represented (by related_employer_id + relationship_type).
  useEffect(() => {
    if (suggested.length === 0) return;
    const existingKeys = new Set(
      relationships
        .filter((r) => r.related_employer_id != null)
        .map((r) => `${r.related_employer_id}:${r.relationship_type}`)
    );
    const additions = suggested.filter(
      (s) => !existingKeys.has(`${s.related_employer_id}:${s.relationship_type}`)
    );
    if (additions.length > 0) {
      onChange([
        ...relationships,
        ...additions.map((a) => ({ ...a, draft_id: newDraftId() })),
      ]);
    }
    // We only want to react to suggested changes — relationships changes are
    // intentionally not in the dep list to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested]);

  const updateAt = (
    index: number,
    patch: Partial<EmployerRelationshipEntry>
  ) => {
    onChange(
      relationships.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  };

  const removeAt = (index: number) => {
    onChange(relationships.filter((_, i) => i !== index));
  };

  const addRow = () => {
    onChange([
      ...relationships,
      {
        draft_id: newDraftId(),
        related_employer_id: null,
        related_employer_name: "",
        relationship_type: "tier_one_client",
        recent_behaviour: "",
        notes: "",
      },
    ]);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        How does this employer sit in the wider sector? Tier-one client
        behaviour in recent contractor campaigns is particularly important —
        it shapes what the employer thinks they can get away with.
      </p>

      {relationships.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No relationships recorded.
        </p>
      )}

      {relationships.map((rel, index) => (
        <div
          key={rel.draft_id ?? index}
          className="rounded-md border bg-muted/20 p-3 space-y-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {rel.related_employer_name || "Untitled relationship"}
              </span>
              {rel.auto_populated && (
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  Auto-detected
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeAt(index)}
              aria-label="Remove relationship"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Related employer / entity</Label>
              <Input
                value={rel.related_employer_name}
                onChange={(e) =>
                  updateAt(index, {
                    related_employer_name: e.target.value,
                    auto_populated: false,
                  })
                }
                placeholder="Name of the employer or client"
              />
            </div>
            <div className="space-y-2">
              <Label>Relationship</Label>
              <Select
                value={rel.relationship_type}
                onValueChange={(v) =>
                  updateAt(index, {
                    relationship_type: v as EmployerRelationshipType,
                    auto_populated: false,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYER_RELATIONSHIP_TYPES.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Recent behaviour (optional)</Label>
            <Textarea
              rows={2}
              value={rel.recent_behaviour ?? ""}
              onChange={(e) =>
                updateAt(index, {
                  recent_behaviour: e.target.value,
                  auto_populated: false,
                })
              }
              placeholder="How have they behaved in recent contractor campaigns / sister-site bargaining?"
            />
          </div>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addRow}>
        <Plus className="h-4 w-4 mr-2" />
        Add relationship
      </Button>
    </div>
  );
}
