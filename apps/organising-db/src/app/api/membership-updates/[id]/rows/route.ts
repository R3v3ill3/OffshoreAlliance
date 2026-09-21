import { NextRequest, NextResponse } from "next/server";
import { requireMembershipUpdateAdmin } from "@/lib/membership-updates/require-admin";
import { downloadMembershipUpdateFile } from "@/lib/membership-updates/ingest";
import { parseWeeklyUpdateFiles } from "@/lib/membership-updates/parse-files";
import { computeNetMovement, type MembershipUpdateKind } from "@/lib/membership-updates/kinds";
import { WEEKLY_UPDATE_COMBINED_HEADERS } from "@/lib/import/membership-import-types";

export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, status, admin } = await requireMembershipUpdateAdmin();
  if (error || !admin) return NextResponse.json({ error }, { status });

  const batchId = Number((await params).id);
  const { data: batch, error: batchError } = await admin
    .from("membership_update_batches")
    .select("*")
    .eq("batch_id", batchId)
    .maybeSingle();
  if (batchError) return NextResponse.json({ error: batchError.message }, { status: 500 });
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: files } = await admin
    .from("membership_update_files")
    .select("*")
    .eq("batch_id", batchId);

  const parsedFiles = [];
  for (const file of files ?? []) {
    const buffer = await downloadMembershipUpdateFile(admin, file.storage_path);
    parsedFiles.push({ kind: file.kind as MembershipUpdateKind, buffer });
  }
  const { rows, countsByKind } = parseWeeklyUpdateFiles(parsedFiles);

  return NextResponse.json({
    batch,
    files: files ?? [],
    rows,
    headers: [...WEEKLY_UPDATE_COMBINED_HEADERS],
    countsByKind,
    netMovement: computeNetMovement(countsByKind),
    fileName: `OA - Weekly Update - w-e ${batch.week_ending}.xlsx`,
  });
}
