import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";

export type FactWorkerMeta = {
  worker_id: number;
  first_name: string;
  last_name: string;
  occupation: string | null;
  worksite_name: string | null;
};

type WorkerEmbed = {
  worker_id: number;
  first_name: string;
  last_name: string;
  occupation: string | null;
  worksites: { worksite_name: string } | { worksite_name: string }[] | null;
};

function worksiteName(
  worksites: WorkerEmbed["worksites"]
): string | null {
  if (!worksites) return null;
  if (Array.isArray(worksites)) return worksites[0]?.worksite_name ?? null;
  return worksites.worksite_name ?? null;
}

export async function loadFactWorkerMeta(
  supabase: SupabaseClient,
  workerIds: number[]
): Promise<Map<number, FactWorkerMeta>> {
  const unique = [...new Set(workerIds)].filter((id) => Number.isFinite(id));
  const map = new Map<number, FactWorkerMeta>();
  const chunkSize = 200;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const rows = await fetchAllRows<WorkerEmbed>((from, to) =>
      supabase
        .from("workers")
        .select("worker_id, first_name, last_name, occupation, worksites ( worksite_name )")
        .in("worker_id", chunk)
        .range(from, to)
    );
    for (const row of rows) {
      map.set(row.worker_id, {
        worker_id: row.worker_id,
        first_name: row.first_name,
        last_name: row.last_name,
        occupation: row.occupation,
        worksite_name: worksiteName(row.worksites),
      });
    }
  }
  return map;
}
