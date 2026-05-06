import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadConfig } from "./config";

let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cached) return cached;
  const cfg = loadConfig();
  cached = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
