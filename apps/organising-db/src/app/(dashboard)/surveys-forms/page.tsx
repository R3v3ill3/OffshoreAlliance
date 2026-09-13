"use client";

/**
 * Surveys & Forms — the standalone home of the Action Network survey/form
 * importer (workspace module `surveys_forms`). Campaign-linked imports also
 * appear inside their campaign under Outcomes › Surveys & Forms.
 */

import { AnSurveyList } from "@/components/an-surveys/AnSurveyList";

export default function SurveysFormsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Surveys &amp; Forms</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">
          Link an Action Network form or survey, upload its CSV export, optionally map the answers onto campaign
          assessments, and get a per-question report with an AI-written summary. The app computes every figure;
          the AI only interprets. Upload a newer export at any time to refresh the data and re-run the analysis with
          the same brief.
        </p>
      </div>
      <AnSurveyList />
    </div>
  );
}
