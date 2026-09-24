import { redirect } from "next/navigation";
import { PROJECTS_PATH } from "@/lib/projects/routes";

export default function UpcomingProjectsRedirect() {
  redirect(PROJECTS_PATH);
}
