import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const aiResponseSchema = z.object({
  employer_groups: z.array(
    z.object({
      proposed_parent_name: z.string(),
      member_employer_ids: z.array(z.number()),
      confidence: z.enum(["high", "medium", "low"]),
    })
  ),
  category_assignments: z.array(
    z.object({
      employer_id: z.number(),
      proposed_category: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
      reasoning: z.string(),
    })
  ),
  worksite_pe_assignments: z.array(
    z.object({
      worksite_id: z.number(),
      principal_employer_id: z.number(),
      confidence: z.enum(["high", "medium", "low"]),
      reasoning: z.string(),
    })
  ),
});

function stripMarkdownFences(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  return text.trim();
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    if (profile?.role !== "admin")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { employers, worksites, principalEmployers } = body;

    const validEmployerIds = new Set<number>(
      employers.map((e: { id: number }) => e.id)
    );
    const validWorksiteIds = new Set<number>(
      worksites.map((w: { id: number }) => w.id)
    );
    const validPeIds = new Set<number>(
      principalEmployers.map((p: { id: number }) => p.id)
    );

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = `You are a data analyst for the Offshore Alliance, an Australian maritime union.
You are given a list of employers and worksites operating in the Australian offshore oil and gas industry.

Your tasks:
1. Identify employer corporate families — groups of entities belonging to the same parent company
   (e.g. 'ESS Catering Pty Ltd' and 'ESS Aviation Pty Ltd' should group under parent 'ESS').
   Do NOT group Shell, Woodside, Inpex, or Chevron entities — they are already Principal Employers.
2. Suggest the appropriate employer_category for each employer:
   Producer | Major_Contractor | Subcontractor | Labour_Hire | Specialist
   Do NOT suggest Principal_Employer — that is reserved for Shell/Woodside/Inpex/Chevron.
3. Suggest which Principal Employer (Shell, Woodside, Inpex, or Chevron) each worksite belongs to.
   Use worksite name, type, basin, and offshore context as signals.

Return ONLY a valid JSON object — no markdown, no commentary, no trailing text. Schema:
{
  "employer_groups": [
    { "proposed_parent_name": "string", "member_employer_ids": [number], "confidence": "high"|"medium"|"low" }
  ],
  "category_assignments": [
    { "employer_id": number, "proposed_category": "string", "confidence": "high"|"medium"|"low", "reasoning": "string" }
  ],
  "worksite_pe_assignments": [
    { "worksite_id": number, "principal_employer_id": number, "confidence": "high"|"medium"|"low", "reasoning": "string" }
  ]
}`;

    const userContent = `Principal Employers (IDs for reference):
${JSON.stringify(principalEmployers, null, 2)}

Employers to analyse:
${JSON.stringify(employers, null, 2)}

Worksites to analyse:
${JSON.stringify(worksites, null, 2)}`;

    const message = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    const cleaned = stripMarkdownFences(text);

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        {
          error: "ai_parse_error",
          message:
            "AI returned malformed JSON. Fuzzy matching results are still available.",
          raw: text.slice(0, 500),
        },
        { status: 422 }
      );
    }

    const validated = aiResponseSchema.safeParse(parsed);
    if (!validated.success) {
      return NextResponse.json(
        {
          error: "ai_validation_error",
          message:
            "AI response did not match expected schema. Fuzzy matching results are still available.",
          details: validated.error.issues,
        },
        { status: 422 }
      );
    }

    const proposals = validated.data;

    // Filter out any hallucinated IDs
    proposals.employer_groups = proposals.employer_groups.map((g) => ({
      ...g,
      member_employer_ids: g.member_employer_ids.filter((id) =>
        validEmployerIds.has(id)
      ),
    }));
    proposals.category_assignments = proposals.category_assignments.filter(
      (c) => validEmployerIds.has(c.employer_id)
    );
    proposals.worksite_pe_assignments =
      proposals.worksite_pe_assignments.filter(
        (w) =>
          validWorksiteIds.has(w.worksite_id) &&
          validPeIds.has(w.principal_employer_id)
      );

    return NextResponse.json({ success: true, proposals });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
