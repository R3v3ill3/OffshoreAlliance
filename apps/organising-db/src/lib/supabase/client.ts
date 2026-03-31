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
  // #region agent log
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'ssr';
  const cookieDomain = '.uconstruct.app';
  const domainMismatch = hostname !== 'ssr' && !hostname.endsWith('uconstruct.app');
  fetch('http://127.0.0.1:7908/ingest/fec0c949-4fbc-4a53-b3b1-04160f544a06',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'537981'},body:JSON.stringify({sessionId:'537981',location:'client.ts:createClient',message:'Creating Supabase browser singleton',data:{hostname,cookieDomain,domainMismatch,existingCookieCount:typeof document!=='undefined'?document.cookie.split(';').filter(Boolean).length:0},timestamp:Date.now(),hypothesisId:'H-A'})}).catch(()=>{});
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
