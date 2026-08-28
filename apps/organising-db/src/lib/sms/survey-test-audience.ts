/**
 * Who a test-mode survey is allowed to reach.
 *
 * The `is_test` switch is ON by default and used to change nothing but
 * a badge — a survey flagged "Test" could be opened against the entire
 * campaign workforce. Test mode now resolves its own audience from
 * sms_test_recipients instead of whatever the organiser picked, so the
 * default-on switch is safe by construction rather than by care.
 *
 * Scope: the org-wide roster (campaign_id IS NULL) plus any testers
 * added for this campaign specifically.
 */

import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Ceiling on a single test send. A test roster is meant to be a
 * handful of colleagues; a number this large almost certainly means
 * the roster has been filled with real members by mistake, and the
 * point of test mode is that such a mistake cannot reach them.
 */
export const TEST_AUDIENCE_CAP = 25;

export const EMPTY_TEST_ROSTER_MESSAGE =
  "No test recipients yet. Add the numbers you want test sends to reach " +
  "under Test recipients, then open the test. Test mode never sends to " +
  "the campaign audience.";

export const TEST_ROSTER_OVER_CAP_MESSAGE =
  `The test roster holds more than ${TEST_AUDIENCE_CAP} people. Test ` +
  "sends are meant for a handful of colleagues — trim the roster before " +
  "opening this test.";

export interface TestAudienceResult {
  workerIds: number[];
  error?: { status: number; message: string };
}

/**
 * Worker ids on the test roster for this campaign.
 *
 * Deliberately ignores any audience the caller supplied: in test mode
 * there is no legitimate way to reach the campaign workforce, so the
 * choice is not "override if set" but "the roster, always".
 */
export async function resolveTestAudienceWorkerIds(
  supabase: Db,
  campaignId: number,
): Promise<TestAudienceResult> {
  const { data, error } = await supabase
    .from("sms_test_recipients")
    .select("worker_id, campaign_id")
    .or(`campaign_id.is.null,campaign_id.eq.${campaignId}`);
  if (error) throw error;

  const workerIds = [
    ...new Set(
      (data ?? []).map((r: { worker_id: number }) => r.worker_id),
    ),
  ];

  if (workerIds.length === 0) {
    return { workerIds: [], error: { status: 409, message: EMPTY_TEST_ROSTER_MESSAGE } };
  }
  if (workerIds.length > TEST_AUDIENCE_CAP) {
    return {
      workerIds: [],
      error: { status: 409, message: TEST_ROSTER_OVER_CAP_MESSAGE },
    };
  }
  return { workerIds };
}
