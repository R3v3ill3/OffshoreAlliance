import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig } from "./config";
import { logger } from "./logger";
import { runScrape } from "./pipeline/run";

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readUserFromHeader(req: IncomingMessage): string | null {
  const raw = req.headers["x-triggered-by"];
  if (typeof raw === "string" && raw.length > 0 && raw.length < 200) return raw;
  return null;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const cfg = loadConfig();
  const url = req.url ?? "/";
  const method = req.method ?? "GET";

  if (method === "GET" && (url === "/" || url === "/health")) {
    send(res, 200, { ok: true, service: "oa-scraper" });
    return;
  }

  if (method === "POST" && url === "/scrape") {
    const provided = req.headers["x-scraper-secret"];
    if (provided !== cfg.SCRAPER_SHARED_SECRET) {
      send(res, 401, { error: "invalid scraper secret" });
      return;
    }

    const triggeredBy = readUserFromHeader(req) ?? "manual";

    // Run async; respond immediately with an ack. The scrape_runs
    // table is the source of truth for progress.
    runScrape({ triggeredBy })
      .then((results) => {
        logger.info({ results }, "manual scrape complete");
      })
      .catch((err) => {
        logger.error({ err: (err as Error).message }, "manual scrape failed");
      });

    send(res, 202, { accepted: true, triggeredBy });
    return;
  }

  send(res, 404, { error: "not found" });
}

const cfg = loadConfig();
const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    logger.error({ err: (err as Error).message }, "unhandled handler error");
    send(res, 500, { error: "internal error" });
  });
});

server.listen(cfg.PORT, () => {
  logger.info({ port: cfg.PORT }, "oa-scraper listening");
});
