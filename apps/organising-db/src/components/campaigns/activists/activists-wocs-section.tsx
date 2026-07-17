"use client";

/**
 * Activists & WOCs — Workforce sub-tab shell.
 *
 * Digitises the OA Activist & WOC Tracker: Register (one row per
 * person), 4A Tasking (one row per task cycle), WOCs (committees,
 * rosters, meeting log) and Structure Tests. Coverage lives on the
 * Campaign Units and Wall Chart sub-tabs, where organisers already
 * look at units.
 *
 * Internal navigation uses the ?view= URL param (mirrors the
 * WorkforceBoard pattern) so links can deep-link a section.
 */
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivistRegister } from "./activist-register";

const VIEWS = ["register"] as const;
type SectionView = (typeof VIEWS)[number];

export function ActivistsWocsSection({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawView = searchParams.get("view");
  const view: SectionView = VIEWS.includes(rawView as SectionView)
    ? (rawView as SectionView)
    : "register";

  const setView = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  return (
    <Tabs value={view} onValueChange={setView}>
      <TabsList className="mb-4">
        <TabsTrigger value="register">Register</TabsTrigger>
      </TabsList>

      <TabsContent value="register">
        <ActivistRegister campaignId={campaignId} canWrite={canWrite} />
      </TabsContent>
    </Tabs>
  );
}
