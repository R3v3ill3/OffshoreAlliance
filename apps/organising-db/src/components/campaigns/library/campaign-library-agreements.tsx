"use client";

/**
 * CampaignLibraryAgreements
 *
 * Self-contained agreement management for the Library tab.
 * Lifts the same query + mutation logic that was previously in
 * campaign-settings.tsx (Agreements section) into a standalone
 * component that owns its own state.
 *
 * Props: { campaignId, canWrite }
 */

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { useAuthAwareMutation, withSessionGuard } from "@/lib/hooks/useAuthAwareMutation";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import {
  StepAgreements,
  type CampaignAgreementSelection,
} from "@/components/campaigns/step-agreements";

interface Props {
  campaignId: number;
  canWrite: boolean;
}

export function CampaignLibraryAgreements({ campaignId, canWrite }: Props) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const hydratedFor = useRef<number | null>(null);

  const [selections, setSelections] = useState<CampaignAgreementSelection[]>([]);
  // StepAgreements needs the linked employer / worksite context to filter its
  // agreement picker. Load them from campaign_employers / campaign_worksites.
  const [employerIds, setEmployerIds] = useState<number[]>([]);
  const [worksiteIds, setWorksiteIds] = useState<number[]>([]);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: scopeData, isLoading } = useQuery({
    queryKey: ["library-agreements-scope", campaignId],
    queryFn: async () => {
      const [ce, cw, ca] = await Promise.all([
        supabase
          .from("campaign_employers")
          .select("employer_id")
          .eq("campaign_id", campaignId),
        supabase
          .from("campaign_worksites")
          .select("worksite_id")
          .eq("campaign_id", campaignId),
        supabase
          .from("campaign_agreements")
          .select("agreement_id, relationship_type, is_primary, sort_order")
          .eq("campaign_id", campaignId)
          .order("sort_order", { ascending: true }),
      ]);
      return {
        employers: (ce.data ?? []).map((r) => r.employer_id),
        worksites: (cw.data ?? [])
          .filter((r) => r.worksite_id != null)
          .map((r) => r.worksite_id as number),
        agreements: (ca.data ?? []) as Array<{
          agreement_id: number;
          relationship_type: string;
          is_primary: boolean;
          sort_order: number;
        }>,
      };
    },
    enabled: !!user && !!campaignId,
  });

  // ── One-shot hydration ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!scopeData || hydratedFor.current === campaignId) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setEmployerIds(scopeData.employers);
    setWorksiteIds(scopeData.worksites);
    setSelections(
      scopeData.agreements.map((r) => ({
        agreement_id: r.agreement_id,
        relationship_type:
          r.relationship_type as CampaignAgreementSelection["relationship_type"],
        is_primary: r.is_primary,
      }))
    );
    /* eslint-enable react-hooks/set-state-in-effect */
    hydratedFor.current = campaignId;
  }, [scopeData, campaignId]);

  // ── Save mutation ──────────────────────────────────────────────────────────

  const saveMutation = useAuthAwareMutation({
    mutationFn: async () => {
      await withSessionGuard("library:saveAgreements", async () => {
        await supabase
          .from("campaign_agreements")
          .delete()
          .eq("campaign_id", campaignId);
        if (selections.length === 0) return;
        const rows = selections.map((s, i) => ({
          campaign_id: campaignId,
          agreement_id: s.agreement_id,
          relationship_type: s.relationship_type,
          is_primary: s.is_primary,
          sort_order: i,
        }));
        const { error } = await supabase
          .from("campaign_agreements")
          .insert(rows);
        if (error) throw error;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["library-agreements-scope", campaignId],
      });
      queryClient.invalidateQueries({ queryKey: ["campaign", String(campaignId)] });
      // Invalidate settings scope too, so Settings page stays consistent.
      queryClient.invalidateQueries({
        queryKey: ["campaign-settings-scope", campaignId],
      });
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <EurekaLoadingSpinner />
      </div>
    );
  }

  if (!canWrite) {
    // Read-only view: just list attached agreements with their relationship type.
    if (selections.length === 0) {
      return (
        <p className="text-sm text-muted-foreground text-center py-12">
          No agreements linked to this campaign.
        </p>
      );
    }
    return (
      <ul className="space-y-2">
        {selections.map((s) => (
          <li
            key={s.agreement_id}
            className="rounded-md border px-4 py-3 text-sm"
          >
            Agreement #{s.agreement_id} —{" "}
            <span className="font-medium capitalize">
              {s.relationship_type}
            </span>
            {s.is_primary && (
              <span className="ml-2 text-xs text-muted-foreground">(primary)</span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-4">
      <StepAgreements
        selectedEmployers={employerIds}
        selectedWorksites={worksiteIds}
        selections={selections}
        setSelections={setSelections}
        isPending={saveMutation.isPending}
        onBack={() => undefined}
        onContinue={() => saveMutation.mutate()}
      />
      <div className="flex justify-end pt-2">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          <Save className="h-4 w-4 mr-1" />
          {saveMutation.isPending ? "Saving…" : "Save agreements"}
        </Button>
      </div>
    </div>
  );
}
