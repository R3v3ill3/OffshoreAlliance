import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Typed `Database` from codegen does not always include every table that exists
 * in migrations (remote project can lag). The runtime client is the same; we
 * expose `SupabaseClient` so `.from("…")` accepts all public tables.
 */
let _client: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (_client) return _client;
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
