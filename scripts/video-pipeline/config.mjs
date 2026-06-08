import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = __dirname;
export const OUT = path.join(__dirname, "output");

// Develop preview ONLY. Never local, never production.
export const BASE_URL =
  process.env.OA_BASE_URL ||
  "https://offshore-alliance-git-develop-reveille-strategy.vercel.app";

// Credentials come from the environment — never commit them.
export const EMAIL = process.env.OA_DEMO_EMAIL || "";
export const PASSWORD = process.env.OA_DEMO_PASSWORD || "";

// Local edge-tts app (Natasha = Australian female).
export const TTS_BASE = process.env.TTS_BASE || "http://127.0.0.1:8000";
export const VOICE = process.env.OA_VOICE || "en-AU-NatashaNeural";
export const RATE = Number(process.env.OA_TTS_RATE ?? 0);

export const VIEWPORT = { width: 1920, height: 1080 };

// macOS font for ffmpeg drawtext (title cards / lower-thirds).
export const FONT = process.env.OA_FONT || "/System/Library/Fonts/Supplemental/Arial.ttf";
