"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { PaboApplicationCard } from "@/components/campaigns/bargaining/PaboApplicationCard";
import { PaboQuestionEditor } from "@/components/campaigns/bargaining/PaboQuestionEditor";
import { PaboResultsCard } from "@/components/campaigns/bargaining/PaboResultsCard";
import {
  usePaboApplication,
  usePaboBallotQuestions,
  useUpdatePaboStatus,
  useCreateQuestion,
  useUpdateQuestion,
} from "@/hooks/usePaboApplications";
import { useAuth } from "@/lib/supabase/auth-context";

export default function PaboDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { canWrite } = useAuth();

  const campaignId = Number(params.id as string);
  const paboId = Number(params.paboId as string);

  const {
    data: pabo,
    isLoading: paboLoading,
    error: paboError,
  } = usePaboApplication(paboId);

  const {
    data: questions = [],
    isLoading: questionsLoading,
  } = usePaboBallotQuestions(paboId);

  const updatePaboStatus = useUpdatePaboStatus();
  const createQuestion = useCreateQuestion();
  const updateQuestion = useUpdateQuestion();

  const isSaving =
    updatePaboStatus.isPending ||
    createQuestion.isPending ||
    updateQuestion.isPending;

  if (paboLoading || questionsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <EurekaLoadingSpinner size="lg" />
      </div>
    );
  }

  if (paboError || !pabo) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">
          {paboError
            ? "Failed to load PABO application."
            : "PABO application not found."}
        </p>
        <Button
          variant="outline"
          onClick={() => router.push(`/campaigns/${campaignId}`)}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to campaign
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/campaigns/${campaignId}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">
            {pabo.fwc_application_number
              ? `PABO — ${pabo.fwc_application_number}`
              : "PABO Application"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Campaign #{campaignId} &nbsp;·&nbsp; PABO #{paboId}
          </p>
        </div>
      </div>

      {/* Application summary card */}
      <PaboApplicationCard pabo={pabo} />

      {/* Ballot question editor */}
      <PaboQuestionEditor
        paboId={paboId}
        questions={questions}
        canWrite={!!canWrite}
        onAddQuestion={(p) => createQuestion.mutateAsync(p)}
        onUpdateQuestion={(p) => updateQuestion.mutateAsync(p)}
        isSaving={isSaving}
      />

      {/* Results summary (only shown when there are questions with data) */}
      {questions.length > 0 && <PaboResultsCard questions={questions} />}
    </div>
  );
}
