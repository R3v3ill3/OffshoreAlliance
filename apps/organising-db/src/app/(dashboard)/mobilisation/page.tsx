import { redirect } from "next/navigation";
import { PROJECTS_ALERTS_PATH } from "@/lib/projects/routes";

export default function MobilisationFeedRedirect() {
  redirect(PROJECTS_ALERTS_PATH);
}
