import * as cheerio from "cheerio";

export interface DetailFields {
  project_name: string | null;
  associated_project: string | null;
  location_text: string | null;
  region_name: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  raw_fields: Record<string, string>;
}

const NORM = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, " ").replace(/[:.]+$/, "").trim();

// NOPSEMA's detail pages render labelled <table tr> rows with two cells
// (label | value). Older docs sometimes use <dl><dt><dd>; we look for
// both shapes to be defensive.
export function parseDetail(html: string): DetailFields {
  const $ = cheerio.load(html);
  const raw: Record<string, string> = {};

  $("dl").each((_, dl) => {
    const $dl = $(dl);
    const dts = $dl.find("dt").toArray();
    const dds = $dl.find("dd").toArray();
    for (let i = 0; i < Math.min(dts.length, dds.length); i++) {
      const k = NORM($(dts[i]!).text());
      const v = $(dds[i]!).text().trim().replace(/\s+/g, " ");
      if (k && v) raw[k] = v;
    }
  });

  $("table tr").each((_, tr) => {
    const $tr = $(tr);
    const cells = $tr.find("th, td").toArray();
    if (cells.length === 2) {
      const k = NORM($(cells[0]!).text());
      const v = $(cells[1]!).text().trim().replace(/\s+/g, " ");
      if (k && v) raw[k] = v;
    }
  });

  return {
    project_name: raw["project"] ?? raw["project name"] ?? null,
    associated_project: raw["associated project"] ?? null,
    location_text: raw["location"] ?? raw["locations"] ?? null,
    region_name: raw["locations"] ?? raw["location"] ?? null,
    start_date: raw["start date"] ?? null,
    end_date:
      raw["stop date"] ?? raw["end date"] ?? raw["expected end date"] ??
      raw["completion date"] ?? null,
    status: raw["outcome"] ?? null,
    raw_fields: raw,
  };
}
