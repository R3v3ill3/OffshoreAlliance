"use client";

// WP1.1 — the module checklist shared by the per-user editor
// (Administration → Users) and the org-defaults card (Administration →
// Settings). Rows come from the registry; labels use plan-3.6 wording and
// each description is the plan's "Contains" column, so no new copy.

import { Checkbox } from "@/components/ui/checkbox";
import { MODULES, type WorkspaceModuleId } from "@/lib/workspace/modules";

export interface WorkspaceModuleChecklistProps {
  /** The ids currently ticked. */
  value: readonly WorkspaceModuleId[];
  onChange: (next: WorkspaceModuleId[]) => void;
  /** Disables every row (e.g. while following the role default, or in full mode). */
  disabled?: boolean;
  /** When false, `adminOnly` rows are disabled and marked "Admins only". */
  targetIsAdmin?: boolean;
  /** Prefix for element ids so several checklists can share a page. */
  idPrefix: string;
}

export function WorkspaceModuleChecklist({
  value,
  onChange,
  disabled = false,
  targetIsAdmin = false,
  idPrefix,
}: WorkspaceModuleChecklistProps) {
  const selected = new Set(value);

  const toggle = (id: WorkspaceModuleId, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    // Keep registry order so the stored list is stable and diffs are readable.
    onChange(MODULES.filter((m) => next.has(m.id)).map((m) => m.id));
  };

  return (
    <ul className="space-y-2">
      {MODULES.map((m) => {
        const adminLocked = m.adminOnly && !targetIsAdmin;
        const rowDisabled = disabled || adminLocked;
        const elementId = `${idPrefix}-${m.id}`;
        return (
          <li key={m.id} className="flex items-start gap-2">
            <Checkbox
              id={elementId}
              checked={selected.has(m.id) && !adminLocked}
              disabled={rowDisabled}
              onCheckedChange={(c) => toggle(m.id, c === true)}
              className="mt-0.5"
            />
            <label
              htmlFor={elementId}
              className={rowDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}
            >
              <span className="text-sm font-medium leading-none">
                {m.label}
                {adminLocked && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    Admins only
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{m.description}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
