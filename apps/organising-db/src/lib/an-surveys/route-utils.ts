/**
 * Response helpers shared by the /api/an-surveys routes.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { AiNotConfiguredError } from "@/lib/ai/models";
import { AiOutputError, AiRefusalError } from "./ai";
import { isPermissionError } from "./server";

export function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

/** A Supabase/PostgREST error → 403 for RLS denials, 500 otherwise. */
export function dbFail(err: { code?: string; message?: string } | null | undefined, context: string): NextResponse {
  if (isPermissionError(err)) return fail(403, "You do not have permission to modify this import");
  return fail(500, `${context}: ${err?.message ?? "unknown error"}`);
}

/** Map failures of the Claude calls to the response contract. */
export function aiFail(err: unknown): NextResponse {
  if (err instanceof AiNotConfiguredError) return fail(503, err.message);
  if (err instanceof AiRefusalError || err instanceof AiOutputError) return fail(502, err.message);
  if (err instanceof Anthropic.APIError) {
    return fail(502, `AI request failed (${err.status ?? "network"}): ${err.message}`);
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  return fail(500, message);
}
