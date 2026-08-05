import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAnClient, AN_NOT_CONFIGURED_ERROR } from "@/lib/api/an-client";
import type {
  AnResolvedPerson,
  AnResolvePeopleResponse,
} from "@/lib/import/participation-import-shared";

/**
 * Small chunks keep each request well inside the platform route timeout:
 * person fetches are throttled to ~3.6/s, so 25 ids ≈ 7 s. The wizard
 * loops over chunks with a progress indicator.
 */
const resolveSchema = z.object({
  ids: z.array(z.string().min(1).max(100)).min(1).max(25),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!Number.isFinite(Number(id))) {
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

  const client = getAnClient();
  if (!client) {
    return NextResponse.json({ success: false, error: AN_NOT_CONFIGURED_ERROR }, { status: 503 });
  }

  let body: z.infer<typeof resolveSchema>;
  try {
    body = resolveSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const people: AnResolvedPerson[] = [];
  for (const anId of body.ids) {
    try {
      const person = await client.getPerson(anId);
      const emails = ((person as Record<string, unknown>).email_addresses as
        | { address?: string }[]
        | undefined)
        ?.map((e) => e.address ?? "")
        .filter(Boolean) ?? [];
      const phones = ((person as Record<string, unknown>).phone_numbers as
        | { number?: string }[]
        | undefined)
        ?.map((p) => p.number ?? "")
        .filter(Boolean) ?? [];
      people.push({
        an_person_id: anId,
        emails,
        phones,
        given_name: ((person as Record<string, unknown>).given_name as string | undefined) ?? "",
        family_name: ((person as Record<string, unknown>).family_name as string | undefined) ?? "",
      });
    } catch {
      // Person fetch failed (deleted person, transient error after retries):
      // return an identity-less row so the wizard can surface it as unmatched.
      people.push({
        an_person_id: anId,
        emails: [],
        phones: [],
        given_name: "",
        family_name: "",
      });
    }
  }

  return NextResponse.json({ success: true, people } satisfies AnResolvePeopleResponse);
}
