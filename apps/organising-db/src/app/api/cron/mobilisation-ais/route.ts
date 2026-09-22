import { NextResponse } from "next/server";
import { unauthorizedCron } from "@/lib/mobilisation/pipeline/cron-auth";
import { runRadarAndNotify } from "@/lib/mobilisation/pipeline/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const denied = unauthorizedCron(request);
  if (denied) return denied;
  try {
    const notes = await runRadarAndNotify("ais");
    return NextResponse.json({ ok: true, notes });
  } catch (error) {
    console.error("[mobilisation-ais]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "AIS poll failed" },
      { status: 500 }
    );
  }
}
