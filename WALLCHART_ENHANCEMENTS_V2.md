# Wall chart enhancements — v2

Follow-up to the v1 wall-chart restructure (PR `claude/ecstatic-haibt`). Three gaps
surfaced on first use:

1. **Worker tiles can't be reallocated between organising units** — the only way
   to change a worker's unit today is via the Units tab inside the detail sheet,
   which is slow for bulk re-orgs.
2. **Relationships can only be built one worker at a time** — adding ten workers
   to a delegate's leader circle takes ten trips through a dropdown.
3. **When adding relationships, the user can't see which candidate workers are
   already co-located with the leader's organising unit(s)** — the most common
   real-world pattern (delegate leads the people on their shift) is the
   hardest one to execute.

This plan addresses all three. No schema changes; all three features ride on
existing tables (`campaign_worker_ou`, `campaign_leader_worker_links`).

---

## Scope

**In scope**
- Drag-and-drop **move** of a worker tile between unit cards (and to the
  Unassigned pseudo-unit).
- Shift-drag to **copy** instead of move (matches the existing right-click
  "Copy to unit" behaviour).
- Multi-select inside a unit card, so that drag carries multiple workers.
- Bulk-add flow in the Relationships tab, with the leader's unit-mates surfaced
  first and pre-selectable.
- Visual signal on candidate workers inside the add-link picker: a chip showing
  which unit(s) they share with the leader.

**Out of scope**
- Automatic / rule-based linking (e.g. "auto-link every new worker in this unit
  to the delegate"). Easy to add later; needs product sign-off on semantics
  (one leader per unit? multiple? what happens on role change?). Flagged as a
  follow-up in the "Open questions" section.
- Drag-and-drop re-ordering within a unit (current sort is filter-driven; a
  manual sort would need a `sort_order` column).
- Cross-campaign worker moves.

---

## Dependency decision

DnD library: **native HTML5 drag-and-drop**, no new dependency.

Rationale: the interaction is list → list, no nested-sortable or virtualised
surfaces, no need for pointer-sensor tuning. Native events give us multi-select
drag, keyboard accessibility via explicit buttons (see below), and zero bundle
cost. If tablet/touch becomes a requirement later, `@dnd-kit/core` is an easy
drop-in replacement behind the same props.

Keyboard/a11y fallback: the existing tile hover menu (`⋯`) gains a
"Move to unit…" action that opens the same dialog used by "Copy to unit…",
but with a "Move" / "Copy" radio. This means every drag action has a
keyboard-and-screen-reader path.

---

## Files to modify / create

| Area | File |
|---|---|
| Main wall chart orchestration | [campaign-wall-chart.tsx](apps/organising-db/src/components/campaigns/campaign-wall-chart.tsx) |
| Worker tile — add DnD + multi-select | [worker-tile.tsx](apps/organising-db/src/components/campaigns/wall-chart/worker-tile.tsx) |
| Unit card — drop target + selection bar | [campaign-unit-card.tsx](apps/organising-db/src/components/campaigns/wall-chart/campaign-unit-card.tsx) |
| Copy dialog — extend to Move/Copy | [copy-worker-to-unit-dialog.tsx](apps/organising-db/src/components/campaigns/wall-chart/copy-worker-to-unit-dialog.tsx) |
| Relationships tab — bulk add + unit-mate surfacing | [worker-relationships-tab.tsx](apps/organising-db/src/components/campaigns/wall-chart/worker-relationships-tab.tsx) |
| Leader links hooks — add bulk insert | [use-leader-links.ts](apps/organising-db/src/components/campaigns/wall-chart/use-leader-links.ts) |

New files:

- `wall-chart/use-wall-chart-selection.ts` — small context/hook for
  wall-chart-wide multi-selection (selected worker ids across cards).
- `wall-chart/move-worker-mutation.ts` — shared mutation handling the
  source-remove + target-add for a MOVE, including `is_primary` semantics.
- `wall-chart/bulk-add-followers-dialog.tsx` — the multi-select picker used in
  the Relationships tab.
- `wall-chart/leader-unit-context.ts` — helper that, given a leader's
  worker_id and a campaign's `campaign_worker_ou` rows, returns the set of
  unit ids the leader is in and a `(workerId) => string[]` function for
  shared-unit chips.

---

## Feature 1 — Drag-and-drop reallocation

### Interaction model

- **Drag** a single tile from unit A → unit B ⇒ **Move** (A loses the row, B
  gains it). Primary flag follows: if the dragged row was primary, the new row
  is primary and any other primary on the same worker in the campaign is
  cleared.
- **Shift + drag** ⇒ **Copy** (existing `campaign_worker_ou` row unchanged,
  new row inserted in target; new row is non-primary). This matches the
  existing right-click action and keeps the data-model semantics identical.
- **Drop on "Unassigned" pseudo-unit** ⇒ remove all `campaign_worker_ou` rows
  for the worker in this campaign (worker stays in the campaign via
  `campaign_worker_membership` but sits in the unassigned grid).
- **Drag a selected tile** (see multi-select below) ⇒ drag carries every
  currently-selected worker. Source unit is inferred per-worker (selections
  can span units for a batch move to a common destination).

### Multi-select

A single click still opens the detail sheet (current behaviour — no regression).

`⌘/Ctrl + click` or `Shift + click` toggles selection. When ≥1 tile is
selected, a thin selection bar appears above the wall chart:

```
3 workers selected   [Move to unit ▾]  [Copy to unit ▾]  [Link to leader ▾]  [Clear]
```

Selected tiles get an outlined highlight. Clicking a non-selected tile while
a selection exists clears the selection and selects just that tile.

`use-wall-chart-selection.ts` keeps a `Set<number>` in state and exposes
`toggle`, `clear`, `selectOnly`, `has`. Scoped to the wall-chart tree
(passed by prop, no global context needed).

### Drop targets

`campaign-unit-card.tsx` gains `onDragOver` / `onDrop` handlers. While a drag
is in progress the target card shows a dashed outline and a small
"Move here / Copy here" tag following the cursor (via an ephemeral
`dragEffect: "move" | "copy"` state held at the wall-chart level).

`dataTransfer.setData("application/json", JSON.stringify({ workerIds, sourceOuId }))`
on drag start. On drop we parse, call the move mutation, then clear
selection.

### Mutation — `move-worker-mutation.ts`

```ts
// Move N workers to targetOuId, optionally keeping source rows (copy).
useMoveWorkersMutation({
  campaignId,
  mode: "move" | "copy",
  workerIds: number[],
  targetOuId: number | null,  // null = unassigned
  fromOuId: number | null,    // for single-source moves; else "all"
})
```

Implementation (single Supabase RPC? or sequential client calls?):

- **Simple, no-RPC path (phase 1):** batch the client-side calls —
  `delete` for move, then `insert` for the target row, wrapped in a single
  `useAuthAwareMutation`. Each step invalidates
  `["campaign-worker-ou", campaignId]`. Acceptable: the failure case (insert
  succeeds, delete fails or vice-versa) is low-risk because the unique
  constraint `(ou_id, worker_id)` makes retries idempotent.
- **RPC path (deferred):** if atomicity becomes important, add a `plpgsql`
  function `move_workers_between_ous(campaign_id, worker_ids[], from_ou_id,
  to_ou_id, mode)` in a follow-up migration. Not needed for v2.

Edge case — **drop on same unit**: no-op, dismiss.

Edge case — **drop into a unit where the worker already exists (copy)**:
skip that worker (unique constraint would fail anyway), surface a small
toast "3 workers added, 1 already in this unit".

### Visual states

- Tile during drag: opacity 0.6, slight scale-down.
- Target unit card: `ring-2 ring-primary` while a valid drop is hovering.
- Invalid target (same unit as source, single worker only): `ring-2 ring-destructive/60`.
- Selection bar: sticky at the top of the wall-chart card, inside `CardContent`
  above the unit container.

### Accessibility path (no mouse)

1. `⋯` menu on tile (shown on hover + focus) gains "Move to unit…" and
   "Link to leader…".
2. With multi-select, the selection bar's "Move to unit ▾" opens the same
   picker dialog.
3. Space + Arrow navigation is **not** implemented in phase 1; the dialog
   path covers keyboard users.

---

## Feature 2 — Bulk add in Relationships

### Current state

The Relationships tab's `AddFollowerLinkForm` uses a single `<Select>` to pick
one worker. Fetches `campaign_worker_membership` for the campaign and filters
out the leader + already-linked workers.

### New UX — in-tab picker with multi-select

Replace the inline form with a `BulkAddFollowersDialog` trigger. Inside the
dialog:

```
Add workers to {Leader name}

[✓ Show only workers in my unit(s) (Shift: 12, Crew 3: 8)] ← default ON
[    Search…                                             ]

Suggested from your units
  ▢ All 12 workers in Shift (not already linked)          [Select all]
  ▢ Angela Tran           Shift              Rating: 2
  ▢ Ben Li                Shift              Rating: —
  ...
Other campaign workers
  ▢ Carla Stevens         Crew 1             Rating: 3
  ...

Notes (applied to every new link, optional)
[                                                        ]

           [Cancel]   [Add 5 links]
```

Key behaviours:

- The "in my unit(s)" toggle is derived from the leader's
  `campaign_worker_ou` rows via `leader-unit-context.ts`.
- Candidates grouped by **Suggested / Other**. Each candidate row shows a
  unit chip — if the candidate is in one of the leader's units, that chip is
  highlighted (primary/200 background). That resolves gap 3 even when the
  toggle is off.
- "Select all in group" checkbox at group header level.
- Workers already linked to this leader are not shown. Workers not in the
  campaign are not shown.
- Submitting runs a single bulk insert (see mutation below). On success,
  close dialog and invalidate
  `["leader-links", "leader", campaignId, leaderWorkerId]`.

### Bulk insert — `useBulkCreateLeaderLinks`

Extend `use-leader-links.ts`:

```ts
export function useBulkCreateLeaderLinks(campaignId: string | number) {
  return useAuthAwareMutation({
    mutationFn: async (vars: {
      leader_worker_id: number;
      follower_worker_ids: number[];
      notes?: string | null;
    }) => {
      if (vars.follower_worker_ids.length === 0) return;
      const rows = vars.follower_worker_ids.map((id) => ({
        campaign_id: Number(campaignId),
        leader_worker_id: vars.leader_worker_id,
        follower_worker_id: id,
        notes: vars.notes ?? null,
      }));
      const { error } = await supabase
        .from("campaign_leader_worker_links")
        .insert(rows);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leader-links"] }),
  });
}
```

### Selection-bar shortcut

The multi-select selection bar introduced in Feature 1 gets a third action:
"Link to leader ▾". This opens a small dialog asking **which leader** to
link the currently-selected workers to, with the leader search scoped to
workers whose `member_role_type_id` is a leader role (7/8) or who have
`is_bargaining_rep`/`is_hsr`. Submitting reuses `useBulkCreateLeaderLinks`.

This gives organisers a reverse flow: select the workers first, then pick
the leader — useful when walking a unit card ("link these five to Angela").

---

## Feature 3 — Surface the leader's unit-mates

Fully handled by the `leader-unit-context.ts` helper and the picker UI above.
The key piece is this function, exposed so it can be reused elsewhere (e.g.
worker list, task-list builder):

```ts
// leader-unit-context.ts
export function useLeaderUnitContext(args: {
  campaignId: string | number;
  leaderWorkerId: number;
}): {
  leaderOuIds: Set<number>;            // units the leader is in
  isSharedUnit: (workerId: number) => boolean;
  sharedUnitNames: (workerId: number) => string[];
  candidatesInLeaderUnits: Set<number>;  // workers in any of the leader's units
}
```

Driven off the already-cached queries:
`["campaign-ous", campaignId]` and `["campaign-worker-ou", campaignId]`.
No new Supabase fetches needed.

**Visual cue inside the Relationships tab (outside the picker)** — each
existing link row also gets a small "same unit" chip when leader and
follower share at least one `campaign_worker_ou`, so a glance tells the
organiser which relationships cross units. This mirrors the cross-unit chip
the v1 plan described but never wired in the sheet.

---

## Implementation phases

Shippable in order; wall chart stays functional between phases.

| Phase | Goal |
|---|---|
| **v2.1** | Multi-select + selection bar (no DnD yet). The selection bar's Move/Copy/Link buttons open existing dialogs. This alone unlocks bulk workflows through keyboard-accessible UI. |
| **v2.2** | Native HTML5 DnD wired to move/copy mutation. Selection bar gains its "Link to leader" picker. |
| **v2.3** | Bulk-add dialog in the Relationships tab, with the leader-unit-context helper powering the "Suggested from your units" section. |
| **v2.4** | Same-unit chips on existing link rows + candidate rows in the picker. |

Optional follow-ups (separate plan):
- Rule-based default linking on worker assignment.
- Atomic RPC for move operations if audit/concurrency matters.
- Touch / pointer-sensor DnD via `@dnd-kit/core`.

---

## Verification

For each phase:

1. `pnpm --filter organising-db dev`, open a campaign with ≥2 OUs,
   ≥20 workers, ≥1 leader with followers linked.
2. **Multi-select:** ⌘-click three tiles across two unit cards → selection
   bar shows "3 workers selected".
3. **Move (DnD):** drag a single tile to another unit → row moves,
   `campaign_worker_ou` reflects the change, multi-unit badge clears on
   the source.
4. **Copy (Shift+DnD):** Shift-drag the same tile elsewhere → new row
   appears, multi-unit badge shows on both locations.
5. **Bulk move:** select five tiles, drag → all five appear in target unit;
   their source rows are gone.
6. **Drop on Unassigned:** drag a tile into the Unassigned pseudo-unit →
   all `campaign_worker_ou` rows for that worker in this campaign are
   deleted; tile appears in Unassigned.
7. **Relationships — bulk add:** open the sheet for a leader whose primary
   unit has ≥5 unlinked workers. Toggle on "Show only workers in my unit(s)"
   → list narrows to unit-mates; Select All + Add links inserts all of them
   in one call.
8. **Shared-unit chip:** after bulk add, existing link rows that share a
   unit with the leader show the chip; ones that don't, don't.
9. **Accessibility:** with the keyboard only, perform a move via the
   selection bar + dialog; perform a bulk link-add via the in-tab picker.

### Backend sanity

- `SELECT COUNT(*) FROM campaign_worker_ou WHERE campaign_id = X` before /
  after a move should match (move is delete + insert of equal count).
- `SELECT COUNT(*) FROM campaign_leader_worker_links WHERE campaign_id = X
  AND leader_worker_id = L` should increase by exactly N after a bulk add
  of N workers.
- RLS sanity: a viewer without `admin`/`user` role cannot invoke any of
  these writes from the browser (`insert`/`delete` should 403).

---

## Open questions (for product, not blocking implementation)

1. **Default linking on worker creation / unit assignment.** When a worker is
   added to a unit that has a delegate, should the worker auto-link to that
   delegate? Options:
   - None (current).
   - Auto-link to the delegate(s) of their primary unit only.
   - Auto-link to every leader (delegate/activist) in their primary unit.
   The cleanest implementation is a trigger on `campaign_worker_ou` INSERT,
   but it interacts with role changes (what if the delegate steps down?).
   Flagged for future plan.

2. **Leader scope on "Link to leader" picker.** Should this include
   Activists and Contacts, or Delegates only? v2 implementation will
   include all three (plus `is_bargaining_rep` / `is_hsr`) — easy to
   tighten later.

3. **Drag-to-unmapped.** Currently the campaign-level unmapped grid is
   purely a visual representation of "estimate − named" gaps. Should it
   accept drops? Leaning no — the worker would still be in
   `campaign_worker_membership`, so it'd just land in Unassigned anyway.
   v2 drops on Unassigned only.
