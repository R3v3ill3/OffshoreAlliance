// Copy produced clips into the Next.js app's public/ so /help can serve them
// locally, and write a web manifest the /help page reads.
import fs from "node:fs/promises";
import path from "node:path";
import { OUT, ROOT } from "./config.mjs";

const APP_PUBLIC = path.resolve(ROOT, "../../apps/organising-db/public");
const DEST = path.join(APP_PUBLIC, "help-videos");
await fs.mkdir(DEST, { recursive: true });

const SERIES_NAME = {
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
  const base = path.join(OUT, id);
  let mf;
  try { mf = JSON.parse(await fs.readFile(path.join(base, `${id}.manifest.json`), "utf8")); } catch { continue; }
  // copy assets that exist
  const copy = async (fname) => {
    try { await fs.copyFile(path.join(base, fname), path.join(DEST, fname)); return `/help-videos/${fname}`; }
    catch { return null; }
  };
  const video = await copy(`${id}.mp4`);
  if (!video) continue;
  const vtt = await copy(`${id}.vtt`);
  const transcript = await copy(`${id}.transcript.txt`);
  clips.push({
    ...mf,
    seriesName: SERIES_NAME[mf.series] || mf.series,
    order: JOURNEY.indexOf(id) === -1 ? 999 : JOURNEY.indexOf(id),
    video, vtt, transcript,
  });
}
clips.sort((a, b) => a.order - b.order);
const manifest = { count: clips.length, series: SERIES_NAME, clips };
await fs.writeFile(path.join(DEST, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Published ${clips.length} clips to ${DEST}`);
console.log("Order:", clips.map((c) => c.id).join(", "));
