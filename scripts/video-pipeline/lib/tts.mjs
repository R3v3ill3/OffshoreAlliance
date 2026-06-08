import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TTS_BASE, VOICE, RATE } from "../config.mjs";

const execFileP = promisify(execFile);

export async function ffprobeDuration(file) {
  const { stdout } = await execFileP("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  return parseFloat(stdout.trim());
}

/**
 * Generate one MP3 per narration segment via the local edge-tts app.
 * segments: string[]  (each is a spoken line, in order)
 * returns: [{ index, text, file, duration }]
 */
export async function generateSegments(segments, outDir, { voice = VOICE, rate = RATE } = {}) {
  await fs.mkdir(outDir, { recursive: true });
  const results = [];
  for (let i = 0; i < segments.length; i++) {
    const text = segments[i];
    const res = await fetch(`${TTS_BASE}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, rate }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`TTS failed for segment ${i}: HTTP ${res.status} ${detail}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const file = path.join(outDir, `seg_${String(i).padStart(2, "0")}.mp3`);
    await fs.writeFile(file, buf);
    const duration = await ffprobeDuration(file);
    results.push({ index: i, text, file, duration });
  }
  return results;
}

/** Build a WebVTT caption file from timed segments. */
export function buildVtt(segments, { lead = 2.5 } = {}) {
  const fmt = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = (s % 60).toFixed(3).padStart(6, "0");
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${sec}`;
  };
  let t = lead; // intro card offset
  let out = "WEBVTT\n\n";
  for (const seg of segments) {
    const start = t;
    const end = t + seg.duration;
    out += `${fmt(start)} --> ${fmt(end)}\n${seg.text}\n\n`;
    t = end;
  }
  return out;
}
