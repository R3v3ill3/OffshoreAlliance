"use client";

import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BINARY_SUPPORTER_OUTCOME_OPTIONS } from "@/lib/campaign/constants";
import { useWallChartAssessmentOptions } from "../assessment-selector";
import type { ParticipationImportController } from "./use-participation-import";

/**
 * Step 2 — choose the assessment the import writes to: an existing wall
 * chart assessment or a new one created on apply.
 */
export function StepAssessment({
  campaignId,
  controller,
}: {
  campaignId: string;
  controller: ParticipationImportController;
}) {
  const { assessment, setAssessment, source } = controller;
  const { data: options = [], isLoading } = useWallChartAssessmentOptions(campaignId);

  // Seed a sensible default when the step is first entered: a linked AN
  // action re-syncs into its existing assessment; otherwise a new binary
  // participation assessment (AN mode) or an empty new assessment (CSV).
  useEffect(() => {
    if (assessment) return;
    if (source?.kind === "an") {
      const linked =
        source.action.linked_activity_id != null
          ? options.find((o) => o.activity_id === source.action.linked_activity_id)
          : undefined;
      if (linked) {
        setAssessment({ mode: "existing", option: linked });
        return;
      }
      setAssessment({
        mode: "new",
        title: `Participation — ${source.action.title}`,
        isBinary: true,
        supporterOutcomeValue: "yes",
      });
      return;
    }
    setAssessment({ mode: "new", title: "", isBinary: true, supporterOutcomeValue: "yes" });
  }, [assessment, source, options, setAssessment]);

  const mode = assessment?.mode ?? "new";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The import records a participation entry per worker against one
        assessment, which then colours the wall chart.
      </p>
      <RadioGroup
        value={mode}
        onValueChange={(v) => {
          if (v === "existing") {
            const first = options[0];
            if (first) setAssessment({ mode: "existing", option: first });
            else setAssessment(null);
          } else {
            setAssessment({
              mode: "new",
              title: "",
              isBinary: true,
              supporterOutcomeValue: "yes",
            });
          }
        }}
        className="space-y-3"
      >
        <div className="rounded-md border p-3">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="new" id="assess-new" />
            <Label htmlFor="assess-new" className="font-medium">
              Create a new assessment
            </Label>
          </div>
          {mode === "new" && assessment?.mode === "new" && (
            <div className="mt-3 space-y-3 pl-6">
              <div className="space-y-1">
                <Label htmlFor="assess-title" className="text-xs">
                  Title
                </Label>
                <Input
                  id="assess-title"
                  value={assessment.title}
                  placeholder="e.g. EBA survey — PIA willingness"
                  onChange={(e) =>
                    setAssessment({ ...assessment, title: e.target.value })
                  }
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="assess-binary"
                  checked={assessment.isBinary}
                  onCheckedChange={(checked) =>
                    setAssessment({ ...assessment, isBinary: checked })
                  }
                />
                <Label htmlFor="assess-binary" className="text-xs">
                  Binary (yes / no) — untick for a 1–5 support scale
                </Label>
              </div>
              {assessment.isBinary && (
                <div className="space-y-1">
                  <Label className="text-xs">Supportive outcome</Label>
                  <Select
                    value={assessment.supporterOutcomeValue}
                    onValueChange={(v) =>
                      setAssessment({ ...assessment, supporterOutcomeValue: v })
                    }
                  >
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BINARY_SUPPORTER_OUTCOME_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-md border p-3">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="existing" id="assess-existing" disabled={options.length === 0} />
            <Label htmlFor="assess-existing" className="font-medium">
              Update an existing assessment
            </Label>
            {options.length === 0 && !isLoading && (
              <span className="text-xs text-muted-foreground">
                (no assessments on this campaign yet)
              </span>
            )}
          </div>
          {mode === "existing" && assessment?.mode === "existing" && (
            <div className="mt-3 pl-6">
              <Select
                value={String(assessment.option.activity_id)}
                onValueChange={(v) => {
                  const option = options.find((o) => o.activity_id === Number(v));
                  if (option) setAssessment({ mode: "existing", option });
                }}
              >
                <SelectTrigger className="h-8 w-full max-w-md text-xs">
                  <SelectValue placeholder="Choose assessment…" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.activity_id} value={String(o.activity_id)} className="text-xs">
                      {o.title}
                      {o.is_binary ? " (yes/no)" : " (1–5)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </RadioGroup>
    </div>
  );
}
