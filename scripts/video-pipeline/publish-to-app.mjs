// Write the /help manifest pointing at Supabase Storage object paths.
// The app builds full URLs from NEXT_PUBLIC_SUPABASE_URL, so each environment
// (develop->DEV, main->PROD) serves from its own bucket. Upload the actual media
// with upload-to-storage.mjs. No binaries are copied into the app.
import fs from "node:fs/promises";
import path from "node:path";
import { OUT, ROOT } from "./config.mjs";

const APP_PUBLIC = path.resolve(ROOT, "../../apps/organising-db/public");
const DEST = path.join(APP_PUBLIC, "help-videos");
await fs.mkdir(DEST, { recursive: true });
const BUCKET = "help-videos";

const SERIES_NAME = {
  O: "Overview",
  A: "Set up a campaign",
  B: "Units, groups & subgroups",
  C: "Wall charts",
  D: "Tasking",
  E: "Assessments & ratings",
};
const JOURNEY = ["A1","A2","A3","A4","A5","B1","B2","B3","C1","C2","C3","E1","E2","E3","D1","D2","D3","D4"];

const dirs = await fs.readdir(OUT, { withFileTypes: true });
const clips = [];
for (const d of dirs) {
  if (!d.isDirectory()) continue;
  const id = d.name;
  let mf;
  try { mf = JSON.parse(await fs.readFile(path.join(OUT, id, `${id}.manifest.json`), "utf8")); } catch { continue; }
  // require the mp4 to have been produced
  try { await fs.access(path.join(OUT, id, `${id}.mp4`)); } catch { continue; }
  clips.push({
    ...mf,
    seriesName: SERIES_NAME[mf.series] || mf.series,
    order: id === "OVERVIEW" ? -1 : JOURNEY.indexOf(id) === -1 ? 999 : JOURNEY.indexOf(id),
    // storage object paths (app prefixes with <SUPABASE_URL>/storage/v1/object/public/)
    video: `${BUCKET}/${id}.mp4`,
    vtt: `${BUCKET}/${id}.vtt`,
    transcript: `${BUCKET}/${id}.transcript.txt`,
  });
}
clips.sort((a, b) => a.order - b.order);
await fs.writeFile(path.join(DEST, "manifest.json"), JSON.stringify({ count: clips.length, series: SERIES_NAME, storage: BUCKET, clips }, null, 2));
console.log(`Wrote manifest (${clips.length} clips, storage paths) → ${path.join(DEST, "manifest.json")}`);
console.log("Order:", clips.map((c) => c.id).join(", "));
