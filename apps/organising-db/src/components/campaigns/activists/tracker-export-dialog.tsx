"use client";

/**
 * Export wizard for the Activist & WOC Tracker workbook — the
 * five-sheet XLSX (Activist Register · Tasking Log · Structure Tests ·
 * WOC Log · Coverage Map), scoped to the whole campaign or to one
 * group's units (the tracker's "one workbook per organising unit").
 */
import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOuOptions } from "./use-woc-data";

const WHOLE_CAMPAIGN = "__all__";

export function TrackerExportDialog({
  campaignId,
  open,
  onOpenChange,
}: {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: ouOptions = [] } = useOuOptions(campaignId);
  const [scope, setScope] = useState<string>(WHOLE_CAMPAIGN);
  const [includeArchived, setIncludeArchived] = useState(false);

  const groups = ouOptions.filter((o) => o.is_group_container);

  const download = () => {
    const params = new URLSearchParams();
    if (scope !== WHOLE_CAMPAIGN) params.set("group", scope);
    if (includeArchived) params.set("archived", "1");
    const qs = params.toString();
    window.location.href = `/api/campaigns/${campaignId}/activists/export${qs ? `?${qs}` : ""}`;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export tracker workbook</DialogTitle>
          <DialogDescription>
            Downloads the five-sheet Activist &amp; WOC Tracker (Register,
            Tasking Log, Structure Tests, WOC Log, Coverage Map) for offline or
            on-site use.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE_CAMPAIGN}>Whole campaign</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.ou_id} value={String(g.ou_id)}>
                    {g.name} (group)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {groups.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No groups defined — the workbook will cover the whole campaign.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={includeArchived}
              onCheckedChange={(v) => setIncludeArchived(v === true)}
            />
            Include archived register entries
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={download}>
            <Download className="h-4 w-4" />
            Download workbook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
