// Combine per-clip manifest.json files into one library manifest.
import fs from "node:fs/promises";
import path from "node:path";
import { OUT } from "./config.mjs";

const dirs = await fs.readdir(OUT, { withFileTypes: true });
const clips = [];
for (const d of dirs) {
  if (!d.isDirectory()) continue;
  const mf = path.join(OUT, d.name, `${d.name}.manifest.json`);
  try {
    const j = JSON.parse(await fs.readFile(mf, "utf8"));
    clips.push(j);
  } catch {}
}
clips.sort((a, b) => a.id.localeCompare(b.id));
const manifest = {
  generatedFrom: "scripts/video-pipeline",
  count: clips.length,
  clips,
};
const out = path.join(OUT, "video-manifest.json");
await fs.writeFile(out, JSON.stringify(manifest, null, 2));
console.log(`Wrote ${out} with ${clips.length} clips: ${clips.map((c) => c.id).join(", ")}`);
