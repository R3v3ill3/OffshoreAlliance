/** Deep-link into Administration → Data Management → Weekly Updates. */
export function weeklyUpdatesHref(batchId?: number): string {
  const params = new URLSearchParams({ tab: "data", sub: "weekly_updates" });
  if (batchId != null) params.set("batch", String(batchId));
  return `/administration?${params.toString()}`;
}
