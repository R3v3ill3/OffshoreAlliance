import { NextRequest, NextResponse } from "next/server";
import { YabbrClient, formatAustralianPhone } from "@/lib/api/yabbr";

function getClient(): YabbrClient {
  const apiKey = process.env.YABBR_API_KEY;
  if (!apiKey || apiKey === "your-yabbr-key-here") {
    throw new Error("Yabbr API key not configured");
  }
  return new YabbrClient({
    apiKey,
    apiUrl: process.env.YABBR_API_URL || "https://cloud.yabb.com",
  });
}

export async function GET(request: NextRequest) {
  try {
    const client = getClient();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    switch (action) {
      case "balance": {
        const balance = await client.getCreditBalance();
        return NextResponse.json({ success: true, data: balance });
      }
      case "status": {
        const messageId = searchParams.get("messageId");
        if (!messageId) {
          return NextResponse.json({ error: "messageId required" }, { status: 400 });
        }
        const status = await client.getMessageStatus(messageId);
        return NextResponse.json({ success: true, data: status });
      }
      default:
        return NextResponse.json({ error: "Use action=balance or action=status" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const client = getClient();
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "send_sms": {
        const { to, message, from } = body;
        if (!to || !message) {
          return NextResponse.json({ error: "to and message required" }, { status: 400 });
        }
        const formattedTo = formatAustralianPhone(to);
        const result = await client.sendSms({ to: formattedTo, message, from });
        return NextResponse.json({ success: true, data: result });
      }
      case "send_bulk_sms": {
        const { recipients, from } = body;
        if (!recipients || !Array.isArray(recipients)) {
          return NextResponse.json({ error: "recipients array required" }, { status: 400 });
        }
        const formatted = recipients.map((r: { to: string; message: string }) => ({
          to: formatAustralianPhone(r.to),
          message: r.message,
        }));
        const results = await client.sendBulkSms(formatted, from);
        return NextResponse.json({ success: true, data: results });
      }
      default:
        return NextResponse.json({ error: "Use action=send_sms or action=send_bulk_sms" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
