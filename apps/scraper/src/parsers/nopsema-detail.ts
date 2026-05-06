import * as cheerio from "cheerio";

export interface DetailFields {
  project_name: string | null;
  associated_project: string | null;
  location_text: string | null;
  end_date: string | null;
  raw_fields: Record<string, string>;
}

// NOPSEMA detail pages render labelled key/value rows (e.g. <dt>/<dd>
// or <th>/<td> pairs). We collect them all into raw_fields then map
// the labels we care about. Casing/whitespace tolerant.
const NORM = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, " ").replace(/[:.]+$/, "").trim();

const LABEL_MAP: Record<string, keyof Omit<DetailFields, "raw_fields">> = {
  "project name": "project_name",
  "associated project": "associated_project",
  location: "location_text",
  "end date": "end_date",
  "expected end date": "end_date",
  "completion date": "end_date",
};

export function parseDetail(html: string): DetailFields {
  const $ = cheerio.load(html);
  const raw: Record<string, string> = {};

  $("dl").each((_, dl) => {
    const $dl = $(dl);
    const dts = $dl.find("dt").toArray();
    const dds = $dl.find("dd").toArray();
    for (let i = 0; i < Math.min(dts.length, dds.length); i++) {
      const k = NORM($(dts[i]!).text());
      const v = $(dds[i]!).text().trim();
      if (k && v) raw[k] = v;
    }
  });

  $("table tr").each((_, tr) => {
    const $tr = $(tr);
    const cells = $tr.find("th, td").toArray();
    if (cells.length === 2) {
      const k = NORM($(cells[0]!).text());
      const v = $(cells[1]!).text().trim();
      if (k && v) raw[k] = v;
    }
  });

  const out: DetailFields = {
    project_name: null,
    associated_project: null,
    location_text: null,
    end_date: null,
    raw_fields: raw,
  };

  for (const [label, key] of Object.entries(LABEL_MAP)) {
    if (raw[label]) {
      out[key] = raw[label] ?? null;
    }
  }

  return out;
}
