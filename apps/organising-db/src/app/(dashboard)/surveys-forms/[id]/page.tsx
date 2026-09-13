"use client";

import { useParams, useRouter } from "next/navigation";
import { AnSurveyDetail } from "@/components/an-surveys/AnSurveyDetail";

export default function SurveysFormsDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = typeof params?.id === "string" ? params.id : "";

  if (!id) return null;

  return <AnSurveyDetail importId={id} onBack={() => router.push("/surveys-forms")} />;
}
