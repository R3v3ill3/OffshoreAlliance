"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Search, X, Star, StarOff } from "lucide-react";
import type { CampaignAgreementRelationshipType } from "@/types/database";

interface AgreementOption {
  agreement_id: number;
  agreement_name: string;
  short_name: string | null;
  status: string | null;
  expiry_date: string | null;
  employer_name: string | null;
  linked_employer_ids: number[];
  linked_worksite_ids: number[];
}

export interface CampaignAgreementSelection {
  agreement_id: number;
  relationship_type: CampaignAgreementRelationshipType;
  is_primary: boolean;
}

interface StepAgreementsProps {
  selectedEmployers: number[];
  selectedWorksites: number[];
  selections: CampaignAgreementSelection[];
  setSelections: (next: CampaignAgreementSelection[]) => void;
  isPending: boolean;
  onBack: () => void;
  onContinue: () => void;
}

const RELATIONSHIP_LABELS: Record<CampaignAgreementRelationshipType, string> = {
  replaced: "Replaced (existing EA being superseded)",
  new: "New (EA being created/negotiated)",
  related: "Related (in scope but not central)",
};

const RELATIONSHIP_ORDER: CampaignAgreementRelationshipType[] = [
  "replaced",
  "new",
  "related",
];

export function StepAgreements({
  selectedEmployers,
  selectedWorksites,
  selections,
  setSelections,
  isPending,
  onBack,
  onContinue,
}: StepAgreementsProps) {
  const supabase = createClient();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newAgreementName, setNewAgreementName] = useState("");
  const [newAgreementRel, setNewAgreementRel] =
    useState<CampaignAgreementRelationshipType>("related");

  const { data: agreements = [], isLoading } = useQuery<AgreementOption[]>({
    queryKey: ["campaign-wizard-agreements", selectedEmployers, selectedWorksites],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select(
          `agreement_id, agreement_name, short_name, status, expiry_date,
           employer:employers!agreements_employer_id_fkey(employer_name),
           agreement_employers(employer_id),
           agreement_worksites(worksite_id)`
        )
        .order("agreement_name");
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => {
        const emp = row.employer as { employer_name: string } | null;
        const ae = (row.agreement_employers as Array<{ employer_id: number }> | null) ?? [];
        const aw = (row.agreement_worksites as Array<{ worksite_id: number }> | null) ?? [];
        return {
          agreement_id: row.agreement_id as number,
          agreement_name: row.agreement_name as string,
          short_name: (row.short_name as string | null) ?? null,
          status: (row.status as string | null) ?? null,
          expiry_date: (row.expiry_date as string | null) ?? null,
          employer_name: emp?.employer_name ?? null,
          linked_employer_ids: ae.map((r) => r.employer_id),
          linked_worksite_ids: aw.map((r) => r.worksite_id),
        } satisfies AgreementOption;
      });
    },
    enabled: !!user,
  });

  const createAgreementMutation = useAuthAwareMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .insert({
          agreement_name: newAgreementName.trim(),
          status: newAgreementRel === "replaced" ? "Expired" : "Under_Negotiation",
        })
        .select("agreement_id")
        .single();
      if (error) throw error;
      return data.agreement_id as number;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["campaign-wizard-agreements"] });
      const isFirst = !selections.some((s) => s.relationship_type === newAgreementRel);
      setSelections([
        ...selections,
        {
          agreement_id: id,
          relationship_type: newAgreementRel,
          is_primary: isFirst,
        },
      ]);
      setAddDialogOpen(false);
      setNewAgreementName("");
      setNewAgreementRel("related");
    },
  });

  const selectedIds = useMemo(
    () => new Set(selections.map((s) => s.agreement_id)),
    [selections]
  );

  // Surface agreements linked to the campaign's employers/worksites first.
  const orderedAgreements = useMemo(() => {
    const empSet = new Set(selectedEmployers);
    const wsSet = new Set(selectedWorksites);
    const score = (a: AgreementOption) => {
      let s = 0;
      if (a.linked_employer_ids.some((id) => empSet.has(id))) s += 2;
      if (a.linked_worksite_ids.some((id) => wsSet.has(id))) s += 1;
      return s;
    };
    return [...agreements].sort((a, b) => {
      const ds = score(b) - score(a);
      if (ds !== 0) return ds;
      return a.agreement_name.localeCompare(b.agreement_name);
    });
  }, [agreements, selectedEmployers, selectedWorksites]);

  const filtered = orderedAgreements.filter((a) => {
    if (selectedIds.has(a.agreement_id)) return false;
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      a.agreement_name.toLowerCase().includes(term) ||
      (a.short_name ?? "").toLowerCase().includes(term) ||
      (a.employer_name ?? "").toLowerCase().includes(term)
    );
  });

  function add(agreementId: number) {
    if (selectedIds.has(agreementId)) return;
    const isFirst = selections.length === 0;
    setSelections([
      ...selections,
      {
        agreement_id: agreementId,
        relationship_type: "related",
        is_primary: isFirst,
      },
    ]);
    setSearch("");
  }

  function remove(agreementId: number) {
    setSelections(selections.filter((s) => s.agreement_id !== agreementId));
  }

  function setPrimary(agreementId: number, rel: CampaignAgreementRelationshipType) {
    setSelections(
      selections.map((s) => {
        if (s.relationship_type !== rel) return s;
        return { ...s, is_primary: s.agreement_id === agreementId };
      })
    );
  }

  function relationshipChange(
    agreementId: number,
    nextRel: CampaignAgreementRelationshipType
  ) {
    // When changing role, clear primary on the new role bucket if another exists.
    const otherPrimaryInBucket = selections.find(
      (s) =>
        s.agreement_id !== agreementId &&
        s.relationship_type === nextRel &&
        s.is_primary
    );
    setSelections(
      selections.map((s) =>
        s.agreement_id === agreementId
          ? { ...s, relationship_type: nextRel, is_primary: !otherPrimaryInBucket }
          : s
      )
    );
  }

  const groupedSelections = useMemo(() => {
    const groups: Record<CampaignAgreementRelationshipType, CampaignAgreementSelection[]> = {
      replaced: [],
      new: [],
      related: [],
    };
    for (const s of selections) {
      groups[s.relationship_type].push(s);
    }
    return groups;
  }, [selections]);

  const detailMap = useMemo(() => {
    const m = new Map<number, AgreementOption>();
    for (const a of agreements) m.set(a.agreement_id, a);
    return m;
  }, [agreements]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attach enterprise agreements</CardTitle>
        <CardDescription>
          Link any enterprise agreements that apply to this campaign. You can attach more than
          one — for example, a campaign covering two employers might replace an existing EA at
          one and create a new EA at another. Mark which agreement is primary in each role.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Selected groups */}
        {selections.length > 0 && (
          <div className="space-y-4">
            {RELATIONSHIP_ORDER.map((rel) => {
              const items = groupedSelections[rel];
              if (items.length === 0) return null;
              return (
                <div key={rel} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold">{RELATIONSHIP_LABELS[rel]}</Label>
                    <Badge variant="outline" className="text-xs">
                      {items.length}
                    </Badge>
                  </div>
                  <div className="rounded-md border divide-y">
                    {items.map((sel) => {
                      const agreement = detailMap.get(sel.agreement_id);
                      return (
                        <div
                          key={sel.agreement_id}
                          className="flex items-center gap-2 p-3"
                        >
                          <button
                            type="button"
                            onClick={() => setPrimary(sel.agreement_id, sel.relationship_type)}
                            className="text-amber-500 hover:text-amber-600 shrink-0"
                            title={
                              sel.is_primary
                                ? "Primary for this role"
                                : "Mark as primary for this role"
                            }
                          >
                            {sel.is_primary ? (
                              <Star className="h-4 w-4 fill-current" />
                            ) : (
                              <StarOff className="h-4 w-4" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {agreement?.agreement_name ?? `Agreement #${sel.agreement_id}`}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {agreement?.employer_name ?? "—"}
                              {agreement?.expiry_date &&
                                ` · expires ${agreement.expiry_date.slice(0, 10)}`}
                            </p>
                          </div>
                          <Select
                            value={sel.relationship_type}
                            onValueChange={(v) =>
                              relationshipChange(
                                sel.agreement_id,
                                v as CampaignAgreementRelationshipType
                              )
                            }
                          >
                            <SelectTrigger className="w-32 text-xs h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RELATIONSHIP_ORDER.map((r) => (
                                <SelectItem key={r} value={r} className="text-xs">
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {agreement?.status && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              {agreement.status}
                            </Badge>
                          )}
                          <button
                            type="button"
                            onClick={() => remove(sel.agreement_id)}
                            className="text-muted-foreground hover:text-foreground shrink-0"
                            title="Remove"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selections.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No agreements attached yet. You can continue without one, or pick from the list below.
          </div>
        )}

        {/* Picker */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Add an agreement</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 text-sm"
              placeholder="Search by agreement name or employer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-md border p-1 space-y-0.5">
            {isLoading && (
              <p className="text-sm text-muted-foreground px-2 py-3 text-center">
                Loading agreements…
              </p>
            )}
            {!isLoading && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground px-2 py-3 text-center">
                No matching agreements.
              </p>
            )}
            {filtered.slice(0, 50).map((a) => {
              const empMatch = a.linked_employer_ids.some((id) =>
                selectedEmployers.includes(id)
              );
              const wsMatch = a.linked_worksite_ids.some((id) =>
                selectedWorksites.includes(id)
              );
              return (
                <button
                  key={a.agreement_id}
                  type="button"
                  className="w-full text-left rounded px-2 py-1.5 hover:bg-muted transition-colors"
                  onClick={() => add(a.agreement_id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{a.agreement_name}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      {(empMatch || wsMatch) && (
                        <Badge variant="default" className="text-xs h-4 px-1">
                          Linked
                        </Badge>
                      )}
                      {a.status && (
                        <Badge variant="outline" className="text-xs h-4 px-1">
                          {a.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {a.employer_name && (
                    <p className="text-xs text-muted-foreground truncate">
                      {a.employer_name}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Create new agreement
          </Button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" onClick={onBack} disabled={isPending}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Button onClick={onContinue} disabled={isPending}>
            {isPending ? "Saving…" : "Continue"}
          </Button>
        </div>

        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create new agreement</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Agreement name</Label>
                <Input
                  placeholder="e.g. Acme Offshore Operations Enterprise Agreement 2026"
                  value={newAgreementName}
                  onChange={(e) => setNewAgreementName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Role on this campaign</Label>
                <Select
                  value={newAgreementRel}
                  onValueChange={(v) =>
                    setNewAgreementRel(v as CampaignAgreementRelationshipType)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_ORDER.map((r) => (
                      <SelectItem key={r} value={r}>
                        {RELATIONSHIP_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                A basic record will be created and attached to this campaign. You can fill in
                more agreement details (decision number, expiry date, employer link) from the
                Agreements page.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={
                  !newAgreementName.trim() || createAgreementMutation.isPending
                }
                onClick={() => createAgreementMutation.mutate()}
              >
                {createAgreementMutation.isPending ? "Creating…" : "Create & attach"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
