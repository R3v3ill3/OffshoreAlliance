// Entry point for Railway scheduled jobs (one-shot run, then exit).
// Invoke as: `node dist/cron.js`.

import { runScrape } from "./pipeline/run";
import { logger } from "./logger";

async function main(): Promise<void> {
  try {
    const results = await runScrape({ triggeredBy: "cron" });
    logger.info({ results }, "cron scrape complete");
    process.exit(results.every((r) => r.status === "success") ? 0 : 1);
  } catch (err) {
    logger.error({ err: (err as Error).message }, "cron scrape errored");
    process.exit(1);
  }
}

void main();
