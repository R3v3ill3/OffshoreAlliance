import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  const checks: Record<string, { ok: boolean; ms: number; error?: string }> = {};

  try {
    const dbStart = Date.now();
    const admin = createAdminClient();
    const { error } = await admin.from("user_profiles").select("user_id").limit(1);
    checks.database = {
      ok: !error,
      ms: Date.now() - dbStart,
      ...(error ? { error: error.message } : {}),
    };
  } catch (e) {
    checks.database = {
      ok: false,
      ms: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    const authStart = Date.now();
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    checks.auth = {
      ok: !error,
      ms: Date.now() - authStart,
      ...(error ? { error: error.message } : {}),
    };
  } catch (e) {
    checks.auth = {
      ok: false,
      ms: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      totalMs: Date.now() - start,
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  );
}
