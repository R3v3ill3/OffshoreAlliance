import { redirect } from "next/navigation";
import { PROJECTS_MAP_PATH } from "@/lib/projects/routes";

export default function MobilisationMapRedirect() {
  redirect(PROJECTS_MAP_PATH);
}
