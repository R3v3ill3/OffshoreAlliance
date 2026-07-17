/**
 * activist-constants.ts
 *
 * Domain constants for the Activists & WOCs module (Workforce →
 * Activists & WOCs). Mirrors the vocabulary of the OA Activist & WOC
 * Tracker and the 4A Tasking Worksheet / WOC Guide tools.
 *
 * The assessment currency remains the shared 0–5 rating scale
 * (RATING_LEVELS in planner-types); the constants here cover the
 * activation dimension (4A stages, ladder rungs) and the WOC /
 * structure-test / coverage vocabularies.
 */

export const FOUR_A_STAGES = [
  {
    value: "assess",
    label: "Assess",
    description: "Strengths, goals, followers test, what the campaign needs from them.",
  },
  {
    value: "assign",
    label: "Assign",
    description: "A responsibility (not an errand) that advances the campaign and stretches them.",
  },
  {
    value: "assist",
    label: "Assist",
    description: "Walk-throughs, inoculation and check-ins until they can carry it alone.",
  },
  {
    value: "acknowledge",
    label: "Acknowledge",
    description: "Debrief, recognition, reassessment — then the cycle restarts.",
  },
] as const;

export type FourAStage = (typeof FOUR_A_STAGES)[number]["value"];

export const LADDER_RUNGS = [
  {
    value: 1,
    label: "1 · Private, low risk",
    shortLabel: "Rung 1",
    description: "Crew info; check a list; forward a survey; add workmates to the group chat.",
    builds: "Reliability",
  },
  {
    value: 2,
    label: "2 · Peer-to-peer",
    shortLabel: "Rung 2",
    description: "Talk to 3 named workmates; bring one person to a zoom; collect contacts.",
    builds: "Influence",
  },
  {
    value: 3,
    label: "3 · Semi-public",
    shortLabel: "Rung 3",
    description: "Host a BBQ; speak at crew meeting; join the WOC; crew petition.",
    builds: "Confidence, followership",
  },
  {
    value: 4,
    label: "4 · Structure test",
    shortLabel: "Rung 4",
    description: "Sticker/shirt day; crew photo; majority petition; turnout target.",
    builds: "Real coverage, crew by crew",
  },
  {
    value: 5,
    label: "5 · Leading others",
    shortLabel: "Rung 5",
    description: "Run a contact tree; chair a WOC segment; brief and task other activists.",
    builds: "Leaders developing leaders",
  },
] as const;

export function ladderRungFor(value: number | null | undefined) {
  if (value == null) return null;
  return LADDER_RUNGS.find((r) => r.value === value) ?? null;
}

export const IDENTIFIED_VIA_OPTIONS = [
  { value: "workmate_rec", label: "Workmate recommendation" },
  { value: "office_call", label: "Rang the office" },
  { value: "outreach", label: "Outreach / phone bank" },
  { value: "event", label: "Event / meeting" },
  { value: "observed", label: "Observed on site" },
  { value: "other", label: "Other" },
] as const;

export const ACTIVIST_DOMAIN_OPTIONS = [
  { value: "recruitment", label: "Recruitment" },
  { value: "comms", label: "Comms" },
  { value: "mobilisation", label: "Mobilisation" },
  { value: "representation", label: "Representation" },
] as const;

export const ACTIVIST_PROFILE_SOURCES: Record<string, { label: string; auto: boolean }> = {
  manual: { label: "Curated", auto: false },
  auto_rating: { label: "Auto — rated 1", auto: true },
  auto_task: { label: "Auto — tasked", auto: true },
  auto_role: { label: "Auto — role", auto: true },
  auto_woc: { label: "Auto — WOC member", auto: true },
};

export const ACTIVIST_TASK_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In progress" },
  { value: "complete", label: "Complete" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export type ActivistTaskStatus = (typeof ACTIVIST_TASK_STATUSES)[number]["value"];

export const ACTIVIST_TASK_OUTCOMES = [
  { value: "done", label: "Done" },
  { value: "partly", label: "Partly" },
  { value: "not_done", label: "Not done" },
] as const;

/**
 * The six conditions for learning (4A Tasking Worksheet) — checked
 * before an assignment is finalised. Stored as boolean keys inside
 * activist_tasks.six_conditions.
 */
export const SIX_CONDITIONS = [
  { key: "asked", label: "They have been asked (a real ask, with a real yes)" },
  { key: "can_say_why", label: "They can say why the task matters — in their own words" },
  { key: "size_ok", label: "They are comfortable with the size of the task" },
  { key: "walked_through", label: "Walked / talked through it — and inoculated" },
  { key: "follow_up_booked", label: "Follow-up and debrief booked, with a date" },
  { key: "recognition_planned", label: "Recognition planned — specific, prompt, in front of peers" },
] as const;

export type SixConditionKey = (typeof SIX_CONDITIONS)[number]["key"];

export const WOC_ROLES = [
  { value: "chair", label: "Chair", owns: "Runs the agenda, keeps time, pushes to decisions." },
  { value: "mapper", label: "Mapper", owns: "The coverage chart — crews, leaders, gaps, test results." },
  { value: "comms_steward", label: "Comms steward", owns: "The contact tree / group chats; the 48-hour test." },
  { value: "recruitment_lead", label: "Recruitment lead", owns: "New-starter contact; the ask pipeline; sign-ups." },
  { value: "member", label: "Member", owns: "A responsibility agreed at the WOC." },
] as const;

export type WocRole = (typeof WOC_ROLES)[number]["value"];

export const WOC_STATUSES = [
  { value: "forming", label: "Forming" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "disbanded", label: "Disbanded" },
] as const;

export const WOC_FORMATS = [
  { value: "in_person", label: "In person" },
  { value: "video", label: "Video" },
  { value: "split_swing", label: "Split swing" },
  { value: "mixed", label: "Mixed" },
] as const;

export const COVERAGE_STATUSES: Record<
  string,
  { label: string; badgeClass: string }
> = {
  covered: {
    label: "Covered",
    badgeClass:
      "border-emerald-500 text-emerald-700 dark:border-emerald-600 dark:text-emerald-400",
  },
  leader_no_second: {
    label: "Leader — no second",
    badgeClass:
      "border-amber-500 text-amber-700 dark:border-amber-600 dark:text-amber-400",
  },
  gap: {
    label: "Gap",
    badgeClass: "border-red-500 text-red-700 dark:border-red-600 dark:text-red-400",
  },
};
