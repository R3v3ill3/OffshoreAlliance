import { NextRequest, NextResponse } from "next/server";
import { requireMembershipUpdateAdmin } from "@/lib/membership-updates/require-admin";
import { downloadMembershipUpdateFile } from "@/lib/membership-updates/ingest";
import { parseWeeklyUpdateFiles, buildCombinedWorkbook } from "@/lib/membership-updates/parse-files";
import { formatWeekEnding, type MembershipUpdateKind } from "@/lib/membership-updates/kinds";

export const maxDuration = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, status, admin } = await requireMembershipUpdateAdmin();
  if (error || !admin) return NextResponse.json({ error }, { status });

  const batchId = Number((await params).id);
  const { data: batch } = await admin
    .from("membership_update_batches")
    .select("week_ending")
    .eq("batch_id", batchId)
    .maybeSingle();
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: files } = await admin
    .from("membership_update_files")
    .select("kind, storage_path")
    .eq("batch_id", batchId);
  const parsedFiles = [];
  for (const file of files ?? []) {
    const buffer = await downloadMembershipUpdateFile(admin, file.storage_path);
    parsedFiles.push({ kind: file.kind as MembershipUpdateKind, buffer });
  }
  const { rows } = parseWeeklyUpdateFiles(parsedFiles);
  const xlsx = buildCombinedWorkbook(rows);
  const filename = `OA - Weekly Update - w-e ${formatWeekEnding(batch.week_ending)}.xlsx`;

  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
