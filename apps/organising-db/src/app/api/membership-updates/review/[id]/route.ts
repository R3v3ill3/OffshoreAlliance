import { NextRequest, NextResponse } from "next/server";
import { requireMembershipUpdateAdmin } from "@/lib/membership-updates/require-admin";
import { ReviewFileError, resolveReviewFile } from "@/lib/membership-updates/ingest";
import { isMembershipUpdateKind } from "@/lib/membership-updates/classify";

export const maxDuration = 120;

/**
 * Resolve a weekly file held for review: { action: "file", kind, weekEnding }
 * files it into that week's batch; { action: "discard" } drops it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, status, admin, user } = await requireMembershipUpdateAdmin();
  if (error || !admin || !user) return NextResponse.json({ error }, { status });

  const reviewId = Number((await params).id);
  if (!Number.isFinite(reviewId)) {
    return NextResponse.json({ error: "Invalid review id" }, { status: 400 });
  }

  const body = (await request.json()) as { action?: string; kind?: string; weekEnding?: string };
  try {
    if (body.action === "discard") {
      return NextResponse.json(
        await resolveReviewFile(admin, { reviewId, userId: user.id, action: "discard" })
      );
    }
    if (body.action === "file") {
      if (!isMembershipUpdateKind(body.kind)) {
        return NextResponse.json({ error: "Choose which weekly file this is" }, { status: 400 });
      }
      const weekEnding = body.weekEnding ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekEnding) || Number.isNaN(Date.parse(weekEnding))) {
        return NextResponse.json({ error: "Choose the week-ending date" }, { status: 400 });
      }
      return NextResponse.json(
        await resolveReviewFile(admin, {
          reviewId,
          userId: user.id,
          action: "file",
          kind: body.kind,
          weekEnding,
        })
      );
    }
    return NextResponse.json({ error: "action must be file or discard" }, { status: 400 });
  } catch (err) {
    if (err instanceof ReviewFileError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not resolve the file" },
      { status: 500 }
    );
  }
}
