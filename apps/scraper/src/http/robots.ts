import { buildUserAgent } from "./fetch";
import { logger } from "../logger";

export async function checkRobotsAllowed(targetUrl: string): Promise<boolean> {
  try {
    const u = new URL(targetUrl);
    const robotsUrl = `${u.origin}/robots.txt`;
    const response = await fetch(robotsUrl, {
      headers: { "user-agent": buildUserAgent() },
    });
    if (!response.ok) {
      logger.info({ robotsUrl, status: response.status }, "robots.txt not found, assuming allowed");
      return true;
    }
    const body = await response.text();
    const path = u.pathname || "/";
    const lines = body.split("\n").map((l) => l.trim());
    let appliesToUs = false;
    for (const line of lines) {
      if (!line || line.startsWith("#")) continue;
      const lower = line.toLowerCase();
      if (lower.startsWith("user-agent:")) {
        const ua = lower.split(":", 2)[1]?.trim() ?? "";
        appliesToUs = ua === "*" || ua === "offshorealliance-bot";
        continue;
      }
      if (appliesToUs && lower.startsWith("disallow:")) {
        const rule = line.split(":", 2)[1]?.trim() ?? "";
        if (rule && path.startsWith(rule)) {
          logger.warn({ rule, path }, "robots.txt disallows this path");
          return false;
        }
      }
    }
    return true;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "robots.txt check failed; defaulting to allowed");
    return true;
  }
}
