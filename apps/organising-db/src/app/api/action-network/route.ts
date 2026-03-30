import { NextRequest, NextResponse } from "next/server";
import { ActionNetworkClient } from "@/lib/api/action-network";

function getClient(): ActionNetworkClient {
  const apiKey = process.env.ACTION_NETWORK_API_KEY;
  if (!apiKey || apiKey === "your-action-network-key-here") {
    throw new Error("Action Network API key not configured");
  }
  return new ActionNetworkClient({ apiKey });
}

export async function GET(request: NextRequest) {
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
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
