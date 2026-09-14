/**
 * WP2.2 guard (docs/organiser-ux-review/wp/wp2.2.md §3.9, §2.3): no direct
 * client write to `campaign_organising_units` or `campaign_worker_ou` outside
 * the structure API.
 *
 * Case 1 documents the inventory (the 21 files of §2.3; each stage removed
 * the files it switched and the list shrank with it — Stage 4 rows 1–8,
 * Stage 5 rows 9–13, Stage 6 rows 14–21 — so it is now empty). Case 2 is the
 * acceptance criterion itself: green since Stage 6, and the build fails on
 * any regression. Case 3 pins the sync-on-open route (§2.3 row 15a) to "no
 * direct write of its own".
 *
 * Scanner: the §2.3 regex, made robust to the `as never` cast inside or after
 * `.from(...)` and to chains broken across lines.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = path.resolve(__dirname, "../../..");
const EXCLUDED_DIRS = new Set(["__tests__", "__contract__"]);

/** `.from("campaign_organising_units" | "campaign_worker_ou")…(.insert|update|upsert|delete)(` */
export const DIRECT_WRITE_PATTERN =
  /\.from\(\s*['"]campaign_(?:organising_units|worker_ou)['"](?:\s+as\s+never)?\s*\)(?:\s*as\s+never)?\s*\.\s*(?:insert|update|upsert|delete)\s*\(/g;

/** Any `.from(...)` of the two tables, whatever follows. */
const ANY_FROM_PATTERN = /\.from\(\s*['"]campaign_(?:organising_units|worker_ou)['"]/;

/**
 * Files (relative to `src/`) that still write directly to the two tables.
 * Empty since Stage 6: Stage 4 (§11.8) removed the eight wall-chart writers,
 * rows 1–8; Stage 5 (§11.12) the settings, wizard, units-section and hook
 * writers, rows 9–13 (row 13's real path was lib/campaign/, not lib/hooks/;
 * D7); Stage 6 (§11.15) the Recompute and universe-sync libraries and the
 * six API routes, rows 14–21.
 */
export const REMAINING_DIRECT_WRITERS: readonly string[] = [];

/** Row 15a: sync-on-open. Writes only through row 15 (`sync-campaign-universe.ts`). */
const SYNC_ON_OPEN_ROUTE = "app/api/campaigns/[id]/sync-universe-workers/route.ts";

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
}

export function scanDirectWriters(root = SRC_ROOT): string[] {
  const files: string[] = [];
  walk(root, files);
  const hits: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    DIRECT_WRITE_PATTERN.lastIndex = 0;
    if (DIRECT_WRITE_PATTERN.test(source)) {
      hits.push(path.relative(root, file).split(path.sep).join("/"));
    }
  }
  return hits.sort();
}

describe("no direct structure writes (wp2.2.md §3.9 guard)", () => {
  it("direct writers match the documented inventory (wp2.2.md §2.3)", () => {
    const found = scanDirectWriters();
    expect(found).toEqual([...REMAINING_DIRECT_WRITERS].sort());
  });

  it("no direct writers remain (acceptance criterion)", () => {
    const found = scanDirectWriters();
    expect(
      found,
      `${found.length} file(s) still write directly to campaign_organising_units / campaign_worker_ou:\n  ${found.join("\n  ")}`
    ).toEqual([]);
  });

  it("sync-on-open route has no direct write (wp2.2.md §2.3 row 15a)", () => {
    const source = readFileSync(path.join(SRC_ROOT, SYNC_ON_OPEN_ROUTE), "utf8");
    expect(ANY_FROM_PATTERN.test(source)).toBe(false);
    DIRECT_WRITE_PATTERN.lastIndex = 0;
    expect(DIRECT_WRITE_PATTERN.test(source)).toBe(false);
  });
});
