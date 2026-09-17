/**
 * PostgREST `.in()` filters are sent in the request URL and the result is
 * capped by max-rows (see `fetch-all-rows.ts`). A lookup keyed on thousands
 * of values must therefore be issued in batches: each batch keeps the URL
 * well under proxy limits and returns fewer rows than one page, so nothing
 * is silently dropped.
 */

export const IN_FILTER_CHUNK = 200;

export function chunkArray<T>(items: readonly T[], size: number = IN_FILTER_CHUNK): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type ChunkResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Run `runChunk` once per batch of `values` and concatenate the rows. Throws
 * on the first error so callers cannot mistake a failed lookup for "no
 * matches" — the failure mode that turns every row of an import into a
 * create.
 */
export async function fetchInChunks<V, T>(
  values: readonly V[],
  runChunk: (chunk: V[]) => PromiseLike<ChunkResult<T>>,
  size: number = IN_FILTER_CHUNK
): Promise<T[]> {
  const unique = [...new Set(values)];
  const all: T[] = [];
  for (const chunk of chunkArray(unique, size)) {
    const { data, error } = await runChunk(chunk);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
  }
  return all;
}
