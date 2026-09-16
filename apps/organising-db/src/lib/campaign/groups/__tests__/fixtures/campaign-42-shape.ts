/**
 * WP2.4c Stage 1 — `CAMPAIGN_42_SHAPE` (wp2.4c.md §4.1, §4.3).
 *
 * The shape the operator found on production campaign 42 (PROGRESS.md:103),
 * as rows: an Employer CONTAINER ("EDI Downer") holding materialised
 * placements, four worksites under it (`parent_ou_id = ou_group_id =` the
 * container — a facet link, never a nesting edge under NE-a), two shift
 * sub-units under the largest worksite (`parent_ou_id = KGP`, a genuine
 * nesting edge), a same-kind worksite child under another worksite (the C-k
 * split shape — a SIBLING root, never nested, under NE-a as narrowed by
 * ruling 1), and a legacy custom container carrying no group.
 *
 * The membership covers every case §3.2 and §3.4 name:
 *   * paired      — a worksite placement AND a shift placement under it;
 *   * root-only   — the worksite, not yet on a shift (the parent's own area);
 *   * child-only  — a shift placement with NO worksite placement (query (b));
 *   * orphan      — a worksite placement AND a shift under a DIFFERENT
 *                   worksite (query (c); NC-a hides it in the Worksite view);
 *   * container-only, legacy-container-only, unassigned-everywhere;
 *   * a placement whose worker is not a member (ignored by every derivation).
 *
 * The same rows drive the pure tests (`derive-group-tree.test.ts`,
 * `plan-nested-drop.test.ts`) and the `nested` wall-chart harness size
 * (`components/campaigns/wall-chart/__tests__/harness/fixture.ts`), so the
 * interaction suite and the unit suite describe one campaign.
 */

export const CAMPAIGN_42_GROUP_IDS = {
  /** Employer — the container carries it (WP2.4 §3.3 "Containers under v2"). */
  employer: 1,
  /** Worksite — the operator's primary grouping. */
  worksite: 2,
  /** Shift — sub-unit-only: every unit is nested under a worksite (SG-a). */
  shift: 3,
} as const;

export const CAMPAIGN_42_OU_IDS = {
  employerContainer: 1,
  kgp: 10,
  barrow: 11,
  ichthys: 12,
  wheatstone: 13,
  /**
   * "Barrow Jetty": a worksite child of a worksite — the C-k same-kind Split
   * shape. Its `parent_ou_id` is not a nesting edge (same group), so it is an
   * ordinary root card beside Barrow and its members count under it.
   */
  barrowJetty: 14,
  day: 20,
  night: 21,
  /** A standalone shift root, added only by `campaign42UnitsWithStandaloneShift` (the mixed case). */
  swing: 22,
  /** A legacy custom-kind container: no group, holds a placement of its own. */
  legacyContainer: 90,
} as const;

export const CAMPAIGN_42_WORKER_IDS = {
  pairedDay: 201,
  pairedNight: 202,
  rootOnly: 203,
  childOnly: 204,
  orphan: 205,
  ichthysOnly: 206,
  wheatstoneOnly: 207,
  containerOnly: 208,
  unassignedEverywhere: 209,
  legacyOnly: 210,
  /** On "Barrow Jetty" — a root of Worksite, not a nested card (ruling 1). */
  sameKindChild: 211,
  /**
   * KGP + Day (Shift) + KGP Crew (Crew) in the sub-unit-groups variant: a
   * worker who legitimately holds TWO children of one root, in two groups
   * (§3.7 row 9; the shape review B-1 found unhandled).
   */
  twoChildren: 220,
  /** A worker on none of the campaign's memberships, placed on Day. */
  nonMember: 299,
} as const;

export type Campaign42Group = {
  group_id: number;
  campaign_id: number;
  kind: string;
  name: string;
  display_order: number;
};

export type Campaign42Unit = {
  ou_id: number;
  campaign_id: number;
  name: string;
  ou_type: string;
  total_workers_estimated: number | null;
  display_order: number;
  is_group_container: boolean;
  parent_ou_id: number | null;
  ou_group_id: number | null;
  group_id: number | null;
  user_rating: number | null;
};

export type Campaign42Member = {
  worker_id: number;
  first_name: string;
  last_name: string;
};

export type Campaign42Placement = {
  ou_id: number;
  worker_id: number;
  is_primary: boolean;
};

export const CAMPAIGN_42_GROUPS: readonly Campaign42Group[] = [
  { group_id: CAMPAIGN_42_GROUP_IDS.employer, campaign_id: 1, kind: "employer", name: "Employer", display_order: 1 },
  { group_id: CAMPAIGN_42_GROUP_IDS.worksite, campaign_id: 1, kind: "worksite", name: "Worksite", display_order: 2 },
  { group_id: CAMPAIGN_42_GROUP_IDS.shift, campaign_id: 1, kind: "shift", name: "Shift", display_order: 3 },
];

/** In the units query's order (`display_order`, then `name`), as the chart receives them. */
export const CAMPAIGN_42_UNITS: readonly Campaign42Unit[] = [
  { ou_id: 1, campaign_id: 1, name: "EDI Downer", ou_type: "employer", total_workers_estimated: 24, display_order: 1, is_group_container: true, parent_ou_id: null, ou_group_id: null, group_id: 1, user_rating: 2 },
  { ou_id: 10, campaign_id: 1, name: "KGP", ou_type: "worksite", total_workers_estimated: 9, display_order: 2, is_group_container: false, parent_ou_id: 1, ou_group_id: 1, group_id: 2, user_rating: null },
  { ou_id: 11, campaign_id: 1, name: "Barrow", ou_type: "worksite", total_workers_estimated: 5, display_order: 3, is_group_container: false, parent_ou_id: 1, ou_group_id: 1, group_id: 2, user_rating: null },
  { ou_id: 12, campaign_id: 1, name: "Ichthys", ou_type: "worksite", total_workers_estimated: 3, display_order: 4, is_group_container: false, parent_ou_id: 1, ou_group_id: 1, group_id: 2, user_rating: null },
  { ou_id: 13, campaign_id: 1, name: "Wheatstone", ou_type: "worksite", total_workers_estimated: 3, display_order: 5, is_group_container: false, parent_ou_id: 1, ou_group_id: 1, group_id: 2, user_rating: null },
  { ou_id: 20, campaign_id: 1, name: "Day", ou_type: "shift", total_workers_estimated: 3, display_order: 6, is_group_container: false, parent_ou_id: 10, ou_group_id: null, group_id: 3, user_rating: null },
  { ou_id: 21, campaign_id: 1, name: "Night", ou_type: "shift", total_workers_estimated: 3, display_order: 7, is_group_container: false, parent_ou_id: 10, ou_group_id: null, group_id: 3, user_rating: null },
  { ou_id: 14, campaign_id: 1, name: "Barrow Jetty", ou_type: "worksite", total_workers_estimated: 2, display_order: 8, is_group_container: false, parent_ou_id: 11, ou_group_id: null, group_id: 2, user_rating: null },
  { ou_id: 90, campaign_id: 1, name: "Legacy crew", ou_type: "custom", total_workers_estimated: 2, display_order: 9, is_group_container: true, parent_ou_id: null, ou_group_id: null, group_id: null, user_rating: null },
];

/**
 * The mixed case of §3.4: a standalone shift root makes the Shift group
 * primary and turns Day / Night into `foreignNested` cards of its own view.
 */
export function campaign42UnitsWithStandaloneShift(): Campaign42Unit[] {
  return [
    ...CAMPAIGN_42_UNITS,
    { ou_id: 22, campaign_id: 1, name: "Swing", ou_type: "shift", total_workers_estimated: 2, display_order: 10, is_group_container: false, parent_ou_id: null, ou_group_id: null, group_id: 3, user_rating: null },
  ];
}

export const CAMPAIGN_42_MEMBERS: readonly Campaign42Member[] = [
  { worker_id: 201, first_name: "Priya", last_name: "Patel" },
  { worker_id: 202, first_name: "Quentin", last_name: "Quinn" },
  { worker_id: 203, first_name: "Rosa", last_name: "Ramirez" },
  { worker_id: 204, first_name: "Sam", last_name: "Singh" },
  { worker_id: 205, first_name: "Tara", last_name: "Thomas" },
  { worker_id: 206, first_name: "Umar", last_name: "Usman" },
  { worker_id: 207, first_name: "Vera", last_name: "Vance" },
  { worker_id: 208, first_name: "Will", last_name: "Wong" },
  { worker_id: 209, first_name: "Xena", last_name: "Xu" },
  { worker_id: 210, first_name: "Yuri", last_name: "Young" },
  { worker_id: 211, first_name: "Zoe", last_name: "Zhang" },
  { worker_id: 212, first_name: "Alan", last_name: "Ashby" },
  { worker_id: 213, first_name: "Bea", last_name: "Boyd" },
  { worker_id: 214, first_name: "Cal", last_name: "Curtis" },
  { worker_id: 215, first_name: "Dev", last_name: "Dutta" },
  { worker_id: 216, first_name: "Ella", last_name: "Ellis" },
  { worker_id: 217, first_name: "Fred", last_name: "Falk" },
  { worker_id: 218, first_name: "Gita", last_name: "Gupta" },
  { worker_id: 219, first_name: "Hal", last_name: "Hobbs" },
  { worker_id: 220, first_name: "Ivy", last_name: "Ingram" },
];

/**
 * In the placements query's order. Worker 299 is not a member, so every
 * derivation ignores their Day placement.
 */
export const CAMPAIGN_42_PLACEMENTS: readonly Campaign42Placement[] = [
  { ou_id: 10, worker_id: 201, is_primary: true }, // paired: KGP + Day
  { ou_id: 20, worker_id: 201, is_primary: false },
  { ou_id: 10, worker_id: 202, is_primary: true }, // paired: KGP + Night
  { ou_id: 21, worker_id: 202, is_primary: false },
  { ou_id: 10, worker_id: 203, is_primary: true }, // KGP, not yet on a shift
  { ou_id: 21, worker_id: 204, is_primary: true }, // child-only: Night, no worksite
  { ou_id: 11, worker_id: 205, is_primary: true }, // orphan: Barrow + Day (under KGP)
  { ou_id: 20, worker_id: 205, is_primary: false },
  { ou_id: 12, worker_id: 206, is_primary: true },
  { ou_id: 13, worker_id: 207, is_primary: true },
  { ou_id: 1, worker_id: 208, is_primary: true }, // the Employer container only
  { ou_id: 90, worker_id: 210, is_primary: true }, // the legacy container only
  { ou_id: 14, worker_id: 211, is_primary: true }, // the C-k sibling root Barrow Jetty
  { ou_id: 10, worker_id: 212, is_primary: true },
  { ou_id: 10, worker_id: 213, is_primary: true }, // paired: KGP + Day
  { ou_id: 20, worker_id: 213, is_primary: false },
  { ou_id: 11, worker_id: 214, is_primary: true },
  { ou_id: 11, worker_id: 215, is_primary: true },
  { ou_id: 12, worker_id: 216, is_primary: true },
  { ou_id: 13, worker_id: 217, is_primary: true },
  { ou_id: 1, worker_id: 219, is_primary: true },
  { ou_id: 10, worker_id: 220, is_primary: true },
  { ou_id: 20, worker_id: 299, is_primary: true }, // not a member
];

// ---------------------------------------------------------------------------
// The sub-unit-groups variant (§3.7 rows 7, 9, 10 and review B-1)
// ---------------------------------------------------------------------------

/** A second sub-unit group beside Shift, so one root can hold children in two groups. */
export const CAMPAIGN_42_CREW_GROUP_ID = 5;

export const CAMPAIGN_42_SUB_UNIT_OU_IDS = {
  /** A shift under Barrow — the NS-a / orphan cases need a child under another root. */
  barrowNight: 23,
  /** A crew under KGP — a SIBLING GROUP under the same root (§3.7 row 9). */
  kgpCrew: 24,
  /** A crew under Barrow. */
  barrowCrew: 25,
} as const;

function subUnit(over: Partial<Campaign42Unit> & { ou_id: number; name: string }): Campaign42Unit {
  return {
    campaign_id: 1,
    ou_type: "shift",
    total_workers_estimated: null,
    display_order: 100 + over.ou_id,
    is_group_container: false,
    parent_ou_id: null,
    ou_group_id: null,
    group_id: null,
    user_rating: null,
    ...over,
  };
}

/** `CAMPAIGN_42_UNITS` plus a shift under Barrow and a crew under each of KGP and Barrow. */
export function campaign42UnitsWithSubUnitGroups(): Campaign42Unit[] {
  return [
    ...CAMPAIGN_42_UNITS,
    subUnit({ ou_id: CAMPAIGN_42_SUB_UNIT_OU_IDS.barrowNight, name: "Barrow Night", ou_type: "shift", parent_ou_id: CAMPAIGN_42_OU_IDS.barrow, group_id: CAMPAIGN_42_GROUP_IDS.shift }),
    subUnit({ ou_id: CAMPAIGN_42_SUB_UNIT_OU_IDS.kgpCrew, name: "KGP Crew", ou_type: "crew", parent_ou_id: CAMPAIGN_42_OU_IDS.kgp, group_id: CAMPAIGN_42_CREW_GROUP_ID }),
    subUnit({ ou_id: CAMPAIGN_42_SUB_UNIT_OU_IDS.barrowCrew, name: "Barrow Crew", ou_type: "crew", parent_ou_id: CAMPAIGN_42_OU_IDS.barrow, group_id: CAMPAIGN_42_CREW_GROUP_ID }),
  ];
}

/** `CAMPAIGN_42_PLACEMENTS` plus the rows those sub-units hold. */
export const CAMPAIGN_42_SUB_UNIT_PLACEMENTS: readonly Campaign42Placement[] = [
  ...CAMPAIGN_42_PLACEMENTS,
  { ou_id: 23, worker_id: 203, is_primary: false }, // KGP + a shift under Barrow (an NC-a orphan)
  { ou_id: 24, worker_id: 212, is_primary: false }, // KGP + a crew under KGP (a sibling group)
  { ou_id: 25, worker_id: 214, is_primary: false }, // Barrow + a crew under Barrow
  { ou_id: 23, worker_id: 215, is_primary: false }, // Barrow + a shift under Barrow (paired there)
  { ou_id: 24, worker_id: 220, is_primary: false }, // KGP + a crew AND a shift under KGP …
  { ou_id: 20, worker_id: 220, is_primary: false }, // … the two-children case (review B-1)
];
