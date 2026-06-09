"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Play, Search, Download, Clock, RotateCcw, FileText, GraduationCap } from "lucide-react";

interface Clip {
  id: string;
  title: string;
  series: string;
  seriesName: string;
  order: number;
  durationSec: number;
  summary: string;
  tags: string[];
  prerequisites: string[];
  upNext: string[];
  video: string;
  vtt?: string | null;
  transcript?: string | null;
}
interface Manifest { count: number; series: Record<string, string>; clips: Clip[] }

const SERIES_ORDER = ["O", "A", "B", "C", "D", "E"];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

// Media lives in the per-environment Supabase Storage "help-videos" bucket.
// Manifest stores object paths (e.g. "help-videos/A1.mp4"); build the full URL
// from this env's Supabase URL so develop->DEV and main->PROD each serve their own.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const mediaUrl = (p?: string | null) =>
  !p ? "" : /^https?:\/\//.test(p) || p.startsWith("/") ? p : `${SUPABASE_URL}/storage/v1/object/public/${p}`;

export default function HelpPage() {
  const [data, setData] = useState<Manifest | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    fetch("/help-videos/manifest.json")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((m: Manifest) => { setData(m); setSelectedId(m.clips[0]?.id ?? null); })
      .catch(() => setError(true));
  }, []);

  const clips = useMemo(() => data?.clips ?? [], [data]);
  const byId = useMemo(() => Object.fromEntries(clips.map((c) => [c.id, c])), [clips]);
  const selected = selectedId ? byId[selectedId] : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clips;
    return clips.filter((c) =>
      (c.title + " " + c.summary + " " + c.tags.join(" ") + " " + c.seriesName).toLowerCase().includes(q)
    );
  }, [clips, query]);

  const grouped = useMemo(() => {
    const g: Record<string, Clip[]> = {};
    for (const c of filtered) (g[c.series] ??= []).push(c);
    return g;
  }, [filtered]);

  const select = (id: string) => {
    setSelectedId(id);
    setEnded(false);
    requestAnimationFrame(() => videoRef.current?.play().catch(() => {}));
  };

  const upNextClips = (selected?.upNext ?? []).map((id) => byId[id]).filter(Boolean) as Clip[];

  if (error) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
        Couldn&apos;t load the guide library. Make sure <code>public/help-videos/manifest.json</code> exists.
      </div>
    );
  }
  if (!data || !selected) {
    return <div className="p-10 text-center text-muted-foreground">Loading guides…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <GraduationCap className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">How-to guides</h1>
          <p className="text-muted-foreground">Short walkthroughs for setting up and running manual campaigns.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        {/* Player + details */}
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-xl border bg-black">
            <video
              ref={videoRef}
              key={selected.id}
              className="aspect-video w-full"
              controls
              onEnded={() => setEnded(true)}
              onPlay={() => setEnded(false)}
            >
              <source src={mediaUrl(selected.video)} type="video/mp4" />
              {selected.vtt && <track kind="captions" src={mediaUrl(selected.vtt)} srcLang="en" label="English" default />}
            </video>

            {ended && upNextClips.length > 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6">
                <p className="text-sm font-medium uppercase tracking-wide text-white/70">Up next</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {upNextClips.slice(0, 3).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => select(c.id)}
                      className="w-48 rounded-lg bg-white/10 p-3 text-left text-white transition hover:bg-white/20"
                    >
                      <div className="mb-1 flex items-center gap-1 text-xs text-white/60">
                        <Play className="h-3 w-3" /> {fmt(c.durationSec)}
                      </div>
                      <div className="text-sm font-medium leading-snug">{c.title}</div>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => { setEnded(false); videoRef.current?.play().catch(() => {}); }}
                  className="mt-1 flex items-center gap-2 text-sm text-white/70 hover:text-white"
                >
                  <RotateCcw className="h-4 w-4" /> Replay
                </button>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{selected.seriesName}</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> {fmt(selected.durationSec)}</span>
            </div>
            <h2 className="text-xl font-semibold">{selected.title}</h2>
            <p className="mt-1 text-muted-foreground">{selected.summary}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <a
                href={mediaUrl(selected.video)}
                download
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent"
              >
                <Download className="h-4 w-4" /> Download / share
              </a>
              {selected.transcript && (
                <a
                  href={mediaUrl(selected.transcript)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent"
                >
                  <FileText className="h-4 w-4" /> Transcript
                </a>
              )}
            </div>
            {upNextClips.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Up next</p>
                <div className="flex flex-wrap gap-2">
                  {upNextClips.map((c) => (
                    <button key={c.id} onClick={() => select(c.id)} className="rounded-full border px-3 py-1 text-sm hover:bg-accent">
                      {c.title} <span className="text-muted-foreground">· {fmt(c.durationSec)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Catalog */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search guides…"
              className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
            {SERIES_ORDER.filter((s) => grouped[s]?.length).map((s) => (
              <div key={s}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{data.series[s]}</p>
                <div className="space-y-2">
                  {grouped[s].map((c) => (
                    <button
                      key={c.id}
                      onClick={() => select(c.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition hover:bg-accent",
                        c.id === selected.id && "border-primary bg-accent"
                      )}
                    >
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Play className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{c.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{c.summary}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{fmt(c.durationSec)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">No guides match “{query}”.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
