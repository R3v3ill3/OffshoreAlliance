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
  droppedRoleKeys,
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
  // The GET succeeded but the stored document is not a workspace-defaults
  // document at all (`parseWorkspaceDefaults` rejected it at the top level).
  // Saving would overwrite it, so only the explicit "Reset to defaults" button
  // may do that.
  const [malformed, setMalformed] = useState(false);
  // Work-role keys the lenient reader discarded. `documentFromRows` writes all
  // six roles back, so these are what a save would drop — say so out loud.
  const [droppedRoles, setDroppedRoles] = useState<string[]>([]);

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
        if (cancelled) return;
        const parsed = parseWorkspaceDefaults(json);
        if (parsed === null) {
          // Not "nothing stored" — the route returns `{}` for that, which
          // parses. Something unusable is stored.
          setMalformed(true);
          setDroppedRoles([]);
          setLoadError(null);
          return;
        }
        setRows(rowsFromDocument(parsed));
        setDroppedRoles(droppedRoleKeys(json));
        setMalformed(false);
        setLoadError(null);
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
  const saveBlocked = loadError !== null || malformed || emptyOrganiserRoles.length > 0;
  // While the document could not be read, the rows below are only the
  // all-`full` seed: do not let them be edited as if they were the stored one.
  const editingDisabled = loading || malformed || loadError !== null;

  const putDocument = async (doc: WorkspaceDefaults) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetchApi("/api/admin/workspace-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(doc),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Save failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (saveBlocked) return;
    await putDocument(documentFromRows(rows));
  };

  // The only way to overwrite a malformed stored document from the UI.
  const handleReset = async () => {
    if (
      !window.confirm(
        "Replace the stored workspace defaults with Full for every work role? " +
          "The malformed document that is stored now will be lost."
      )
    )
      return;
    const fresh = rowsFromDocument(null);
    if (await putDocument(documentFromRows(fresh))) {
      setRows(fresh);
      setMalformed(false);
      setDroppedRoles([]);
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
        {loadError && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {loadError}. Reload the page before saving — saving now would overwrite the
            stored defaults.
          </div>
        )}

        {malformed && (
          <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                The stored workspace defaults document is malformed, so the rows below are
                not what is stored and saving is blocked. Repair it in SQL
                (<code>app_settings.workspace_defaults</code>), or use Reset to defaults to
                replace it with Full for every work role.
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={handleReset} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Reset to defaults
            </Button>
          </div>
        )}

        {!malformed && droppedRoles.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              The stored document has entries this editor could not read (
              {droppedRoles.join(", ")}). They are not shown below, and saving replaces the
              whole document — those entries would be discarded.
            </span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
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
                    disabled={editingDisabled}
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
                    disabled={editingDisabled || !organiser}
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
                    disabled={editingDisabled || !organiser}
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
