import { redirect } from "next/navigation";
import { PROJECTS_WATCHLIST_PATH } from "@/lib/projects/routes";

export default function MobilisationWatchlistRedirect() {
  redirect(PROJECTS_WATCHLIST_PATH);
}
