import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResponse, requireUser } from "@/lib/mobilisation/pipeline/session";

export const dynamic = "force-dynamic";

export interface RecipientRow {
  userId: string;
  displayName: string;
  email: string | null;
  role: string;
  enabled: boolean;
}

/** Admin list of staff who can receive mobilisation alerts. */
export async function GET() {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Forbidden - admin only" }, { status: 403 });
  }

  try {
    const admin = createAdminClient();
    const { data: profiles, error } = await admin
      .from("user_profiles")
      .select("user_id, role, display_name")
      .in("role", ["admin", "user"])
      .order("display_name");
    if (error) throw new Error(error.message);

    const { data: recipients, error: recipientError } = await admin
      .from("mobilisation_recipients")
      .select("user_id, enabled");
    if (recipientError) throw new Error(recipientError.message);

    const enabledById = new Map(
      (recipients ?? []).map((row) => [row.user_id as string, Boolean(row.enabled)])
    );
    // Before anyone saves the picker, seeded rows are enabled. Staff with no
    // row yet (new accounts after the seed) default off until an admin ticks them.
    const emails = await emailsById(admin, (profiles ?? []).map((p) => p.user_id as string));

    const rows: RecipientRow[] = (profiles ?? []).map((profile) => {
      const userId = profile.user_id as string;
      return {
        userId,
        displayName: (profile.display_name as string) || emails.get(userId) || userId,
        email: emails.get(userId) ?? null,
        role: profile.role as string,
        enabled: enabledById.get(userId) ?? false,
      };
    });

    rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return NextResponse.json({ recipients: rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load recipients" },
      { status: 500 }
    );
  }
}

/** Replace the enabled recipient set. Body: { userIds: string[] }. */
export async function PUT(request: Request) {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  if (auth.role !== "admin") {
    return NextResponse.json({ error: "Forbidden - admin only" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { userIds?: unknown };
  if (!Array.isArray(body.userIds) || body.userIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "userIds must be an array of strings" }, { status: 400 });
  }
  const selected = [...new Set(body.userIds as string[])];

  try {
    const admin = createAdminClient();
    const { data: profiles, error } = await admin
      .from("user_profiles")
      .select("user_id")
      .in("role", ["admin", "user"]);
    if (error) throw new Error(error.message);

    const allowed = new Set((profiles ?? []).map((p) => p.user_id as string));
    for (const id of selected) {
      if (!allowed.has(id)) {
        return NextResponse.json({ error: `User ${id} is not an admin or organiser` }, { status: 400 });
      }
    }

    const selectedSet = new Set(selected);
    const rows = [...allowed].map((userId) => ({
      user_id: userId,
      enabled: selectedSet.has(userId),
    }));

    if (rows.length > 0) {
      const { error: upsertError } = await admin.from("mobilisation_recipients").upsert(rows, {
        onConflict: "user_id",
      });
      if (upsertError) throw new Error(upsertError.message);
    }

    return NextResponse.json({ ok: true, enabled: selected.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save recipients" },
      { status: 500 }
    );
  }
}

async function emailsById(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  let page = 1;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    for (const user of data.users) {
      if (ids.includes(user.id) && user.email) map.set(user.id, user.email);
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  return map;
}
