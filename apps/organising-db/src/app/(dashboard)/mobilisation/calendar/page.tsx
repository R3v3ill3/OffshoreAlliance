import { redirect } from "next/navigation";
import { PROJECTS_MONTH_PATH } from "@/lib/projects/routes";

export default function MobilisationCalendarRedirect() {
  redirect(PROJECTS_MONTH_PATH);
}