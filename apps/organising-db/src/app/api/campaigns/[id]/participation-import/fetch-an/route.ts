import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAnClient, AN_NOT_CONFIGURED_ERROR } from "@/lib/api/an-client";
import type {
  AnFetchResponse,
  AnKnownParticipant,
  AnResourceType,
} from "@/lib/import/participation-import-shared";

const fetchSchema = z.object({
  resource_type: z.enum(["form", "survey", "petition", "event"]),
  resource_id: z.string().min(1).max(100),
});

const RECORD_CONFIG: Record<AnResourceType, { path: (id: string) => string; embeddedKey: string }> = {
  form: { path: (id) => `/forms/${id}/submissions`, embeddedKey: "osdi:submissions" },
  survey: { path: (id) => `/surveys/${id}/responses`, embeddedKey: "action_network:responses" },
  petition: { path: (id) => `/petitions/${id}/signatures`, embeddedKey: "osdi:signatures" },
  event: { path: (id) => `/events/${id}/attendances`, embeddedKey: "osdi:attendances" },
};

/** 200 pages × 25 records = 5,000 participants per sync. */
const MAX_PAGES = 200;
const WORKER_LOOKUP_CHUNK = 500;

function extractPersonId(record: Record<string, unknown>): string | null {
  const direct = record["action_network:person_id"];
  if (typeof direct === "string" && direct) return direct;
  const links = record._links as Record<string, { href?: string }> | undefined;
  const href = links?.["osdi:person"]?.href;
  if (href) return href.split("/").filter(Boolean).pop() ?? null;
  return null;
}

/**
 * Pull the participant list (who submitted / responded / signed / attended)
 * for an AN action. Participants whose AN person id is already stored on a
 * worker record are returned resolved; the rest need /resolve-people.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaignId = Number(id);
  if (!Number.isFinite(campaignId)) {
    return NextResponse.json({ success: false, error: "Invalid campaign ID" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (!profile || profile.role === "viewer") {
    return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
  }

  const client = getAnClient();
  if (!client) {
    return NextResponse.json({ success: false, error: AN_NOT_CONFIGURED_ERROR }, { status: 503 });
  }

  let body: z.infer<typeof fetchSchema>;
  try {
    body = fetchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  try {
    const config = RECORD_CONFIG[body.resource_type];
    const { records, totalRecords, truncated } = await client.fetchAllRecords(
      config.path(body.resource_id),
      config.embeddedKey,
      { maxPages: MAX_PAGES }
    );

    // AN dedupes action records per person, but be defensive: keep the
    // earliest record per person id.
    const respondedById = new Map<string, string | null>();
    for (const record of records) {
      const personId = extractPersonId(record);
      if (!personId) continue;
      if (!respondedById.has(personId)) {
        respondedById.set(personId, (record.created_date as string | undefined) ?? null);
      }
    }
    const personIds = Array.from(respondedById.keys());

    // Resolve locally first: workers whose action_network_id we already know.
    const knownWorkers = new Map<
      string,
      { worker_id: number; first_name: string; last_name: string; email: string | null; phone: string | null }
    >();
    for (let i = 0; i < personIds.length; i += WORKER_LOOKUP_CHUNK) {
      const chunk = personIds.slice(i, i + WORKER_LOOKUP_CHUNK);
      const { data: workers, error: wErr } = await supabase
        .from("workers")
        .select("worker_id, first_name, last_name, email, phone, action_network_id")
        .in("action_network_id", chunk);
      if (wErr) {
        return NextResponse.json(
          { success: false, error: `Worker lookup failed: ${wErr.message}` },
          { status: 500 }
        );
      }
      for (const w of workers ?? []) {
        if (w.action_network_id) knownWorkers.set(w.action_network_id, w);
      }
    }

    const known: AnKnownParticipant[] = [];
    const unknown: { an_person_id: string; responded_at: string | null }[] = [];
    for (const [personId, respondedAt] of respondedById) {
      const worker = knownWorkers.get(personId);
      if (worker) {
        known.push({
          an_person_id: personId,
          worker_id: worker.worker_id,
          first_name: worker.first_name,
          last_name: worker.last_name,
          email: worker.email,
          phone: worker.phone,
          responded_at: respondedAt,
        });
      } else {
        unknown.push({ an_person_id: personId, responded_at: respondedAt });
      }
    }

    return NextResponse.json({
      success: true,
      total_records: totalRecords,
      truncated,
      known,
      unknown,
    } satisfies AnFetchResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action Network request failed";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
