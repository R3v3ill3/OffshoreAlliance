/** Single side-menu destination for the activity catalogue and the mobilisation radar. */
export const PROJECTS_PATH = "/projects";
export const PROJECTS_ALERTS_PATH = "/projects/alerts";
export const PROJECTS_MONTH_PATH = "/projects?view=month";
export const PROJECTS_MAP_PATH = "/projects/map";
export const PROJECTS_WATCHLIST_PATH = "/projects/watchlist";
export const PROJECTS_NOTIFICATIONS_PATH = "/projects/notifications";

export const PROJECTS_TABS = [
  { href: PROJECTS_PATH, label: "Work programme" },
  { href: PROJECTS_ALERTS_PATH, label: "Alerts" },
  { href: PROJECTS_MAP_PATH, label: "Map" },
  { href: PROJECTS_WATCHLIST_PATH, label: "Watchlist" },
  { href: PROJECTS_NOTIFICATIONS_PATH, label: "Notifications" },
] as const;

export function projectVesselPath(id: number | string): string {
  return `/projects/vessels/${id}`;
}

export function projectContractorPath(id: number | string): string {
  return `/projects/contractors/${id}`;
}
