/**
 * Concatenated search text so "Jane Doe" matches a row whose first/last
 * live in separate columns. Used by Overview → Workers and add-workers.
 */
export function workerSearchBlob(worker: {
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  return [
    worker.first_name,
    worker.last_name,
    worker.preferred_name,
    worker.email,
    worker.phone,
  ]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .join(" ")
    .toLowerCase();
}
