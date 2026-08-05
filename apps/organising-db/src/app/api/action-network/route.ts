import { NextRequest, NextResponse } from "next/server";
import { ActionNetworkClient } from "@/lib/api/action-network";
import { getAnClient as getSharedAnClient, AN_NOT_CONFIGURED_ERROR } from "@/lib/api/an-client";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { sanitiseEmailHtml } from "@/lib/comms/sanitise-email-html"
// import { appendOASignature } from "@/lib/comms/oa-email-signature" // re-enable with body line below if reverting from AN wrapper;

function getClient(): ActionNetworkClient {
  const client = getSharedAnClient();
  if (!client) throw new Error(AN_NOT_CONFIGURED_ERROR);
  return client;
}

/** This passthrough proxies the group's AN key — never expose it unauthenticated. */
async function requireUser(): Promise<NextResponse | null> {
  const supabase = await createSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const authFail = await requireUser();
  if (authFail) return authFail;
  try {
    const client = getClient();
    const { searchParams } = new URL(request.url);
    const resource = searchParams.get("resource") || "people";
    const page = parseInt(searchParams.get("page") || "1");

    let data;
    switch (resource) {
      case "people":
        data = await client.getPeople(page);
        break;
      case "forms":
        data = await client.getForms(page);
        break;
      case "events":
        data = await client.getEvents(page);
        break;
      case "tags":
        data = await client.getTags(page);
        break;
      case "messages":
        data = await client.getMessages(page);
        break;
      case "message": {
        const id = searchParams.get("id");
        if (!id) {
          return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
        }
        data = await client.getMessage(id);
        break;
      }
      case "taggings": {
        const tagId = searchParams.get("tagId");
        if (!tagId) {
          return NextResponse.json({ error: "Missing tagId parameter" }, { status: 400 });
        }
        data = await client.getTaggings(tagId, page);
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown resource: ${resource}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authFail = await requireUser();
  if (authFail) return authFail;
  try {
    const client = getClient();
    const body = await request.json();
    const { action, ...params } = body;

    let data;
    switch (action) {
      case "create_person":
        data = await client.createPerson(params.person);
        break;
      case "update_person":
        data = await client.updatePerson(params.id, params.person);
        break;
      case "create_submission":
        data = await client.createFormSubmission(params.formId, params.person);
        break;
      case "create_attendance":
        data = await client.createEventAttendance(params.eventId, params.person);
        break;
      case "add_tagging":
        data = await client.addTagging(params.tagId, params.person);
        break;
      case "create_message": {
        // Defensively sanitise the body HTML before sending to AN.
        // Strips Outlook / Gmail paste junk (data-outlook-id, style, etc.)
        // that would otherwise leak into AN's auto-generated plain-text
        // version of the email and reduce deliverability.
        const messageInput = (params.message ?? {}) as Parameters<typeof client.createMessage>[0]
        const sanitisedBody =
          typeof messageInput.body === 'string'
            ? sanitiseEmailHtml(messageInput.body)
            : messageInput.body
        // appendOASignature disabled — AN wrapper "OA Default" handles the
        // footer for AN emails. Re-enable here if reverting to app-injected
        // signature (and disable the AN wrapper default at the same time to
        // avoid a double signature).
        const sanitisedMessage = {
          ...messageInput,
          body: sanitisedBody,
          // body:
          //   typeof sanitisedBody === 'string'
          //     ? appendOASignature(sanitisedBody)
          //     : sanitisedBody,
        }
        data = await client.createMessage(sanitisedMessage)
        break;
      }
      case "send_message":
        if (!params.messageId) {
          return NextResponse.json({ error: "Missing messageId parameter" }, { status: 400 });
        }
        data = await client.sendMessage(params.messageId);
        break;
      case "create_tag":
        if (!params.name) {
          return NextResponse.json({ error: "Missing name parameter" }, { status: 400 });
        }
        data = await client.createTag(params.name);
        break;
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
