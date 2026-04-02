import { createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createServerClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get retention status
    const { data: metrics, error } = await supabase
      .rpc("get_import_log_retention_status");

    if (error) {
      console.error("Error fetching retention status:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Format as a key-value object for easier consumption
    const status = metrics?.reduce((acc, metric) => {
      acc[metric.metric_name] = {
        value: metric.metric_value,
        details: metric.metric_details,
      };
      return acc;
    }, {} as Record<string, { value: number; details: unknown }>);

    return NextResponse.json({
      status,
      last_checked: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in retention-status route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
