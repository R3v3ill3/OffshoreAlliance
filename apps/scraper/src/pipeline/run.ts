import { adapters } from "../sources";
import { getServiceClient } from "../supabase";
import { loadConfig } from "../config";
import { logger } from "../logger";
import { checkRobotsAllowed } from "../http/robots";
import { upsertProject } from "./upsert";
import {
  loadActiveEmployers,
  matchAndPersist,
  type MatchSummary,
} from "./match";
import { deactivateMissing } from "./deactivate";

export interface RunOptions {
  triggeredBy: string;
}

export interface RunResult {
  runId: number;
  source: string;
  status: "success" | "partial" | "failed";
  recordsSeen: number;
  recordsInserted: number;
  recordsUpdated: number;
  recordsDeactivated: number;
  match: MatchSummary;
}

let runningLock = false;

export async function runScrape(opts: RunOptions): Promise<RunResult[]> {
  if (runningLock) {
    throw new Error("scrape already in progress");
  }
  runningLock = true;

  const supa = getServiceClient();
  const cfg = loadConfig();
  const results: RunResult[] = [];

  try {
    for (const adapter of adapters) {
      // Open a scrape_run row immediately for observability.
      const { data: runRow, error: runErr } = await supa
        .from("upcoming_projects_scrape_runs")
        .insert({
          source: adapter.id,
          status: "running",
          triggered_by: opts.triggeredBy,
        })
        .select("id")
        .single();
      if (runErr) throw runErr;
      const runId = (runRow as { id: number }).id;

      const summary: MatchSummary = { auto: 0, needsReview: 0, unmatched: 0 };
      let inserted = 0;
      let updated = 0;
      let seen = 0;
      let deactivated = 0;
      let status: RunResult["status"] = "success";
      let errorMessage: string | null = null;

      try {
        // Robots.txt check before fetching anything substantive.
        const ok = await checkRobotsAllowed(cfg.NOPSEMA_URL);
        if (!ok) {
          throw new Error("robots.txt disallows scraping target URL");
        }

        const records = await adapter.fetchAll();
        seen = records.length;
        const employers = await loadActiveEmployers(supa);
        const seenIds: string[] = [];

        for (const record of records) {
          const result = await upsertProject(supa, record);
          seenIds.push(record.external_id);
          if (result.was_insert) inserted += 1;
          else if (result.was_change) updated += 1;
          await matchAndPersist(supa, result.id, record, employers, summary);
        }

        deactivated = await deactivateMissing(supa, adapter.id, seenIds);
      } catch (err) {
        status = "failed";
        errorMessage = (err as Error).message;
        logger.error({ source: adapter.id, err: errorMessage }, "scrape run failed");
      }

      const { error: finishErr } = await supa
        .from("upcoming_projects_scrape_runs")
        .update({
          finished_at: new Date().toISOString(),
          status,
          records_seen: seen,
          records_inserted: inserted,
          records_updated: updated,
          records_deactivated: deactivated,
          auto_matched: summary.auto,
          needs_review: summary.needsReview,
          unmatched: summary.unmatched,
          error_message: errorMessage,
        })
        .eq("id", runId);
      if (finishErr) {
        logger.error({ err: finishErr }, "failed to close scrape_run row");
      }

      results.push({
        runId,
        source: adapter.id,
        status,
        recordsSeen: seen,
        recordsInserted: inserted,
        recordsUpdated: updated,
        recordsDeactivated: deactivated,
        match: summary,
      });
    }
  } finally {
    runningLock = false;
  }

  return results;
}
