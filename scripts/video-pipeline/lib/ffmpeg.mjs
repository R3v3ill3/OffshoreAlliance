import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { FONT } from "../config.mjs";

const execFileP = promisify(execFile);

async function run(args) {
  return execFileP("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], {
    maxBuffer: 1024 * 1024 * 128,
  });
}

let _font;
export async function fontFile() {
  if (_font !== undefined) return _font;
  const candidates = [
    FONT,
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/SFNS.ttf",
  ];
  for (const f of candidates) {
    try { await fs.access(f); _font = f; return f; } catch {}
  }
  _font = null;
  return null;
}

// Escape text for ffmpeg drawtext.
function esc(t) {
  return String(t)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,")
    .replace(/%/g, "\\%");
}

export async function concatAudio(files, out) {
  const list = out + ".txt";
  await fs.writeFile(list, files.map((f) => `file '${f}'`).join("\n"));
  await run(["-f", "concat", "-safe", "0", "-i", list, "-c:a", "libmp3lame", "-q:a", "3", out]);
  await fs.rm(list, { force: true });
}

// A full-frame title/closing card (1920x1080, h264/aac, silent).
export async function makeCard({ title, subtitle, seconds, out, bg = "0x0b1220" }) {
  const font = await fontFile();
  const draws = [];
  if (font && title)
    draws.push(`drawtext=fontfile='${font}':text='${esc(title)}':fontcolor=white:fontsize=84:x=(w-text_w)/2:y=(h/2)-90`);
  if (font && subtitle)
    draws.push(`drawtext=fontfile='${font}':text='${esc(subtitle)}':fontcolor=0x9fb3c8:fontsize=40:x=(w-text_w)/2:y=(h/2)+30`);
  const vf = draws.length ? draws.join(",") : "null";
  await run([
    "-f", "lavfi", "-i", `color=c=${bg}:s=1920x1080:r=30:d=${seconds}`,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-vf", vf,
    "-t", String(seconds),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-ar", "48000", "-ac", "2",
    out,
  ]);
}

// Recorded walkthrough + narration + optional lower-third title for the first
// few seconds. Output normalized to the same codec params as the cards.
export async function buildMain({ video, audio, lowerThird, out, lowerSeconds = 4.5, trimStart = 0 }) {
  const font = await fontFile();
  const chain = [
    "scale=1920:1080:force_original_aspect_ratio=decrease",
    "pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
    "fps=30",
    "format=yuv420p",
  ];
  if (font && lowerThird) {
    chain.push(
      `drawtext=fontfile='${font}':text='${esc(lowerThird)}':fontcolor=white:fontsize=46:x=80:y=h-170:box=1:boxcolor=0x0b1220@0.78:boxborderw=26:enable='lt(t,${lowerSeconds})'`
    );
  }
  // -ss before -i trims the leading page-load portion so the recorded walkthrough
  // starts exactly where the narration starts (output timestamps restart at 0).
  const videoInput = trimStart > 0 ? ["-ss", trimStart.toFixed(3), "-i", video] : ["-i", video];
  await run([
    ...videoInput,
    "-i", audio,
    "-filter:v", chain.join(","),
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-ar", "48000", "-ac", "2",
    "-shortest",
    out,
  ]);
}

// Concatenate the equally-encoded parts (re-encode for clean joins).
export async function concatParts(parts, out) {
  const list = out + ".txt";
  await fs.writeFile(list, parts.map((f) => `file '${f}'`).join("\n"));
  await run([
    "-f", "concat", "-safe", "0", "-i", list,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-ar", "48000", "-ac", "2",
    out,
  ]);
  await fs.rm(list, { force: true });
}

export async function durationOf(file) {
  const { stdout } = await execFileP("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ]);
  return parseFloat(stdout.trim());
}
