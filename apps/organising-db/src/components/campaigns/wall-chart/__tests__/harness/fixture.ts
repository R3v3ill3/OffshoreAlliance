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
 */

import type {
  ActivityRating,
  WallChartOU,
  WallChartOUAssignment,
  WallChartRatingSummary,
} from "../../types";
import type { RawCampaignMemberRow } from "../../normalize-members";

export type WallChartFixtureSize = "small" | "large";

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
  { ou_id: 10, campaign_id: 1, name: "Acme Group", ou_type: "employer", total_workers_estimated: 8, display_order: 1, is_group_container: true, parent_ou_id: null, user_rating: 2 },
  { ou_id: 11, campaign_id: 1, name: "Acme North", ou_type: "employer", total_workers_estimated: 4, display_order: 2, is_group_container: false, parent_ou_id: 10, user_rating: null },
  { ou_id: 12, campaign_id: 1, name: "Acme South", ou_type: "employer", total_workers_estimated: 3, display_order: 3, is_group_container: false, parent_ou_id: 10, user_rating: null },
  { ou_id: 13, campaign_id: 1, name: "South Deck", ou_type: "employer", total_workers_estimated: 2, display_order: 4, is_group_container: false, parent_ou_id: 12, user_rating: null },
  { ou_id: 20, campaign_id: 1, name: "Port Alpha", ou_type: "worksite", total_workers_estimated: 6, display_order: 5, is_group_container: false, parent_ou_id: null, user_rating: null },
];

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

/** One non-binary assessment activity, already rated, so the selector and the charts have content. */
const ASSESSMENT_ACTIVITIES: readonly unknown[] = [
  {
    activity_id: 501,
    title: "Petition ask",
    is_binary: false,
    supporter_outcome_value: null,
    created_at: "2026-01-01T00:00:00.000Z",
    rating_labels: null,
    activity_kind: "assessment",
    activity_ambitions: [],
  },
];

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
    ous.push({ ou_id: parentId, campaign_id: 1, name: `Group ${p}`, ou_type: "employer", total_workers_estimated: 40, display_order: order++, is_group_container: true, parent_ou_id: null, user_rating: (p % 5) + 1 });
    for (let c = 0; c < 4; c++) {
      ous.push({ ou_id: parentId * 100 + c, campaign_id: 1, name: `Group ${p} vessel ${c}`, ou_type: "employer", total_workers_estimated: 10, display_order: order++, is_group_container: false, parent_ou_id: parentId, user_rating: null });
    }
  }
  for (let s = 0; s < 121; s++) {
    ous.push({ ou_id: 900 + s, campaign_id: 1, name: `Site ${s}`, ou_type: "worksite", total_workers_estimated: 3, display_order: order++, is_group_container: false, parent_ou_id: null, user_rating: null });
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
      : { ...buildLarge(), estimate: 400 };

  return {
    campaignId,
    tables: {
      campaign_worker_membership: base.members,
      campaign_worker_rating_summary: base.ratings,
      campaign_organising_units: base.ous,
      campaign_worker_ou: base.assignments,
      campaigns: [{ total_worker_estimate: base.estimate, name: "Test Campaign" }],
      campaign_activities: ASSESSMENT_ACTIVITIES,
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
    },
    apiRoutes: {
      [`/api/campaigns/${campaignId}/data-fields`]: { fields: [], fieldsets: [] },
      [`/api/campaigns/${campaignId}/facts`]: { facts: [] },
      [`/api/campaigns/${campaignId}/worker-lists`]: [],
    },
  };
}
