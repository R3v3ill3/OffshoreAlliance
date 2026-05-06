import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden - admin only" }, { status: 403 });
  }

  const scraperUrl = process.env.RAILWAY_SCRAPER_URL;
  const sharedSecret = process.env.SCRAPER_SHARED_SECRET;

  if (!scraperUrl || !sharedSecret) {
    return NextResponse.json(
      { error: "Scraper service not configured" },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(`${scraperUrl.replace(/\/$/, "")}/scrape`, {
      method: "POST",
      headers: {
        "x-scraper-secret": sharedSecret,
        "x-triggered-by": `manual:${user.id}`,
      },
    });

    const body = (await response.json().catch(() => ({}))) as {
      accepted?: boolean;
      error?: string;
    };

    if (!response.ok) {
      return NextResponse.json(
        { error: body.error ?? `Scraper returned HTTP ${response.status}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ accepted: body.accepted ?? true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}
