// OVERVIEW — the big-picture narrated walkthrough of campaign setup + workflow.
// Chaptered title cards narrated by Natasha (no live capture needed).
import fs from "node:fs/promises";
import path from "node:path";
import { OUT } from "../config.mjs";
import { generateSegments, buildVtt } from "../lib/tts.mjs";
import * as ff from "../lib/ffmpeg.mjs";

const ID = "OVERVIEW";
const TITLE = "OffshoreAlliance campaigns: the big picture";
const work = path.join(OUT, ID);
await fs.mkdir(work, { recursive: true });

const CHAPTERS = [
  { t: "Campaigns", s: "Setup, structure, and action", n: "Welcome. This is the big picture of running a manual campaign in the OffshoreAlliance database, from first setup through to organising your workforce." },
  { t: "1. Set up", s: "Employers, worksites, workers, campaign", n: "Setup follows a simple spine. Add the employers you're organising against, add their worksites, import your workforce from a spreadsheet, then create the campaign and configure it from Settings." },
  { t: "2. Structure", s: "Organising units, groups & subgroups", n: "Next, give your workforce structure. Organising units group workers into blocks, by shift, department, or worksite. Group containers bundle units of the same type, and workers belong to the member units." },
  { t: "3. The wall chart", s: "Your campaign at a glance", n: "The wall chart is your operational picture. Every column is a unit, every tile a worker, coloured by their rating. Filter it, switch views, and read at a glance who's with you." },
  { t: "4. Assessments & ratings", s: "Measure support", n: "Assessments capture where each worker stands on a question. Ratings run from supportive leaders through to opposed, and drive the colours, the filters, and your strength snapshots." },
  { t: "5. Tasking", s: "Turn the picture into action", n: "From the wall chart, build a list and fire it. Email a cohort, set up a phone bank, or assign a leader an activist task list to assess and recruit their co-workers." },
  { t: "It all loops", s: "Action feeds the picture", n: "And it all connects. Ratings from your calls, emails, and leader forms flow back to the wall chart, so your picture stays current as the campaign grows. Open any guide from the hub to dive in." },
];

console.log(`[${ID}] narration…`);
const segs = await generateSegments(CHAPTERS.map((c) => c.n), path.join(work, "audio"));

console.log(`[${ID}] build chapter cards…`);
const intro = path.join(work, "intro.mp4");
await ff.makeCard({ title: "The big picture", subtitle: "OffshoreAlliance How-to", seconds: 2.5, out: intro });
const parts = [intro];
for (let i = 0; i < CHAPTERS.length; i++) {
  const out = path.join(work, `ch${i}.mp4`);
  await ff.makeNarratedCard({ title: CHAPTERS[i].t, subtitle: CHAPTERS[i].s, audio: segs[i].file, seconds: segs[i].duration + 0.4, out });
  parts.push(out);
}
const outro = path.join(work, "outro.mp4");
await ff.makeCard({ title: "Open the Guides hub", subtitle: "to watch any step in detail", seconds: 3, out: outro });
parts.push(outro);

console.log(`[${ID}] assemble…`);
const finalOut = path.join(work, `${ID}.mp4`);
await ff.concatParts(parts, finalOut);

// captions/transcript/manifest
await fs.writeFile(path.join(work, `${ID}.vtt`), buildVtt(segs, { lead: 2.5 }));
await fs.writeFile(path.join(work, `${ID}.transcript.txt`), CHAPTERS.map((c) => c.n).join("\n"));
const dur = Math.round(await ff.durationOf(finalOut));
const manifest = {
  id: ID, title: TITLE, series: "O", durationSec: dur,
  summary: "The big-picture walkthrough: setup, structure, wall chart, assessments, and tasking — and how they connect.",
  tags: ["overview", "big picture", "workflow", "getting started", "campaign"],
  associatedRoutes: ["/campaigns", "/campaigns/*"], routeWeight: 2,
  prerequisites: [], upNext: ["A1", "B1", "C1"],
  transcriptPath: `${ID}.transcript.txt`, videoPath: `${ID}.mp4`, downloadable: true,
};
await fs.writeFile(path.join(work, `${ID}.manifest.json`), JSON.stringify(manifest, null, 2));
console.log(`[${ID}] DONE → ${finalOut} (${dur}s)`);
