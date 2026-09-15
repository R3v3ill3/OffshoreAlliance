"use client";

// WP2.4 (FL-b, docs/organiser-ux-review/wp/wp2.4.md §3.2) — the ONE reader of
// the `groups_v2` flag.
//
// The flag is per user: `user_profiles.workspace_prefs.flags.groups_v2`, set
// by an admin in Administration → Users, resolved by `resolveWorkspace()`
// rule R11 and exposed as `useWorkspace().flags.groupsV2`. Default off.
// Consumers: `workforce/workforce-board.tsx` (which wall-chart shell to
// mount) and nothing else — the §5 grep proves it. WP2.8 deletes this module
// with the legacy chart.

import { useWorkspace } from "@/lib/workspace/use-workspace";
import type { WorkspaceFlags } from "@/lib/workspace/resolve";

/** Pure form, for code that already holds the resolved flags. */
export function isGroupsV2(flags: Pick<WorkspaceFlags, "groupsV2"> | null | undefined): boolean {
  return flags?.groupsV2 === true;
}

/** True when the signed-in user has the `groups_v2` preview flag. */
export function useGroupsV2(): boolean {
  return isGroupsV2(useWorkspace().flags);
}
