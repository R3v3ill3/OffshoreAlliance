import { redirect } from "next/navigation";
import { PROJECTS_CALENDAR_PATH } from "@/lib/projects/routes";

export default function MobilisationCalendarRedirect() {
  redirect(PROJECTS_CALENDAR_PATH);
}
