"use client";

// WP1.1 — `useWorkspace()` and its provider.
//
// Plumbing only: the whole decision is `resolveWorkspace()` (pure, tested).
// Inputs are the auth context (role, work_role, workspace_prefs) and the
// org-wide defaults RPC; the session "Show everything" toggle is plain
// React state so it resets on reload (plan 5.2: "for the session"; never
// localStorage or sessionStorage).
//
// Nothing in WP1.1 consumes this hook — navigation (WP1.2) and the campaign
// page (WP1.4) do. Workspace mode is presentation, never permission.

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/supabase/auth-context";
import { useWorkspaceDefaults } from "@/lib/hooks/useWorkspaceDefaults";
import { type WorkspaceModuleId } from "./modules";
import {
  moduleStateFor,
  modulesForRole,
  resolveWorkspace,
  type ModuleState,
  type WorkspaceMode,
  type WorkspaceSource,
} from "./resolve";

// The type and the rule both live in `resolve.ts` (pure, so the
// `environment: node` suites can import the real one instead of retyping it);
// re-exported here because this is where consumers already reach for them.
export type { ModuleState };

export interface WorkspaceContextValue {
  mode: WorkspaceMode;
  enabledModules: Set<WorkspaceModuleId>;
  canShowEverything: boolean;
  /** The session toggle's current value. */
  showEverything: boolean;
  setShowEverything: (v: boolean) => void;
  isModuleEnabled: (id: WorkspaceModuleId) => boolean;
  /** `"on"` when enabled; otherwise the module's registry `offState`. */
  moduleState: (id: WorkspaceModuleId) => ModuleState;
  source: WorkspaceSource;
  /** Auth or org defaults still loading; the resolver already returns full meanwhile. */
  loading: boolean;
}

// Outside the provider (token-based /call/ and /leader/ routes) behave as
// full mode for a non-admin rather than throwing.
const DEFAULT_MODULES = modulesForRole("user");
const DEFAULT_VALUE: WorkspaceContextValue = {
  mode: "full",
  enabledModules: DEFAULT_MODULES,
  canShowEverything: false,
  showEverything: false,
  setShowEverything: () => {},
  isModuleEnabled: (id) => DEFAULT_MODULES.has(id),
  moduleState: (id) => moduleStateFor(DEFAULT_MODULES, id),
  source: "default",
  loading: false,
};

const WorkspaceContext = createContext<WorkspaceContextValue>(DEFAULT_VALUE);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { role, profile, loading: authLoading } = useAuth();
  const defaultsQuery = useWorkspaceDefaults();
  const [showEverything, setShowEverything] = useState(false);

  const orgDefaults = defaultsQuery.data;
  const workRole = profile?.work_role ?? null;
  const userPrefs = profile?.workspace_prefs;
  const hasProfile = profile != null;
  const loading = authLoading || defaultsQuery.isLoading;

  const value = useMemo<WorkspaceContextValue>(() => {
    // A live session with no profile (fetchProfile gave up) must read as
    // "no prefs" → full, never as organiser mode with an empty shell.
    const resolved = resolveWorkspace({
      role,
      workRole,
      orgDefaults: hasProfile ? orgDefaults : undefined,
      userPrefs: hasProfile ? userPrefs : undefined,
      sessionShowEverything: showEverything,
    });
    return {
      ...resolved,
      showEverything,
      setShowEverything,
      isModuleEnabled: (id) => resolved.enabledModules.has(id),
      moduleState: (id) => moduleStateFor(resolved.enabledModules, id),
      loading,
    };
  }, [role, workRole, orgDefaults, userPrefs, hasProfile, showEverything, loading]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}
