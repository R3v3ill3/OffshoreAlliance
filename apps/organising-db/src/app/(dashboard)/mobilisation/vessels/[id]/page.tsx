import { redirect } from "next/navigation";
import { projectVesselPath } from "@/lib/projects/routes";

export default async function MobilisationVesselRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(projectVesselPath(id));
}
