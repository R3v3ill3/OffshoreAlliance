# Text-to-Voice App — Handoff Prompt for Claude Code

Paste the block below as your opening message in a new Claude Code chat session rooted at the offshoreAlliance project. It gives the new session everything it needs to read, modify, or integrate the Text-to-Voice app.

---

## PROMPT (copy everything below this line)

I'm working on the **Offshore Alliance** project at:
`/Volumes/DataDrive/cursor_repos/offshoreAlliance/`

There is a companion local app — a **Text-to-Voice generator** — that lives at:
`/Volumes/DataDrive/cursor_repos/text to voice/`

Both projects share the root `/Volumes/DataDrive/cursor_repos/`.

---

### What the Text-to-Voice app is

A locally-running web app (Python FastAPI backend + vanilla HTML/CSS/JS frontend) that converts pasted or dragged text into Australian-accented MP3 audio files. It is used to produce narration for tutorial/how-to videos.

**Start it:**
```bash
cd "/Volumes/DataDrive/cursor_repos/text to voice"
.venv/bin/python main.py
# Opens at http://127.0.0.1:8000
```

**Or double-click** `~/Desktop/Text to Voice.app` (macOS app bundle).

---

### File structure

```
text to voice/
├── main.py              # FastAPI backend — all server logic
├── requirements.txt
├── run.sh               # One-click start script
├── make_icon.py         # Icon generator (Pillow) — dev utility only
├── AppIcon.icns         # Custom app icon
├── Text to Voice.app/   # macOS app bundle (double-click launcher)
├── .venv/               # Python 3.11 virtualenv
├── .env.example         # Config template (copy to .env to set ANTHROPIC_API_KEY)
└── static/
    ├── index.html
    ├── style.css
    └── app.js
```

---

### Backend API — full reference

Base URL: `http://127.0.0.1:8000`

CORS is enabled for any `localhost` or `127.0.0.1` origin (any port), so the Offshore Alliance Next.js frontend can call it directly.

#### `GET /voices`
Returns the available voices.
```json
{
  "voices": [
    { "id": "en-AU-NatashaNeural",            "name": "Natasha",  "locale": "AU", "gender": "F" },
    { "id": "en-NZ-MollyNeural",              "name": "Molly",    "locale": "NZ", "gender": "F" },
    { "id": "en-AU-WilliamMultilingualNeural", "name": "William",  "locale": "AU", "gender": "M" },
    { "id": "en-NZ-MitchellNeural",           "name": "Mitchell", "locale": "NZ", "gender": "M" }
  ]
}
```

#### `POST /generate`
Converts text to MP3 audio. Returns raw `audio/mpeg` bytes.
```json
// Request body
{
  "text": "Your script here...",
  "voice": "en-AU-NatashaNeural",   // one of the IDs above
  "rate": 0                          // integer -50 to +50 (percentage speed adjustment)
}
```
The generated audio is also cached server-side for the `/save` endpoint.

#### `POST /pick-folder`
Opens a native macOS folder-picker dialog (osascript).
Returns `{ "folder": "/absolute/path" }` or `{ "folder": null }` if cancelled.

#### `POST /save`
Saves the last generated audio to the previously picked folder.
Filename format: `tts_YYYYMMDD_HHMMSS.mp3`
Returns `{ "saved_to": "/full/path/tts_....mp3", "filename": "tts_....mp3" }`.

#### `POST /preprocess`
Optionally cleans text via Claude Haiku before TTS (strips HTML, fixes punctuation, etc.).
```json
// Request body
{ "text": "raw pasted text...", "api_key": "sk-ant-..." }
// Response
{ "text": "cleaned text ready for TTS" }
```

#### `GET /config`
Returns `{ "has_api_key": true/false }` — whether ANTHROPIC_API_KEY is set in `.env`.

---

### Tech stack

| Layer | Detail |
|---|---|
| Language | Python 3.11 (virtualenv at `.venv/`) |
| Framework | FastAPI + uvicorn |
| TTS engine | `edge-tts` — calls Microsoft's neural TTS API (requires internet, no key needed) |
| Icon | Generated with Pillow; converted to ICNS via macOS `sips` + `iconutil` |
| Folder picker | `osascript` — `choose folder` AppleScript dialog |
| Text cleanup | Anthropic SDK — `claude-haiku-4-5-20251001` model |
| Frontend | Vanilla HTML/CSS/JS, no build step |

**Voice note:** edge-tts only exposes 2 live Australian voices (Natasha F, William M). Two New Zealand voices (Molly F, Mitchell M) are included as the closest available accent. The `CarlyNeural` and `DarrenNeural` voice IDs appear in docs but return `NoAudioReceived` at runtime and must not be used.

---

### Key implementation details

**`main.py` module-level state** (single-user local tool — no sessions):
- `current_audio: bytes | None` — last generated MP3, held for `/save`
- `output_folder: str | None` — folder path from the picker

**Speed → rate mapping:**
- Slider value: integer −50 to +50
- edge-tts `rate` param: `"+25%"` / `"-10%"` (always include sign and `%`)

**CORS middleware** allows any `localhost` or `127.0.0.1` origin, so calling from Offshore Alliance's Next.js dev server (typically `:3000`) works without proxy.

---

### Calling the TTS API from the Offshore Alliance frontend

```typescript
// Minimal example — call from any Next.js component or API route
const TTS_BASE = "http://127.0.0.1:8000";

async function generateAudio(text: string, voice = "en-AU-NatashaNeural", rate = 0): Promise<Blob> {
  const res = await fetch(`${TTS_BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, rate }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail);
  }
  return res.blob(); // audio/mpeg
}

// Play it
const blob = await generateAudio("Welcome to the offshore alliance.");
const url = URL.createObjectURL(blob);
const audio = new Audio(url);
audio.play();
```

---

### What I may ask you to do

- Add new voices or switch TTS provider
- Modify the UI layout, theme, or controls
- Add new backend endpoints (e.g. batch generation, subtitle/SRT export)
- Integrate TTS generation into the Offshore Alliance UI
- Adjust the Anthropic text pre-processing prompt
- Fix bugs or improve error handling

When modifying `main.py`, always restart the server after saving (`python main.py` from the project root with `.venv` activated). The frontend is served as static files — changes to `static/` take effect on browser refresh.
