/**
 * WP2.3 Stage 0 — deterministic wall-chart fixtures.
 *
 * The fixture is expressed as rows keyed by Supabase table / view name plus
 * JSON bodies keyed by `/api/...` pathname, because every query the wall chart
 * tree issues resolves through exactly those two edges (see `backend.ts`).
 * Nothing here contains a generated id, a date derived from `Date.now()`, or a
 * random value, so the characterisation snapshots are stable across runs.
 *
 * `small` — 12 members, 2 `ou_type`s, one parent -> 2 children -> 1 grandchild,
 * one unit with `user_rating`, two multi-unit workers, one unassigned worker,
 * one delegate / activist / contact, one HSR, one non-OA union member.
 * `large` — 305 members / 161 units, used only by the render-cost baseline.
 * `nested` — WP2.4c (wp2.4c.md §4.3): the campaign-42 shape, 20 members / 9
 * units, an Employer container with four worksites under it, two shift
 * sub-units nested under the largest worksite, a same-kind worksite child of
 * another worksite (a SIBLING root, never nested — NE-a as narrowed by ruling
 * 1) and a legacy custom container. The rows are `CAMPAIGN_42_SHAPE`, shared with the
 * pure suites (`lib/campaign/groups/__tests__/fixtures/campaign-42-shape.ts`)
 * so the interaction tests and the unit tests describe one campaign.
 *
 * WP2.4 (wp2.4.md §4.3): every unit row also carries `group_id` (WP2.1), the
 * `campaign_groups` and `user_campaign_prefs` tables exist (empty prefs), and
 * the sync-on-open route answers with zeros. None of that is read by the
 * legacy chart, so its characterisation is unchanged; the v2 suites build on
 * it through `buildWallChartFixtureV2`.
 */

import type {
  ActivityRating,
  WallChartOU,
  WallChartOUAssignment,
  WallChartRatingSummary,
} from "../../types";
import type { RawCampaignMemberRow } from "../../normalize-members";
import {
  CAMPAIGN_42_GROUPS,
  CAMPAIGN_42_MEMBERS,
  CAMPAIGN_42_PLACEMENTS,
  CAMPAIGN_42_UNITS,
} from "@/lib/campaign/groups/__tests__/fixtures/campaign-42-shape";

export type WallChartFixtureSize = "small" | "large" | "nested";

export type CampaignGroupFixtureRow = {
  group_id: number;
  campaign_id: number;
  kind: string;
  name: string;
  display_order: number;
};

export type WallChartFixture = {
  campaignId: string;
  /** Rows served by the fake PostgREST client, keyed by table / view name. */
  tables: Readonly<Record<string, readonly unknown[]>>;
  /** JSON bodies served by the fake `fetchApi`, keyed by `/api/...` pathname. */
  apiRoutes: Readonly<Record<string, unknown>>;
};

type WorkerSeed = {
  workerId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: "delegate" | "activist" | "contact" | null;
  isHsr: boolean;
  isBargainingRep: boolean;
  membershipTypeId: number | null;
  nonOaBadge: string | null;
  occupationId: number | null;
};

/** Must match `metrics.ROLE_IDS`, which is what the roll-ups switch on. */
const ROLE_TYPE_IDS: Record<NonNullable<WorkerSeed["role"]>, number> = {
  delegate: 7,
  activist: 8,
  contact: 3,
};

const ROLE_DISPLAY: Record<NonNullable<WorkerSeed["role"]>, string> = {
  delegate: "Delegate",
  activist: "Activist",
  contact: "Contact",
};

/**
 * `type_name` values must be the ones `lib/campaign/constants` recognises
 * (`OA_MEMBER_TYPE_NAMES` / `UNION_MEMBER_LIKE_TYPE_NAMES`), otherwise every
 * membership metric characterises as 0 and the snapshot pins nothing.
 */
const MEMBERSHIP_TYPES: Record<number, { type_name: string; display_name: string }> = {
  1: { type_name: "financial_member", display_name: "Financial member" },
  2: { type_name: "non_oa_member", display_name: "Other union member" },
  3: { type_name: "member_pending", display_name: "Pending member" },
  4: { type_name: "not_a_member", display_name: "Non-member" },
};

const OCCUPATIONS: Record<number, string> = {
  71: "Deckhand",
  72: "Engineer",
};

function memberRow(seed: WorkerSeed, index: number): RawCampaignMemberRow {
  const mt = seed.role
    ? {
        role_name: seed.role,
        role_type_id: ROLE_TYPE_IDS[seed.role],
        display_name: ROLE_DISPLAY[seed.role],
      }
    : null;
  return {
    membership_id: 2000 + index,
    worker_id: seed.workerId,
    worker: {
      worker_id: seed.workerId,
      first_name: seed.firstName,
      last_name: seed.lastName,
      email: seed.email,
      phone: seed.phone,
      notes: null,
      member_role_type_id: mt?.role_type_id ?? null,
      is_bargaining_rep: seed.isBargainingRep,
      is_hsr: seed.isHsr,
      union_membership_type_id: seed.membershipTypeId,
      non_oa_union_option_id: seed.nonOaBadge ? 9 : null,
      canonical_occupation_id: seed.occupationId,
      employer_id: null,
      worksite_id: null,
      member_role_type: mt,
      union_membership_type:
        seed.membershipTypeId != null ? MEMBERSHIP_TYPES[seed.membershipTypeId] : null,
      non_oa_union_option: seed.nonOaBadge
        ? {
            non_oa_union_option_id: 9,
            badge_initials: seed.nonOaBadge,
            display_name: "Maritime Union",
          }
        : null,
      canonical_occupation:
        seed.occupationId != null
          ? { occupation_id: seed.occupationId, canonical_name: OCCUPATIONS[seed.occupationId] }
          : null,
      employer: null,
      worksite: null,
    },
  };
}

const SMALL_WORKERS: readonly WorkerSeed[] = [
  { workerId: 101, firstName: "Ada", lastName: "Adams", email: "ada@example.test", phone: "0400000101", role: "delegate", isHsr: false, isBargainingRep: true, membershipTypeId: 1, nonOaBadge: null, occupationId: 71 },
  { workerId: 102, firstName: "Ben", lastName: "Baker", email: "ben@example.test", phone: null, role: "activist", isHsr: false, isBargainingRep: false, membershipTypeId: 1, nonOaBadge: null, occupationId: 71 },
  { workerId: 103, firstName: "Cara", lastName: "Carter", email: null, phone: "0400000103", role: "contact", isHsr: false, isBargainingRep: false, membershipTypeId: 3, nonOaBadge: null, occupationId: 72 },
  { workerId: 104, firstName: "Dan", lastName: "Dawson", email: null, phone: null, role: null, isHsr: true, isBargainingRep: false, membershipTypeId: 1, nonOaBadge: null, occupationId: 72 },
  { workerId: 105, firstName: "Eve", lastName: "Evans", email: "eve@example.test", phone: "0400000105", role: null, isHsr: false, isBargainingRep: false, membershipTypeId: 2, nonOaBadge: "MUA", occupationId: null },
  { workerId: 106, firstName: "Finn", lastName: "Foster", email: null, phone: "0400000106", role: null, isHsr: false, isBargainingRep: false, membershipTypeId: 4, nonOaBadge: null, occupationId: 71 },
  { workerId: 107, firstName: "Gina", lastName: "Grant", email: "gina@example.test", phone: null, role: null, isHsr: false, isBargainingRep: false, membershipTypeId: 1, nonOaBadge: null, occupationId: 72 },
  { workerId: 108, firstName: "Hugo", lastName: "Hall", email: null, phone: null, role: null, isHsr: false, isBargainingRep: false, membershipTypeId: 4, nonOaBadge: null, occupationId: null },
  { workerId: 109, firstName: "Ida", lastName: "Irwin", email: "ida@example.test", phone: "0400000109", role: null, isHsr: false, isBargainingRep: false, membershipTypeId: 3, nonOaBadge: null, occupationId: 71 },
  { workerId: 110, firstName: "Jack", lastName: "Jones", email: null, phone: null, role: null, isHsr: false, isBargainingRep: false, membershipTypeId: 1, nonOaBadge: null, occupationId: 71 },
  { workerId: 111, firstName: "Kim", lastName: "King", email: "kim@example.test", phone: "0400000111", role: null, isHsr: false, isBargainingRep: false, membershipTypeId: 4, nonOaBadge: null, occupationId: 72 },
  { workerId: 112, firstName: "Lena", lastName: "Lane", email: null, phone: "0400000112", role: null, isHsr: false, isBargainingRep: false, membershipTypeId: 1, nonOaBadge: null, occupationId: null },
];

/**
 * ou 10 is a group container so its sub-unit cards (block #3) and their own
 * grandchild cards (block #4) both render in the `default` case; ou 12 is a
 * second parent whose stored view is unset, which is what makes the
 * Expand-all / Collapse-all control meaningful.
 */
const SMALL_OUS: readonly WallChartOU[] = [
  { ou_id: 10, campaign_id: 1, name: "Acme Group", ou_type: "employer", total_workers_estimated: 8, display_order: 1, is_group_container: true, parent_ou_id: null, user_rating: 2, group_id: null },
  { ou_id: 11, campaign_id: 1, name: "Acme North", ou_type: "employer", total_workers_estimated: 4, display_order: 2, is_group_container: false, parent_ou_id: 10, user_rating: null, group_id: 1 },
  { ou_id: 12, campaign_id: 1, name: "Acme South", ou_type: "employer", total_workers_estimated: 3, display_order: 3, is_group_container: false, parent_ou_id: 10, user_rating: null, group_id: 1 },
  { ou_id: 13, campaign_id: 1, name: "South Deck", ou_type: "employer", total_workers_estimated: 2, display_order: 4, is_group_container: false, parent_ou_id: 12, user_rating: null, group_id: 3 },
  { ou_id: 20, campaign_id: 1, name: "Port Alpha", ou_type: "worksite", total_workers_estimated: 6, display_order: 5, is_group_container: false, parent_ou_id: null, user_rating: null, group_id: 2 },
];

/**
 * WP2.4 — the `small` fixture's groups (wp2.4.md §4.3). Employer holds the
 * two leaf employer units, Worksite the site, Shift the grandchild; the
 * legacy container (ou 10) carries no group, so its two placements count for
 * no group (§3.3, §8.2): worker 101 sits only there and is therefore "Not in
 * any group" beside the unassigned worker 112. Worker 107 (11 and 20) and
 * 108 (10 and 12) are the multi-unit workers, each in ONE unit per group.
 */
const SMALL_GROUPS: readonly CampaignGroupFixtureRow[] = [
  { group_id: 1, campaign_id: 1, kind: "employer", name: "Employer", display_order: 1 },
  { group_id: 2, campaign_id: 1, kind: "worksite", name: "Worksite", display_order: 2 },
  { group_id: 3, campaign_id: 1, kind: "shift", name: "Shift", display_order: 3 },
];

/** The `withEmployerGroup` variant: ou 10 becomes an ordinary unit of a fourth group (§3.3 containers under v2). */
const EMPLOYER_CONTAINER_GROUP: CampaignGroupFixtureRow = {
  group_id: 4,
  campaign_id: 1,
  kind: "employer",
  name: "Company",
  display_order: 4,
};

/** `large`: the 8 containers form the Employer group; the 32 vessels and 121 sites the Worksite group, listed first. */
const LARGE_GROUPS: readonly CampaignGroupFixtureRow[] = [
  { group_id: 2, campaign_id: 1, kind: "worksite", name: "Worksite", display_order: 1 },
  { group_id: 1, campaign_id: 1, kind: "employer", name: "Employer", display_order: 2 },
];

/**
 * WP2.4c — the `nested` size (wp2.4c.md §4.3). The campaign-42 rows, dressed
 * with the harness's deterministic worker attributes: every fourth member is a
 * delegate / activist / contact, every fifth a non-OA member, so the roll-ups
 * and the colour-by controls have content on both the root and the nested
 * cards. No generated id, no `Date.now()`.
 */
function buildNested(): {
  members: RawCampaignMemberRow[];
  ous: WallChartOU[];
  assignments: WallChartOUAssignment[];
  ratings: WallChartRatingSummary[];
} {
  const members = CAMPAIGN_42_MEMBERS.map((m, i) =>
    memberRow(
      {
        workerId: m.worker_id,
        firstName: m.first_name,
        lastName: m.last_name,
        email: i % 3 === 0 ? `${m.first_name.toLowerCase()}@example.test` : null,
        phone: i % 2 === 0 ? `04000${String(m.worker_id).padStart(5, "0")}` : null,
        role: i % 7 === 0 ? "delegate" : i % 7 === 3 ? "activist" : i % 7 === 5 ? "contact" : null,
        isHsr: i % 9 === 4,
        isBargainingRep: i % 11 === 2,
        membershipTypeId: i % 5 === 0 ? 2 : i % 4 === 3 ? 3 : 1,
        nonOaBadge: i % 5 === 0 ? "MUA" : null,
        occupationId: i % 2 === 0 ? 71 : 72,
      },
      i
    )
  );
  const ous: WallChartOU[] = CAMPAIGN_42_UNITS.map((u) => ({
    ou_id: u.ou_id,
    campaign_id: u.campaign_id,
    name: u.name,
    ou_type: u.ou_type,
    total_workers_estimated: u.total_workers_estimated,
    display_order: u.display_order,
    is_group_container: u.is_group_container,
    parent_ou_id: u.parent_ou_id,
    ou_group_id: u.ou_group_id,
    group_id: u.group_id,
    user_rating: u.user_rating,
  }));
  const assignments: WallChartOUAssignment[] = CAMPAIGN_42_PLACEMENTS.map((p) => ({
    ou_id: p.ou_id,
    worker_id: p.worker_id,
    is_primary: p.is_primary,
  }));
  const ratings = CAMPAIGN_42_MEMBERS.filter((_, i) => i % 3 !== 2).map((m, i) =>
    ratingSummaryRow(m.worker_id, (i % 5) + 1, (i % 4) + 1, i % 4 === 0)
  );
  return { members, ous, assignments, ratings };
}

/** The sync-on-open route's JSON with nothing changed (wp2.4.md §3.14). */
export const SYNC_NOTHING_CHANGED = {
  success: true,
  workersAdded: 12,
  membersAdded: 0,
  ouAssignmentsUpserted: 0,
  ouAssignmentsSkipped: 0,
};

const SMALL_ASSIGNMENTS: readonly WallChartOUAssignment[] = [
  { ou_id: 10, worker_id: 101, is_primary: true },
  { ou_id: 10, worker_id: 108, is_primary: true },
  { ou_id: 11, worker_id: 102, is_primary: true },
  { ou_id: 11, worker_id: 107, is_primary: true },
  { ou_id: 12, worker_id: 103, is_primary: true },
  { ou_id: 12, worker_id: 108, is_primary: false },
  { ou_id: 13, worker_id: 104, is_primary: true },
  { ou_id: 20, worker_id: 105, is_primary: true },
  { ou_id: 20, worker_id: 106, is_primary: true },
  { ou_id: 20, worker_id: 107, is_primary: false },
  { ou_id: 20, worker_id: 109, is_primary: true },
  { ou_id: 20, worker_id: 110, is_primary: true },
  { ou_id: 20, worker_id: 111, is_primary: true },
];

function ratingSummaryRow(
  workerId: number,
  cumulative: number | null,
  last: number | null,
  supportive: boolean
): WallChartRatingSummary {
  return {
    worker_id: workerId,
    cumulative_rating: cumulative,
    last_activity_rating: last,
    has_supportive_activity_rating: supportive,
    supportive_activity_count: supportive ? 1 : 0,
  };
}

const SMALL_RATING_SUMMARY: readonly WallChartRatingSummary[] = [
  ratingSummaryRow(101, 1, 1, true),
  ratingSummaryRow(102, 2, 2, true),
  ratingSummaryRow(103, 3, 3, false),
  ratingSummaryRow(104, 4, 4, false),
  ratingSummaryRow(105, 5, 5, false),
  ratingSummaryRow(107, 2, 3, true),
  ratingSummaryRow(112, 3, null, false),
];

/**
 * One non-binary assessment activity, already rated, so the selector and the
 * charts have content. WP3.8: carries its owner (`campaign_id: 1`) and
 * `scope: "campaign"`, as every real row does after the migration; neither
 * field is rendered, so the characterisation DOM is unchanged.
 */
const ASSESSMENT_ACTIVITIES: readonly unknown[] = [
  {
    activity_id: 501,
    campaign_id: 1,
    scope: "campaign",
    title: "Petition ask",
    is_binary: false,
    supporter_outcome_value: null,
    created_at: "2026-01-01T00:00:00.000Z",
    rating_labels: null,
    activity_kind: "assessment",
    activity_ambitions: [],
  },
];

/**
 * WP3.8 (wp3.8.md §4.3) — the `family` knob. `parentId`/`parentName` make
 * campaign 1 a CHILD: the `campaigns` row gains `parent_campaign_id` and the
 * embedded `parent`, and `activities` (the parent's `scope = "family"` rows,
 * `campaign_id: parentId`) are appended to `campaign_activities`. `children`
 * make campaign 1 a PARENT: rows with `parent_campaign_id: 1` are appended to
 * `campaigns` (after campaign 1's own row, which `.maybeSingle()` reads first)
 * and `ownedScope` flips the owned assessment to `"family"`. Because the fake
 * ignores filters, exclusion is proven by the pure tests; these fixtures prove
 * rendering and the write target.
 */
export type WallChartFamilyFixture = {
  parentId?: number;
  parentName?: string;
  /** The parent's shared assessments; defaults to one, `SHARED_FAMILY_ACTIVITY`. */
  activities?: readonly unknown[];
  children?: readonly { campaign_id: number; name: string }[];
  ownedScope?: "campaign" | "family";
};

/** The parent's one shared assessment, unrated, used when `family.activities` is omitted. */
export const SHARED_FAMILY_ACTIVITY = {
  activity_id: 901,
  campaign_id: 9,
  scope: "family",
  title: "Sector petition",
  is_binary: false,
  supporter_outcome_value: null,
  created_at: "2026-01-03T00:00:00.000Z",
  rating_labels: null,
  activity_kind: "assessment",
  activity_ambitions: [],
} as const;

const ACTIVITY_RATINGS: readonly ActivityRating[] = [
  { rating_id: 9001, worker_id: 101, activity_id: 501, rating: 1, binary_value: null, rating_phase: "assessment", rated_at: "2026-01-02T00:00:00.000Z", source: "fixture", notes: null },
  { rating_id: 9002, worker_id: 102, activity_id: 501, rating: 2, binary_value: null, rating_phase: "assessment", rated_at: "2026-01-02T00:00:00.000Z", source: "fixture", notes: null },
  { rating_id: 9003, worker_id: 103, activity_id: 501, rating: 4, binary_value: null, rating_phase: "assessment", rated_at: "2026-01-02T00:00:00.000Z", source: "fixture", notes: null },
];

/** 305 members / 161 units: 8 parents x 4 children, plus 121 standalone units. */
function buildLarge(): { members: RawCampaignMemberRow[]; ous: WallChartOU[]; assignments: WallChartOUAssignment[]; ratings: WallChartRatingSummary[] } {
  const members: RawCampaignMemberRow[] = [];
  const ratings: WallChartRatingSummary[] = [];
  for (let i = 0; i < 305; i++) {
    const workerId = 10_000 + i;
    const role = i % 17 === 0 ? "delegate" : i % 11 === 0 ? "activist" : i % 7 === 0 ? "contact" : null;
    members.push(
      memberRow(
        {
          workerId,
          firstName: `First${i}`,
          lastName: `Last${String(i).padStart(3, "0")}`,
          email: i % 3 === 0 ? `w${i}@example.test` : null,
          phone: i % 2 === 0 ? `04000${String(i).padStart(5, "0")}` : null,
          role,
          isHsr: i % 23 === 0,
          isBargainingRep: i % 29 === 0,
          membershipTypeId: i % 5 === 0 ? 2 : 1,
          nonOaBadge: i % 5 === 0 ? "MUA" : null,
          occupationId: i % 2 === 0 ? 71 : 72,
        },
        i
      )
    );
    if (i % 3 !== 2) {
      ratings.push(ratingSummaryRow(workerId, (i % 5) + 1, (i % 4) + 1, i % 4 === 0));
    }
  }

  const ous: WallChartOU[] = [];
  let order = 1;
  for (let p = 0; p < 8; p++) {
    const parentId = 500 + p;
    ous.push({ ou_id: parentId, campaign_id: 1, name: `Group ${p}`, ou_type: "employer", total_workers_estimated: 40, display_order: order++, is_group_container: true, parent_ou_id: null, user_rating: (p % 5) + 1, group_id: 1 });
    for (let c = 0; c < 4; c++) {
      ous.push({ ou_id: parentId * 100 + c, campaign_id: 1, name: `Group ${p} vessel ${c}`, ou_type: "employer", total_workers_estimated: 10, display_order: order++, is_group_container: false, parent_ou_id: parentId, user_rating: null, group_id: 2 });
    }
  }
  for (let s = 0; s < 121; s++) {
    ous.push({ ou_id: 900 + s, campaign_id: 1, name: `Site ${s}`, ou_type: "worksite", total_workers_estimated: 3, display_order: order++, is_group_container: false, parent_ou_id: null, user_rating: null, group_id: 2 });
  }

  const assignableOus = ous.filter((o) => !o.is_group_container);
  const assignments: WallChartOUAssignment[] = [];
  members.forEach((m, i) => {
    const ou = assignableOus[i % assignableOus.length];
    assignments.push({ ou_id: ou.ou_id, worker_id: m.worker_id, is_primary: true });
    if (i % 25 === 0) {
      const second = assignableOus[(i + 7) % assignableOus.length];
      if (second.ou_id !== ou.ou_id) {
        assignments.push({ ou_id: second.ou_id, worker_id: m.worker_id, is_primary: false });
      }
    }
  });

  return { members, ous, assignments, ratings };
}

export type BuildWallChartFixtureOptions = {
  /** Hint ids already dismissed by the signed-in user. Defaults to the rating hint (hidden). */
  hintDismissals?: readonly string[];
  /** WP3.8: make campaign 1 a child (parentId) or a parent (children). Absent = no family, today's fixture. */
  family?: WallChartFamilyFixture;
};

export function buildWallChartFixture(
  size: WallChartFixtureSize,
  opts: BuildWallChartFixtureOptions = {}
): WallChartFixture {
  const campaignId = "1";
  const dismissals = opts.hintDismissals ?? ["wall_chart_rating"];

  const base =
    size === "small"
      ? {
          members: SMALL_WORKERS.map(memberRow),
          ous: [...SMALL_OUS],
          assignments: [...SMALL_ASSIGNMENTS],
          ratings: [...SMALL_RATING_SUMMARY],
          estimate: 20,
        }
      : size === "nested"
        ? { ...buildNested(), estimate: 24 }
        : { ...buildLarge(), estimate: 400 };

  const family = opts.family;
  const parentId = family?.parentId ?? null;
  const ownCampaignRow = {
    campaign_id: Number(campaignId),
    total_worker_estimate: base.estimate,
    name: "Test Campaign",
    parent_campaign_id: parentId,
    parent:
      parentId != null
        ? { campaign_id: parentId, name: family?.parentName ?? "Parent campaign" }
        : null,
  };
  const campaignRows: readonly unknown[] = [
    ownCampaignRow,
    ...(family?.children ?? []).map((c) => ({
      campaign_id: c.campaign_id,
      name: c.name,
      parent_campaign_id: Number(campaignId),
      parent: null,
    })),
  ];
  const ownedActivities: readonly unknown[] =
    family?.ownedScope === "family"
      ? ASSESSMENT_ACTIVITIES.map((a) => ({ ...(a as Record<string, unknown>), scope: "family" }))
      : ASSESSMENT_ACTIVITIES;
  const familyActivities: readonly unknown[] =
    parentId != null
      ? (family?.activities ?? [SHARED_FAMILY_ACTIVITY]).map((a) => ({
          ...(a as Record<string, unknown>),
          campaign_id: parentId,
          scope: "family",
        }))
      : [];

  return {
    campaignId,
    tables: {
      campaign_worker_membership: base.members,
      campaign_worker_rating_summary: base.ratings,
      campaign_organising_units: base.ous,
      campaign_worker_ou: base.assignments,
      campaigns: campaignRows,
      campaign_activities: [...ownedActivities, ...familyActivities],
      campaign_activity_ratings: ACTIVITY_RATINGS,
      activity_ambitions: [],
      campaign_task_lists: [],
      campaign_leader_worker_links: [],
      campaign_employers: [],
      campaign_worksites: [],
      v_campaign_coverage_map: [],
      v_woc_unit_representation: [],
      vw_campaign_worker_list_activity: [],
      user_hint_dismissals: dismissals.map((hint_id) => ({ hint_id })),
      workers: [],
      worker_tags: [],
      // WP2.4: read by the v2 chart only.
      campaign_groups:
        size === "small" ? SMALL_GROUPS : size === "nested" ? CAMPAIGN_42_GROUPS : LARGE_GROUPS,
      user_campaign_prefs: [],
    },
    apiRoutes: {
      [`/api/campaigns/${campaignId}/data-fields`]: { fields: [], fieldsets: [] },
      [`/api/campaigns/${campaignId}/facts`]: { facts: [] },
      [`/api/campaigns/${campaignId}/worker-lists`]: [],
      // WP2.4 (SY-c): the board's sync-on-open POST; answered with zeros unless a test overrides it.
      [`/api/campaigns/${campaignId}/sync-universe-workers`]: SYNC_NOTHING_CHANGED,
    },
  };
}

export type BuildWallChartFixtureV2Options = BuildWallChartFixtureOptions & {
  /** The stored `user_campaign_prefs.prefs` document for this user, or none. */
  prefs?: Record<string, unknown> | null;
  /** ou 10 (the legacy container) carries a fourth group, "Company" (§3.3 containers under v2). */
  withEmployerGroup?: boolean;
  /** The sync-on-open route's answer. */
  syncResult?: Record<string, unknown>;
  /**
   * `campaign_groups` rows (e.g. `[]` for the zero-groups state). A unit whose
   * group is not listed gets `group_id: null`, as the WP2.1 trigger would
   * leave it (a group that does not exist cannot be on a unit).
   */
  groups?: readonly CampaignGroupFixtureRow[];
};

/**
 * WP2.4 (wp2.4.md §4.3) — the base fixture with both hints dismissed (the
 * group-selector callout would otherwise open over every v2 mount) and the
 * v2-only knobs: a seeded prefs document, the container-with-group variant,
 * a scripted sync answer, a group list.
 */
export function buildWallChartFixtureV2(
  size: WallChartFixtureSize,
  opts: BuildWallChartFixtureV2Options = {}
): WallChartFixture {
  const base = buildWallChartFixture(size, {
    hintDismissals: opts.hintDismissals ?? ["wall_chart_rating", "wall_chart_group_selector"],
  });
  const groups =
    opts.groups ??
    (opts.withEmployerGroup
      ? [...(base.tables.campaign_groups as CampaignGroupFixtureRow[]), EMPLOYER_CONTAINER_GROUP]
      : (base.tables.campaign_groups as CampaignGroupFixtureRow[]));
  const groupIds = new Set(groups.map((g) => g.group_id));
  const ous = (base.tables.campaign_organising_units as WallChartOU[]).map((ou) => {
    const withContainer =
      opts.withEmployerGroup && ou.ou_id === 10 ? { ...ou, group_id: EMPLOYER_CONTAINER_GROUP.group_id } : ou;
    return withContainer.group_id != null && !groupIds.has(withContainer.group_id)
      ? { ...withContainer, group_id: null }
      : withContainer;
  });
  return {
    ...base,
    tables: {
      ...base.tables,
      campaign_organising_units: ous,
      campaign_groups: groups,
      user_campaign_prefs: opts.prefs ? [{ prefs: opts.prefs }] : [],
    },
    apiRoutes: {
      ...base.apiRoutes,
      ...(opts.syncResult
        ? { [`/api/campaigns/${base.campaignId}/sync-universe-workers`]: opts.syncResult }
        : {}),
    },
  };
}
