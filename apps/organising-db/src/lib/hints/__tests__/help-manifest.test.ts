import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * WP1.7 — integrity of the shipped Guides manifest
 * (public/help-videos/manifest.json).
 *
 * The manifest is a GENERATED file: scripts/video-pipeline/publish-to-app.mjs
 * overwrites it wholesale from the local, untracked clip specs. Nothing in
 * `src` reads `associatedRoutes` today (wp1.7.md §2.1.1), so the only thing
 * that can notice a regeneration silently dropping this package's six route
 * additions — or a retired word creeping back in — is this file.
 *
 * The route inventory is built at test time from `src/app/** /page.tsx` so it
 * can never go stale. Glob semantics are defined here, once, because the app
 * defines them nowhere: `*` matches ONE OR MORE path segments, which is the
 * reading that makes `/campaigns/* /email/*` cover
 * `/campaigns/1/email/setup/order` — the flow D1 teaches.
 */

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const MANIFEST = resolve(APP_ROOT, "public/help-videos/manifest.json");
const APP_DIR = resolve(APP_ROOT, "src/app");

interface Clip {
  id: string;
  title: string;
  summary: string;
  series: string;
  tags?: string[];
  associatedRoutes: string[];
}

interface Manifest {
  count: number;
  series: Record<string, string>;
  clips: Clip[];
}

/** The 19 clips as they ship. "Nothing is removed" made executable. */
const CLIP_IDS = [
  "A1", "A2", "A3", "A4", "A5",
  "B1", "B2", "B3",
  "C1", "C2", "C3",
  "D1", "D2", "D3", "D4",
  "E1", "E2", "E3",
  "OVERVIEW",
] as const;

/** The drift alarm for wp1.7.md §2.1.6 / §2.1.7. */
const MANIFEST_REQUIRED_ROUTES: Record<string, string[]> = {
  OVERVIEW: ["/campaigns", "/campaigns/*", "/my-campaigns"],
  A4: ["/campaigns", "/campaigns/new/manual", "/my-campaigns"],
  D1: ["/campaigns/*/email/*", "/actions"],
  D2: ["/campaigns/*/phone", "/campaigns/*/phone/lists/*", "/actions"],
};

/** Retired vocabulary (WP0.3 renames, plan 3.6). */
const STALE_LABEL = /scope|unalloc|sms tools|universe|no unit/i;

function walkPages(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkPages(full, out);
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

/**
 * Every app route as a concrete sample path: route groups `(x)` are dropped,
 * `[id]` and `[...slug]` become `1`, and the root page is `/`.
 */
function routeInventory(): string[] {
  return walkPages(APP_DIR, [])
    .map((file) => relative(APP_DIR, dirname(file)).split(sep))
    .map((segments) =>
      segments
        .filter((s) => s.length > 0 && !/^\(.*\)$/.test(s))
        .map((s) => (/^\[.*\]$/.test(s) ? "1" : s))
    )
    .map((segments) => "/" + segments.join("/"))
    .sort();
}

function globToRegExp(glob: string): RegExp {
  const source = glob
    .split("*")
    .map((literal) => literal.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]+(?:/[^/]+)*");
  return new RegExp(`^${source}$`);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
const routes = routeInventory();

describe("help-videos manifest", () => {
  it("has the expected structure", () => {
    expect(manifest.clips.length).toBe(19);
    expect(manifest.count).toBe(19);
    const seriesIds = new Set(Object.keys(manifest.series));
    for (const clip of manifest.clips) {
      expect(clip.id, "clip id").toBeTruthy();
      expect(clip.title, `${clip.id} title`).toBeTruthy();
      expect(clip.summary, `${clip.id} summary`).toBeTruthy();
      expect(seriesIds.has(clip.series), `${clip.id} series ${clip.series} is declared`).toBe(true);
      expect(Array.isArray(clip.associatedRoutes), `${clip.id} associatedRoutes`).toBe(true);
      expect(clip.associatedRoutes.length, `${clip.id} has at least one route`).toBeGreaterThan(0);
      for (const r of clip.associatedRoutes) {
        expect(typeof r === "string" && r.startsWith("/"), `${clip.id} route ${r}`).toBe(true);
      }
    }
  });

  it("builds a route inventory that includes the screens the clips teach", () => {
    for (const r of [
      "/",
      "/campaigns",
      "/campaigns/1",
      "/campaigns/1/settings",
      "/campaigns/1/email/import",
      "/campaigns/1/phone/lists/1",
      "/campaigns/1/phone/call/1",
      "/campaigns/1/phone/live",
      "/campaigns/new/manual",
      "/leader/task/1",
      "/my-campaigns",
      "/actions",
    ]) {
      expect(routes, `inventory has ${r}`).toContain(r);
    }
  });

  it("resolves every associatedRoutes glob to at least one real app route", () => {
    for (const clip of manifest.clips) {
      const unmatched = clip.associatedRoutes.filter((glob) => {
        const re = globToRegExp(glob);
        return !routes.some((route) => re.test(route));
      });
      expect(
        unmatched,
        `${clip.id}: no app route under src/app matches ${unmatched.join(", ")}`
      ).toEqual([]);
    }
  });

  it("keeps the WP1.7 route additions (regeneration drift alarm)", () => {
    for (const [id, required] of Object.entries(MANIFEST_REQUIRED_ROUTES)) {
      const clip = manifest.clips.find((c) => c.id === id);
      expect(clip, `clip ${id} exists`).toBeTruthy();
      for (const r of required) {
        expect(
          clip?.associatedRoutes.includes(r),
          `${id} lost route ${r} — did scripts/video-pipeline/publish-to-app.mjs regenerate the manifest? See wp1.7.md §2.1.7.`
        ).toBe(true);
      }
    }
  });

  it("drops no clip", () => {
    const ids = manifest.clips.map((c) => c.id).sort();
    expect(ids).toEqual([...CLIP_IDS]);
  });

  it("carries no retired label", () => {
    for (const clip of manifest.clips) {
      const text = [clip.title, clip.summary, ...(clip.tags ?? [])].join(" ");
      expect(STALE_LABEL.test(text), `${clip.id} uses a retired word: ${text}`).toBe(false);
    }
  });
});
