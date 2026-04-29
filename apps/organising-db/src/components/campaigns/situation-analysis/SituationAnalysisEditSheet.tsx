"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, Save, Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SurveyPanel } from "./SurveyPanel";
import { AiAssistPanel } from "./AiAssistPanel";
import { AiChatPanel } from "./AiChatPanel";
import {
  emptySituationAnalysisDraft,
  isSituationAnalysisComplete,
  type SituationAnalysisDraft,
} from "@/lib/situation-analysis/types";
import {
  useAuthAwareMutation,
  withSessionGuard,
} from "@/lib/hooks/useAuthAwareMutation";

interface SituationAnalysisEditSheetProps {
  campaignId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Inline sheet editor for the campaign situation analysis. Renders the full
 * survey + AI assist panels without navigating away to the campaign wizard.
 * Used from the campaign detail Overview tab so organisers can update the
 * situation analysis in context while the rest of the campaign is visible.
 *
 * Saves via the same upsert logic as the wizard's
 * `saveSituationAnalysisMutation` and invalidates the shared react-query
 * key `["campaign-situation-analysis", campaignId]`.
 */
export function SituationAnalysisEditSheet({
  campaignId,
  open,
  onOpenChange,
}: SituationAnalysisEditSheetProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<SituationAnalysisDraft>(() =>
    emptySituationAnalysisDraft()
  );

  // Load the campaign's employer IDs so SurveyPanel can auto-populate
  // parent/child employer relationships and prior campaigns.
  const { data: campaignEmployerIds = [] } = useQuery<number[]>({
    queryKey: ["situation-edit-sheet-employers", campaignId],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaign_employers")
        .select("employer_id")
        .eq("campaign_id", campaignId);
      return (data ?? []).map((r: { employer_id: number }) => r.employer_id);
    },
    enabled: open && !!campaignId,
  });

  // Load the existing situation analysis row to pre-populate the draft.
  const { data: existing, isLoading: existingLoading } = useQuery({
    queryKey: ["campaign-situation-analysis-edit-load", campaignId],
    queryFn: async (): Promise<SituationAnalysisDraft | null> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("campaign_situation_analyses")
          .select(
            "situation_id, employer_interaction_state, employer_state_notes, balloted_count, top_issues, upcoming_workforce_changes, employer_relationships, hr_posture, union_history, strategic_context_summary, company_playbook, workforce_populations, leverage_and_maths, information_gaps"
          )
          .eq("campaign_id", campaignId)
          .eq("is_current", true)
          .maybeSingle();
        if (error || !data) return null;
        const row = data as Record<string, unknown>;
        return {
          situation_id: (row.situation_id as number) ?? null,
          employer_interaction_state:
            (row.employer_interaction_state as SituationAnalysisDraft["employer_interaction_state"]) ??
            null,
          employer_state_notes:
            (row.employer_state_notes as string | null) ?? "",
          balloted_count: (row.balloted_count as number | null) ?? null,
          top_issues:
            (row.top_issues as SituationAnalysisDraft["top_issues"]) ?? [],
          upcoming_workforce_changes:
            (row.upcoming_workforce_changes as SituationAnalysisDraft["upcoming_workforce_changes"]) ??
            [],
          employer_relationships:
            (row.employer_relationships as SituationAnalysisDraft["employer_relationships"]) ??
            [],
          hr_posture:
            (row.hr_posture as SituationAnalysisDraft["hr_posture"]) ?? {},
          union_history:
            (row.union_history as SituationAnalysisDraft["union_history"]) ??
            {},
          strategic_context_summary:
            (row.strategic_context_summary as string | null) ?? "",
          company_playbook:
            (row.company_playbook as SituationAnalysisDraft["company_playbook"]) ??
            [],
          workforce_populations:
            (row.workforce_populations as SituationAnalysisDraft["workforce_populations"]) ??
            [],
          leverage_and_maths:
            (row.leverage_and_maths as SituationAnalysisDraft["leverage_and_maths"]) ??
            {},
          information_gaps:
            (row.information_gaps as SituationAnalysisDraft["information_gaps"]) ??
            [],
        };
      } catch {
        return null;
      }
    },
    enabled: open && !!campaignId,
    staleTime: 0,
  });

  // Hydrate draft whenever the loaded row changes (e.g. sheet re-opened).
  useEffect(() => {
    if (existing) {
      setDraft(existing);
    } else if (!existingLoading) {
      setDraft(emptySituationAnalysisDraft());
    }
  }, [existing, existingLoading]);

  const saveMutation = useAuthAwareMutation({
    mutationFn: async () => {
      await withSessionGuard("SituationAnalysisEditSheet:save", async () => {
        const payload = {
          campaign_id: campaignId,
          version: 1,
          is_current: true,
          employer_interaction_state: draft.employer_interaction_state,
          employer_state_notes: draft.employer_state_notes || null,
          balloted_count: draft.balloted_count,
          top_issues: draft.top_issues,
          upcoming_workforce_changes: draft.upcoming_workforce_changes,
          employer_relationships: draft.employer_relationships,
          hr_posture: draft.hr_posture,
          union_history: draft.union_history,
          strategic_context_summary: draft.strategic_context_summary || null,
          company_playbook: draft.company_playbook,
          workforce_populations: draft.workforce_populations,
          leverage_and_maths: draft.leverage_and_maths,
          information_gaps: draft.information_gaps,
        };

        if (draft.situation_id != null) {
          const { error } = await (supabase as any)
            .from("campaign_situation_analyses")
            .update(payload)
            .eq("situation_id", draft.situation_id);
          if (error) throw error;
        } else {
          const { data, error } = await (supabase as any)
            .from("campaign_situation_analyses")
            .insert(payload)
            .select("situation_id")
            .single();
          if (error) throw error;
          const inserted = data as { situation_id: number } | null;
          if (inserted?.situation_id != null) {
            setDraft((prev) => ({
              ...prev,
              situation_id: inserted.situation_id,
            }));
          }
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["campaign-situation-analysis", campaignId],
      });
      queryClient.invalidateQueries({
        queryKey: ["campaign-situation-analysis-edit-load", campaignId],
      });
      onOpenChange(false);
    },
  });

  const canSave = isSituationAnalysisComplete(draft);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // Override the default max-w-sm so there's room for the survey panels.
        className="w-full sm:max-w-2xl flex flex-col p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-sky-500" />
            <SheetTitle>Situation analysis</SheetTitle>
          </div>
          <SheetDescription>
            Capture the campaign&apos;s strategic context. Employer state and
            at least one top issue are required. The AI panels generate
            predicted playbook moves, workforce populations, and information
            gaps that feed downstream comms drafts, phone scripts, and the
            theory of winning.
          </SheetDescription>
        </SheetHeader>

        {existingLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 px-6 py-4">
            <div className="space-y-6 pb-6">
              <SurveyPanel
                campaignId={campaignId}
                campaignEmployerIds={campaignEmployerIds}
                draft={draft}
                onChange={setDraft}
              />
              <AiAssistPanel
                campaignId={campaignId}
                draft={draft}
                onApply={setDraft}
              />
              <AiChatPanel
                campaignId={campaignId}
                draft={draft}
                onApply={setDraft}
              />
            </div>
          </ScrollArea>
        )}

        <SheetFooter className="px-6 py-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saveMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave || saveMutation.isPending || existingLoading}
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
