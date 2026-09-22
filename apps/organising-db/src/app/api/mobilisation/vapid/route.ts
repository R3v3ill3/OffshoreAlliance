import { NextResponse } from "next/server";
import { isResponse, requireUser } from "@/lib/mobilisation/pipeline/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireUser();
  if (isResponse(auth)) return auth;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || null;
  return NextResponse.json({ publicKey });
}
