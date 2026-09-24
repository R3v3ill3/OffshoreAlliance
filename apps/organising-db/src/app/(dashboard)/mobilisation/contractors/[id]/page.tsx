import { redirect } from "next/navigation";
import { projectContractorPath } from "@/lib/projects/routes";

export default async function MobilisationContractorRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(projectContractorPath(id));
}
