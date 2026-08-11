/**
 * Server-side survey authoring helper shared by the create (POST) and
 * edit (PATCH) routes: inserts the question list and rewrites the
 * payload's INDEX-based branch targets to real question_ids.
 * Runs on the RLS-checked user client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SurveyQuestionInput } from "@/lib/sms/survey-validation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export async function insertSurveyQuestions(
  supabase: Db,
  surveyId: number,
  questions: SurveyQuestionInput[],
): Promise<void> {
  const { data: inserted, error } = await supabase
    .from("sms_survey_questions")
    .insert(
      questions.map((q, i) => ({
        survey_id: surveyId,
        sort_order: i,
        prompt: q.prompt!.trim(),
        qtype: q.qtype,
        options: q.options ?? null,
        branching: null, // rewritten below once ids exist
        write_rating: !!q.write_rating,
        activity_id: q.activity_id ?? null,
        invalid_prompt: q.invalid_prompt?.trim() || null,
        nudge_text: q.nudge_text?.trim() || null,
      })),
    )
    .select("question_id, sort_order");
  if (error) throw error;
  const idByIndex = new Map<number, number>(
    (inserted ?? []).map((r) => [r.sort_order as number, r.question_id as number]),
  );

  for (let i = 0; i < questions.length; i++) {
    const branching = questions[i].branching;
    if (!branching || Object.keys(branching).length === 0) continue;
    const mapped: Record<string, number | "end"> = {};
    for (const [value, target] of Object.entries(branching)) {
      mapped[value] =
        target === "end" ? "end" : (idByIndex.get(target as number) ?? "end");
    }
    const { error: brErr } = await supabase
      .from("sms_survey_questions")
      .update({ branching: mapped })
      .eq("question_id", idByIndex.get(i)!);
    if (brErr) throw brErr;
  }
}
