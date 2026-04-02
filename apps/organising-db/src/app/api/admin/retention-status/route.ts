import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

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

    type RetentionRow = {
      metric_name: string;
      metric_value: number;
      metric_details: unknown;
    };

    // Format as a key-value object for easier consumption
    const status = (metrics as RetentionRow[] | null | undefined)?.reduce<
      Record<string, { value: number; details: unknown }>
    >((acc, metric) => {
      acc[metric.metric_name] = {
        value: metric.metric_value,
        details: metric.metric_details,
      };
      return acc;
    }, {});

    return NextResponse.json({
      status,
      last_checked: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in retention-status route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
