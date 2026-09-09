"use client";

// WP1.1 — Administration → Settings: org-wide workspace defaults per work
// role. Has its OWN load/save against /api/admin/workspace-defaults and
// never joins SettingsTab.handleSave, so a workspace edit can never resend
// integration credentials and a credentials edit can never blank this.

import { useEffect, useState } from "react";
import { AlertTriangle, LayoutPanelLeft, Loader2, Save } from "lucide-react";
import { fetchApi } from "@/lib/api/fetch-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MODULE_IDS,
  ORGANISER_DEFAULT_MODULE_IDS,
  WORK_ROLE_VALUES,
  type WorkspaceModuleId,
} from "@/lib/workspace/modules";
import {
  parseWorkspaceDefaults,
  type WorkspaceDefaults,
  type WorkspaceRoleDefault,
} from "@/lib/workspace/prefs-schema";
import type { WorkspaceMode } from "@/lib/workspace/resolve";
import type { WorkRole } from "@/types/database";
import { WorkspaceModuleChecklist } from "./workspace-module-checklist";

interface RoleRowState {
  mode: WorkspaceMode;
  modules: WorkspaceModuleId[];
  allowShowEverything: boolean;
}

type RowsState = Record<WorkRole, RoleRowState>;

const NON_ADMIN_MODULE_IDS = MODULE_IDS.filter((id) => id !== "administration");

function rowFromEntry(entry: WorkspaceRoleDefault | undefined): RoleRowState {
  return {
    mode: entry?.mode ?? "full",
    modules: entry?.modules ?? [...ORGANISER_DEFAULT_MODULE_IDS],
    allowShowEverything: entry?.allowShowEverything ?? true,
  };
}

function rowsFromDocument(doc: WorkspaceDefaults | null): RowsState {
  const rows = {} as RowsState;
  for (const role of WORK_ROLE_VALUES) {
    rows[role] = rowFromEntry(doc?.byWorkRole?.[role]);
  }
  return rows;
}

function documentFromRows(rows: RowsState): WorkspaceDefaults {
  const byWorkRole: NonNullable<WorkspaceDefaults["byWorkRole"]> = {};
  for (const role of WORK_ROLE_VALUES) {
    const row = rows[role];
    byWorkRole[role] =
      row.mode === "full"
        ? { mode: "full" }
        : {
            mode: "organiser",
            modules: row.modules,
            allowShowEverything: row.allowShowEverything,
          };
  }
  return { byWorkRole };
}

export interface WorkspaceDefaultsCardProps {
  workRoles: { value: WorkRole; label: string }[];
}

export function WorkspaceDefaultsCard({ workRoles }: WorkspaceDefaultsCardProps) {
  const [rows, setRows] = useState<RowsState>(() => rowsFromDocument(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept apart from `error`: while the initial GET has failed, `rows` is only
  // the all-`full` seed, so saving would overwrite the stored document with
  // it. Save stays disabled until a reload succeeds.
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchApi("/api/admin/workspace-defaults")
      .then(async (r) => {
        const json: unknown = await r.json();
        if (!r.ok) {
          const message =
            json && typeof json === "object" && "error" in json
              ? String((json as { error: unknown }).error)
              : "Failed to load workspace defaults";
          throw new Error(message);
        }
        return json;
      })
      .then((json) => {
        if (!cancelled) {
          setRows(rowsFromDocument(parseWorkspaceDefaults(json)));
          setLoadError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : "Failed to load workspace defaults");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateRow = (role: WorkRole, patch: Partial<RoleRowState>) =>
    setRows((prev) => ({ ...prev, [role]: { ...prev[role], ...patch } }));

  // Organiser mode with an empty list would resolve to the registry defaults
  // anyway (resolve.ts R6), so an empty tick list is never what the admin
  // means: block the save and say so.
  const emptyOrganiserRoles = workRoles.filter(
    ({ value }) => rows[value].mode === "organiser" && rows[value].modules.length === 0
  );
  const saveBlocked = loadError !== null || emptyOrganiserRoles.length > 0;

  const handleSave = async () => {
    if (saveBlocked) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetchApi("/api/admin/workspace-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(documentFromRows(rows)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Save failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LayoutPanelLeft className="h-4 w-4" />
          Workspace defaults
        </CardTitle>
        <CardDescription>
          What each work role sees by default. Full is today&apos;s interface; Organiser
          shows only the ticked modules. Per-user overrides live in Users. Workspace mode
          changes what people see, not what they can do. A viewer with no work role follows
          the Organiser row; a user with no work role is always Full.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(loadError ?? error) && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {loadError
              ? `${loadError}. Reload the page before saving — saving now would overwrite the stored defaults.`
              : error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {workRoles.map(({ value: role, label }) => {
            const row = rows[role];
            const organiser = row.mode === "organiser";
            return (
              <div key={role} className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{label}</span>
                  <Select
                    value={row.mode}
                    onValueChange={(v) => updateRow(role, { mode: v as WorkspaceMode })}
                    disabled={loading}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full</SelectItem>
                      <SelectItem value="organiser">Organiser</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`wsd-${role}-allow`} className="text-sm font-normal">
                    Allow &ldquo;Show everything&rdquo; for the session
                  </Label>
                  <Switch
                    id={`wsd-${role}-allow`}
                    checked={row.allowShowEverything}
                    onCheckedChange={(c) => updateRow(role, { allowShowEverything: c })}
                    disabled={loading || !organiser}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {organiser ? "Modules shown" : "Full mode shows every module"}
                  </Label>
                  <WorkspaceModuleChecklist
                    idPrefix={`wsd-${role}`}
                    value={organiser ? row.modules : NON_ADMIN_MODULE_IDS}
                    onChange={(next) => updateRow(role, { modules: next })}
                    disabled={loading || !organiser}
                    targetIsAdmin={false}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <Button onClick={handleSave} disabled={loading || saving || saveBlocked}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saved ? "Saved!" : saving ? "Saving…" : "Save workspace defaults"}
          </Button>
          {!loadError && emptyOrganiserRoles.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Tick at least one module for{" "}
              {emptyOrganiserRoles.map(({ label }) => label).join(", ")} — an Organiser row
              with nothing ticked cannot be saved.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
