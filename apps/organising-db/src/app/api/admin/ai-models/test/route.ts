/**
 * POST /api/admin/ai-models/test
 *
 * Admin-only: send a one-line request to a candidate model so an admin
 * can verify it responds before saving it as the app-wide choice.
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { AiNotConfiguredError, getAnthropicClient, isValidModelId } from "@/lib/ai/models";

export const maxDuration = 60;

const bodySchema = z.object({
  model: z.string().min(3).max(100),
});

export interface AiModelTestResponse {
  ok: true;
  model: string;
  reply: string;
  latency_ms: number;
  usage: { input_tokens: number; output_tokens: number };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!isValidModelId(body.model)) {
    return NextResponse.json({ error: "That does not look like a Claude model id" }, { status: 400 });
  }

  try {
    const client = getAnthropicClient();
    const started = Date.now();
    const response = await client.messages.create({
      model: body.model,
      max_tokens: 32,
      messages: [{ role: "user", content: "Reply with the single word OK." }],
    });
    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return NextResponse.json({
      ok: true,
      model: response.model,
      reply,
      latency_ms: Date.now() - started,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    } satisfies AiModelTestResponse);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof Anthropic.NotFoundError) {
      return NextResponse.json({ error: `Model "${body.model}" was not found` }, { status: 404 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Anthropic API error ${err.status}: ${err.message}` },
        { status: 502 }
      );
    }
    const message = err instanceof Error ? err.message : "Model test failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
