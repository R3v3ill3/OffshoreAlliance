import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getCookieOptions } from "@/lib/supabase/cookie-options";

let _client: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (_client) return _client;
  _client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: getCookieOptions(),
    }
  ) as unknown as SupabaseClient;
  return _client;
}

export function resetClient(): void {
  _client = undefined;
}
