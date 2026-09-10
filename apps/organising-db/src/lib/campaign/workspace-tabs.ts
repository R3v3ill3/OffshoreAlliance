/**
 * workspace-tabs.ts — WP1.4.
 *
 * Which campaign tab bar a user sees, as one pure function. No React, no
 * `next/*`, no I/O; every rule is numbered (V1–V9) and has a test case in
 * ./__tests__/workspace-tabs.test.ts.
 *
 * Two models come out of the same registry:
 *
 *   full mode      the eight tabs and twenty sub-tabs the page renders
 *                  today, unchanged, every one `on`. This is the default
 *                  for everyone, and it is also what "Show everything"
 *                  produces (resolveWorkspace flips `mode` to `full`).
 *   organiser mode plan 5.4's four tabs — Wall chart, People, Activity,
 *                  Setup — plus More, which holds every registry surface
 *                  the four do not already reach.
 *
 * The rule that makes this safe: **workspace mode is presentation, never
 * permission.** Every ?tab=&sub= value that resolves today resolves
 * identically in organiser mode and renders the same component. More is
 * navigation, not a gate; a deep link to a surface whose module is off
 * still renders, and the More trigger carries its label so the user can
 * see where they are.
 */

import {
  CAMPAIGN_TAB_REGISTRY,
  resolveTabParams,
  type CampaignTabDef,
} from "@/lib/campaign-tabs";
import type { WorkspaceModuleId } from "@/lib/workspace/modules";
import type { ModuleState, WorkspaceMode } from "@/lib/workspace/resolve";
import type { WorkforceView } from "@/lib/campaign/workforce-view";

/**
 * Plan 5.4's four tabs plus the overflow. All five labels live in this one
 * constant so the WP0.5 tree test can rename them without touching a
 * component. Terminology is plan 3.6's: "Wall chart", not "Wall Chart".
 */
export const ORGANISER_TAB_LABELS = {
  wall_chart: "Wall chart",
  people: "People",
  activity: "Activity",
  setup: "Setup",
  more: "More",
} as const;

/** The organiser-mode tab ids, in bar order. */
export const ORGANISER_TAB_IDS = ["wall-chart", "people", "activity", "setup"] as const;
export type OrganiserTabId = (typeof ORGANISER_TAB_IDS)[number];

/** A campaign surface, addressed the way the URL addresses it. */
export interface CampaignSurfaceRef {
  tab: string;
  sub: string | null;
  /** Extra query params to write on navigation, e.g. `{ view: "list" }`. */
  params?: Readonly<Record<string, string>>;
}

export interface CampaignSubTabModel {
  /** Organiser mode: unique within the tab. Full mode: the ?sub= value. */
  id: string;
  label: string;
  module: WorkspaceModuleId;
  state: ModuleState;
  href: CampaignSurfaceRef;
}

export interface CampaignTabModel {
  id: string;
  label: string;
  module: WorkspaceModuleId;
  state: ModuleState;
  href: CampaignSurfaceRef;
  subs: readonly CampaignSubTabModel[];
}

export interface CampaignNavModel {
  mode: WorkspaceMode;
  /** Primary tab bar. Full mode: 8 (7 when the phase gate fails). Organiser: 4. */
  tabs: readonly CampaignTabModel[];
  /** Organiser mode only; always [] in full mode. */
  more: readonly CampaignTabModel[];
  /** Which primary tab is active, or null when the active surface lives in More. */
  activeTabId: string | null;
  /** Which sub-item is active within `activeTabId`, or null. */
  activeSubId: string | null;
  /** Label for the More trigger when activeTabId === null (e.g. "Pending review"). */
  activeMoreLabel: string | null;
}

export interface ResolveVisibleTabsInput {
  mode: WorkspaceMode;
  /** `useWorkspace().moduleState` — the one hidden-vs-muted rule (V4). */
  moduleState: (id: WorkspaceModuleId) => ModuleState;
  /** campaigns.current_phase; gates Bargaining exactly as page.tsx does today. */
  phase: string | null;
  /** The campaign has ≥1 stage plan. Drives the Setup card's copy only (V9). */
  hasPlan: boolean;
  /** The resolved URL surface, from resolveTabParams(). */
  active: { tab: string; sub: string | null };
  /** From ?view=, already resolved by resolveWorkforceView(). */
  activeView: WorkforceView;
}

// ── the registry, indexed ───────────────────────────────────────────────

const TAB_BY_ID = new Map(CAMPAIGN_TAB_REGISTRY.map((t) => [t.tab, t]));

/** V2 — the Bargaining phase gate, mode-independent. */
function passesPhaseGate(tab: CampaignTabDef, phase: string | null): boolean {
  return tab.requiresPhase == null || tab.requiresPhase === phase;
}

/** The href a full-mode tab points at: itself plus its default (first) sub. */
function tabHref(tab: CampaignTabDef): CampaignSurfaceRef {
  return { tab: tab.tab, sub: tab.subs[0]?.sub ?? null };
}

/**
 * The module that owns a surface. Total over every registry pair: an
 * unknown pair returns null rather than throwing. `(tab, null)` on a
 * cluster tab is normalised through resolveTabParams first, exactly as
 * the page does.
 */
export function moduleForSurface(
  tab: string,
  sub: string | null
): WorkspaceModuleId | null {
  const norm = normalise(tab, sub);
  const def = TAB_BY_ID.get(norm.tab);
  if (!def) return null;
  if (norm.sub == null) return def.module;
  return def.subs.find((s) => s.sub === norm.sub)?.module ?? null;
}

/**
 * The registry label of a level-1 tab, *without* normalising to its default
 * sub-tab. `labelForSurface("plan", null)` answers "Strategy" because that
 * is where the URL lands; the cluster's own panel wants "Plan & Execution".
 */
export function labelForTab(tab: string): string | null {
  return TAB_BY_ID.get(tab)?.label ?? null;
}

/** The registry label of a surface — the sub's when there is one, else the tab's. */
export function labelForSurface(tab: string, sub: string | null): string | null {
  const norm = normalise(tab, sub);
  const def = TAB_BY_ID.get(norm.tab);
  if (!def) return null;
  if (norm.sub == null) return def.label;
  return def.subs.find((s) => s.sub === norm.sub)?.label ?? null;
}

/**
 * Normalise a `(tab, sub)` pair the way the page's redirect effect does,
 * so a level-1 reference like `("plan", null)` answers as its default
 * sub-tab rather than as a surface nothing points at.
 */
function normalise(tab: string, sub: string | null): { tab: string; sub: string | null } {
  return resolveTabParams(tab, sub);
}

// ── the organiser model ─────────────────────────────────────────────────

interface OrganiserSubSpec {
  id: string;
  /** Registry pair this sub-item points at. */
  tab: string;
  sub: string;
  /** Overrides the registry label; plan 3.6 terminology (e.g. "Units"). */
  label?: string;
}

interface OrganiserTabSpec {
  id: OrganiserTabId;
  label: string;
  module: WorkspaceModuleId;
  href: CampaignSurfaceRef;
  subs: readonly OrganiserSubSpec[];
}

/**
 * V3 — plan 5.4's four tabs, every target an existing ?tab=&sub= pair.
 *
 * People is `sub=wall-chart` with `view=list`, not a new ?sub=:
 * WorkforceBoard already owns the layout toggle and reads ?view=, so
 * minting a second sub id would give one component two URLs and break the
 * device default WP0.3 shipped. Both tabs write ?view= explicitly so a
 * click is never ambiguous.
 *
 * Activity is a tab over the seven existing surfaces, not the chronological
 * list plan 5.4 sketches — that list is a new union query over five tables
 * and belongs to WP3. Said plainly here so nobody reads more into the tab
 * than it does.
 */
const ORGANISER_TABS: readonly OrganiserTabSpec[] = [
  {
    id: "wall-chart",
    label: ORGANISER_TAB_LABELS.wall_chart,
    module: "wall_chart_people",
    href: { tab: "workforce", sub: "wall-chart", params: { view: "wall-chart" } },
    subs: [],
  },
  {
    id: "people",
    label: ORGANISER_TAB_LABELS.people,
    module: "wall_chart_people",
    href: { tab: "workforce", sub: "wall-chart", params: { view: "list" } },
    subs: [],
  },
  {
    id: "activity",
    label: ORGANISER_TAB_LABELS.activity,
    module: "actions",
    href: { tab: "outreach", sub: "comms" },
    subs: [
      { id: "comms", tab: "outreach", sub: "comms" },
      { id: "phone", tab: "outreach", sub: "phone" },
      { id: "sms", tab: "outreach", sub: "sms" },
      { id: "soc", tab: "outreach", sub: "soc" },
      { id: "assessments", tab: "workforce", sub: "assessments" },
      { id: "task-lists", tab: "plan", sub: "task-lists" },
      { id: "actions", tab: "plan", sub: "actions" },
    ],
  },
  {
    id: "setup",
    label: ORGANISER_TAB_LABELS.setup,
    module: "setup",
    href: { tab: "workforce", sub: "universe" },
    subs: [
      { id: "universe", tab: "workforce", sub: "universe" },
      // Plan 3.6 says "Unit"; the full-mode trigger still reads
      // "Campaign Units" and is not renamed here (WP2.7 owns that).
      { id: "campaign-units", tab: "workforce", sub: "campaign-units", label: "Units" },
    ],
  },
];

/** Every registry pair the four organiser tabs already reach. */
const ORGANISER_REACHED: ReadonlySet<string> = new Set(
  ORGANISER_TABS.flatMap((t) => [
    pairKey(t.href.tab, t.href.sub),
    ...t.subs.map((s) => pairKey(s.tab, s.sub)),
  ])
);

function pairKey(tab: string, sub: string | null): string {
  return `${tab}/${sub ?? ""}`;
}

/**
 * V7/T10 — which of the four organiser tabs owns the active surface.
 * `activeView` splits Wall chart from People, because the tab bar must
 * describe what is on screen: on a touch device an absent ?view= resolves
 * to `list`, so a bare /campaigns/12 lights People.
 */
export function activeOrganiserTabId(
  active: { tab: string; sub: string | null },
  activeView: WorkforceView
): OrganiserTabId | null {
  const norm = normalise(active.tab, active.sub);
  const key = pairKey(norm.tab, norm.sub);
  if (key === pairKey("workforce", "wall-chart")) {
    return activeView === "list" ? "people" : "wall-chart";
  }
  for (const spec of ORGANISER_TABS) {
    if (pairKey(spec.href.tab, spec.href.sub) === key) return spec.id;
    if (spec.subs.some((s) => pairKey(s.tab, s.sub) === key)) return spec.id;
  }
  return null;
}

// ── the resolver ────────────────────────────────────────────────────────

export function resolveVisibleTabs(input: ResolveVisibleTabsInput): CampaignNavModel {
  const { mode, moduleState, phase, active, activeView } = input;
  const gated = CAMPAIGN_TAB_REGISTRY.filter((t) => passesPhaseGate(t, phase));

  if (mode === "full") {
    // V1 — full mode is the registry, unchanged. `moduleState` is not
    // consulted: resolveWorkspace already guarantees full mode means every
    // module the role may see.
    const tabs: CampaignTabModel[] = gated.map((t) => ({
      id: t.tab,
      label: t.label,
      module: t.module,
      state: "on" as const,
      href: tabHref(t),
      subs: t.subs.map((s) => ({
        id: s.sub,
        label: s.label,
        module: s.module,
        state: "on" as const,
        href: { tab: t.tab, sub: s.sub, ...(s.params ? { params: s.params } : {}) },
      })),
    }));
    const norm = normalise(active.tab, active.sub);
    return {
      mode,
      tabs,
      more: [],
      activeTabId: norm.tab,
      activeSubId: norm.sub,
      activeMoreLabel: null,
    };
  }

  // V3/V4/V5 — the four tabs, each in its module's state, never removed.
  const tabs: CampaignTabModel[] = ORGANISER_TABS.map((spec) => ({
    id: spec.id,
    label: spec.label,
    module: spec.module,
    state: moduleState(spec.module),
    href: spec.href,
    subs: spec.subs.map((s) => {
      const owner = moduleForSurface(s.tab, s.sub) ?? spec.module;
      return {
        id: s.id,
        label: s.label ?? labelForSurface(s.tab, s.sub) ?? s.id,
        module: owner,
        state: moduleState(owner),
        href: { tab: s.tab, sub: s.sub },
      };
    }),
  }));

  // V6 — More is the registry minus what the four tabs already reach,
  // grouped by registry tab, in registry order, hidden items dropped.
  const more: CampaignTabModel[] = [];
  for (const t of gated) {
    if (t.subs.length === 0) {
      if (ORGANISER_REACHED.has(pairKey(t.tab, null))) continue;
      const state = moduleState(t.module);
      if (state === "hidden") continue;
      more.push({
        id: t.tab,
        label: t.label,
        module: t.module,
        state,
        href: tabHref(t),
        subs: [],
      });
      continue;
    }
    const subs: CampaignSubTabModel[] = [];
    for (const s of t.subs) {
      if (ORGANISER_REACHED.has(pairKey(t.tab, s.sub))) continue;
      const state = moduleState(s.module);
      if (state === "hidden") continue;
      subs.push({
        id: s.sub,
        label: s.label,
        module: s.module,
        state,
        href: { tab: t.tab, sub: s.sub, ...(s.params ? { params: s.params } : {}) },
      });
    }
    if (subs.length === 0) continue;
    more.push({
      id: t.tab,
      label: t.label,
      module: t.module,
      state: moduleState(t.module),
      href: { tab: t.tab, sub: subs[0].href.sub },
      subs,
    });
  }

  // V7 — the active tab, or the More trigger's label. V8 — an unknown pair
  // is not an error: both go null and the four tabs still render.
  const activeTabId = activeOrganiserTabId(active, activeView);
  let activeSubId: string | null = null;
  let activeMoreLabel: string | null = null;
  if (activeTabId) {
    const norm = normalise(active.tab, active.sub);
    const key = pairKey(norm.tab, norm.sub);
    const owner = tabs.find((t) => t.id === activeTabId);
    activeSubId = owner?.subs.find((s) => pairKey(s.href.tab, s.href.sub) === key)?.id ?? null;
  } else {
    activeMoreLabel = labelForSurface(active.tab, active.sub);
  }

  return { mode, tabs, more, activeTabId, activeSubId, activeMoreLabel };
}

// ── naming the tabpanels ────────────────────────────────────────────────

/** The label a route's own control carries in the model it was found in. */
function labelForRoute(model: CampaignNavModel, route: SurfaceRoute | null): string | null {
  if (!route) return null;
  const group = route.via === "more" ? model.more : model.tabs;
  const owner = group.find((t) => t.id === route.tabId);
  if (!owner) return null;
  if (route.via === "tab") return owner.label;
  if (route.subId == null) return owner.label;
  return owner.subs.find((s) => s.id === route.subId)?.label ?? owner.label;
}

/**
 * The label of the control that is currently lit, when it is the one that
 * leads to `surface`. This is what settles Wall chart vs People: one
 * registry pair, two organiser tabs, split by ?view=, so the panel on
 * screen must be named after whichever tab is lit rather than after the
 * pair. A `sub: null` reference asks about a cluster panel, which the lit
 * control answers whenever the lit surface lives inside that cluster.
 */
function litLabel(
  model: CampaignNavModel,
  surface: { tab: string; sub: string | null }
): string | null {
  const owner = model.tabs.find((t) => t.id === model.activeTabId);
  if (!owner) return null;
  const target =
    model.activeSubId == null
      ? owner
      : owner.subs.find((s) => s.id === model.activeSubId);
  if (!target) return null;
  const litSurface = normalise(target.href.tab, target.href.sub);
  if (surface.sub == null) {
    // A cluster answers with the lit *tab*, so the outer panel reads
    // "Activity" and the inner one "Comms" rather than both saying "Comms".
    return litSurface.tab === surface.tab ? owner.label : null;
  }
  const norm = normalise(surface.tab, surface.sub);
  return pairKey(litSurface.tab, litSurface.sub) === pairKey(norm.tab, norm.sub)
    ? target.label
    : null;
}

/**
 * WP1.4 fix round 2. The accessible name for a campaign `TabsContent`.
 *
 * Radix names a tabpanel with `aria-labelledby` pointing at its trigger;
 * organiser mode renders a <nav> of plain buttons instead of TabsTriggers,
 * so that reference dangles and the panel has to be named directly. The
 * name must come from the model **on screen** — "Wall chart", "People",
 * "Units" — not from the full-mode registry, whose labels ("Workforce",
 * "Campaign Units") an organiser never sees.
 *
 * Returns `null` in full mode: the trigger names the panel there and the
 * caller must add no attribute at all, keeping the markup byte-identical.
 *
 * `sub: null` asks about a cluster panel (the `<TabsContent value="plan">`
 * that wraps the sub-panels), which is named by the lit organiser control
 * inside it, else by the cluster's own registry label — which is also the
 * heading More files it under, so the two agree.
 */
export function panelLabelFor(
  model: CampaignNavModel,
  surface: { tab: string; sub: string | null }
): string | null {
  if (model.mode !== "organiser") return null;

  const lit = litLabel(model, surface);
  if (lit) return lit;

  if (surface.sub == null) return labelForTab(surface.tab);

  return (
    labelForRoute(model, findSurface(model, surface)) ??
    labelForSurface(surface.tab, surface.sub)
  );
}

// ── the reachability proof's instrument ─────────────────────────────────

/** How a surface is reached in a given model. */
export type SurfaceRoute =
  | { via: "tab"; tabId: string }
  | { via: "sub"; tabId: string; subId: string }
  | { via: "more"; tabId: string; subId: string | null };

/**
 * Where a surface lives in a model, or null when it lives nowhere. The
 * surface is normalised first, so a level-1 reference answers through its
 * default sub-tab and a level-3 reference is asked about via its parent.
 */
export function findSurface(
  model: CampaignNavModel,
  surface: { tab: string; sub: string | null }
): SurfaceRoute | null {
  const norm = normalise(surface.tab, surface.sub);
  const key = pairKey(norm.tab, norm.sub);

  for (const tab of model.tabs) {
    if (pairKey(tab.href.tab, tab.href.sub) === key) return { via: "tab", tabId: tab.id };
  }
  for (const tab of model.tabs) {
    const hit = tab.subs.find((s) => pairKey(s.href.tab, s.href.sub) === key);
    if (hit) return { via: "sub", tabId: tab.id, subId: hit.id };
  }
  for (const tab of model.more) {
    if (tab.subs.length === 0) {
      if (pairKey(tab.href.tab, tab.href.sub) === key) {
        return { via: "more", tabId: tab.id, subId: null };
      }
      continue;
    }
    const hit = tab.subs.find((s) => pairKey(s.href.tab, s.href.sub) === key);
    if (hit) return { via: "more", tabId: tab.id, subId: hit.id };
  }
  return null;
}
