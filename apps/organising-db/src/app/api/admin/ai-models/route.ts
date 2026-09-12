/**
 * GET /api/admin/ai-models
 *
 * Admin-only: list the Claude models the configured API key can reach
 * (Anthropic Models API), plus the currently resolved model per purpose.
 * Backs the "AI models" card in Administration → Settings.
 */
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  AiNotConfiguredError,
  getAnthropicClient,
  getResolvedAiModels,
  resetAiModelCache,
} from "@/lib/ai/models";

export interface AiModelListItem {
  id: string;
  display_name: string;
  created_at: string | null;
}

export interface AiModelsResponse {
  models: AiModelListItem[];
  resolved: Awaited<ReturnType<typeof getResolvedAiModels>>;
  /** Set when the model list could not be fetched; `resolved` is still valid. */
  list_error: string | null;
}

const LIST_CACHE_TTL_MS = 10 * 60_000;
let listCache: { models: AiModelListItem[]; expiresAt: number } | null = null;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Unauthorized", status: 401 };
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (!profile || profile.role !== "admin") return { error: "Forbidden", status: 403 };
  return { error: null, status: 200 };
}

async function listModels(refresh: boolean): Promise<AiModelListItem[]> {
  const now = Date.now();
  if (!refresh && listCache && listCache.expiresAt > now) return listCache.models;
  const client = getAnthropicClient();
  const models: AiModelListItem[] = [];
  for await (const m of client.models.list()) {
    models.push({ id: m.id, display_name: m.display_name, created_at: m.created_at ?? null });
  }
  models.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  listCache = { models, expiresAt: now + LIST_CACHE_TTL_MS };
  return models;
}

export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  if (refresh) resetAiModelCache();

  let models: AiModelListItem[] = [];
  let listError: string | null = null;
  try {
    models = await listModels(refresh);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    listError =
      err instanceof Anthropic.APIError
        ? `Anthropic API error ${err.status}: ${err.message}`
        : err instanceof Error
          ? err.message
          : "Could not list models";
  }

  const resolved = await getResolvedAiModels();
  return NextResponse.json({ models, resolved, list_error: listError } satisfies AiModelsResponse);
}
