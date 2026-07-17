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
import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivistRegister } from "./activist-register";
import { TrackerExportDialog } from "./tracker-export-dialog";
import { ActivistTaskingBoard } from "./activist-tasking-board";
import { WocsPanel } from "./wocs-panel";
import { StructureTestsPanel } from "./structure-tests-panel";

const VIEWS = ["register", "tasking", "wocs", "structure-tests"] as const;
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
  const [exportOpen, setExportOpen] = useState(false);

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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="register">Register</TabsTrigger>
          <TabsTrigger value="tasking">4A Tasking</TabsTrigger>
          <TabsTrigger value="wocs">WOCs</TabsTrigger>
          <TabsTrigger value="structure-tests">Structure Tests</TabsTrigger>
        </TabsList>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExportOpen(true)}
        >
          <Download className="h-4 w-4" />
          Export workbook
        </Button>
      </div>

      <TabsContent value="register">
        <ActivistRegister campaignId={campaignId} canWrite={canWrite} />
      </TabsContent>

      <TabsContent value="tasking">
        {view === "tasking" && (
          <ActivistTaskingBoard campaignId={campaignId} canWrite={canWrite} />
        )}
      </TabsContent>

      <TabsContent value="wocs">
        {view === "wocs" && (
          <WocsPanel campaignId={campaignId} canWrite={canWrite} />
        )}
      </TabsContent>

      <TabsContent value="structure-tests">
        {view === "structure-tests" && (
          <StructureTestsPanel campaignId={campaignId} canWrite={canWrite} />
        )}
      </TabsContent>

      <TrackerExportDialog
        campaignId={campaignId}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
    </Tabs>
  );
}
