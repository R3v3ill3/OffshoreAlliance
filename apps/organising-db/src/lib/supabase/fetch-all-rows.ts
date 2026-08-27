/**
 * PostgREST returns at most 1,000 rows unless the query uses `.range()`.
 * Client-side tables that load "all workers" / "all campaign members" must
 * page through the result or they silently drop anyone after the first page.
 */

export const POSTGREST_PAGE_SIZE = 1000;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export async function fetchAllRows<T>(
  runPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = POSTGREST_PAGE_SIZE
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  const hardCap = pageSize * 100;
  for (;;) {
    const { data, error } = await runPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
    if (from >= hardCap) break;
  }
  return all;
}
