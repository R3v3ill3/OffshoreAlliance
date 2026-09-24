import { redirect } from "next/navigation";
import { PROJECTS_NOTIFICATIONS_PATH } from "@/lib/projects/routes";

export default function MobilisationSettingsRedirect() {
  redirect(PROJECTS_NOTIFICATIONS_PATH);
}
