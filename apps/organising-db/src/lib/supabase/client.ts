import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { agentDebugLog } from "@/lib/agent-debug-log";

/**
 * Typed `Database` from codegen does not always include every table that exists
 * in migrations (remote project can lag). The runtime client is the same; we
 * expose `SupabaseClient` so `.from("…")` accepts all public tables.
 */
let _client: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (_client) return _client;
  // #region agent log
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const cookieDomain = ".uconstruct.app";
    const domainMismatch = !hostname.endsWith("uconstruct.app");
    agentDebugLog({
      location: "client.ts:createClient",
      message: "Creating Supabase browser singleton",
      data: {
        hostname,
        cookieDomain,
        domainMismatch,
        existingCookieCount: document.cookie.split(";").filter(Boolean).length,
      },
      hypothesisId: "H3",
    });
  }
  // #endregion
  _client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        domain: ".uconstruct.app",
      },
    }
  ) as unknown as SupabaseClient;
  return _client;
}

export function resetClient(): void {
  _client = undefined;
}
