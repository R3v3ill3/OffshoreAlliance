"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface EmployerSearchResult {
  employer_id: number;
  employer_name: string;
  trading_name: string | null;
  employer_category: string | null;
}

const MIN_QUERY = 2;
const LIMIT = 20;

// Server-side ILIKE search across employer_name + trading_name. Caller
// should debounce the input string before passing it in (or rely on
// React Query's deduping by keying on `query`).
export function useEmployerSearch(query: string) {
  const supabase = createClient();
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["employer-search", trimmed],
    enabled: trimmed.length >= MIN_QUERY,
    queryFn: async (): Promise<EmployerSearchResult[]> => {
      const escaped = trimmed.replace(/[%_]/g, "\\$&");
      const pattern = `%${escaped}%`;
      const { data, error } = await supabase
        .from("employers")
        .select("employer_id, employer_name, trading_name, employer_category")
        .eq("is_active", true)
        .or(`employer_name.ilike.${pattern},trading_name.ilike.${pattern}`)
        .order("employer_name", { ascending: true })
        .limit(LIMIT);
      if (error) throw error;
      return (data ?? []) as EmployerSearchResult[];
    },
    staleTime: 30_000,
  });
}
