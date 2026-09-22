import { NextResponse } from "next/server";
import { isResponse, requireUser } from "@/lib/mobilisation/pipeline/session";
import { runRadarAndNotify, type RadarLayer } from "@/lib/mobilisation/pipeline/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Admin-triggered poll. Same jobs as the crons, ignoring the cadence gate. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Forbidden - admin only" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { layer?: RadarLayer };
  const layer = body.layer ?? "regulatory";
  if (!["regulatory", "commercial", "ais", "digest"].includes(layer)) {
    return NextResponse.json({ error: "Unknown layer" }, { status: 400 });
  }
  try {
    const notes =
      layer === "digest"
        ? await (await import("@/lib/mobilisation/pipeline/run")).runRadar("digest", true)
        : await runRadarAndNotify(layer, true);
    return NextResponse.json({ ok: true, notes });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "poll failed" },
      { status: 500 }
    );
  }
}
