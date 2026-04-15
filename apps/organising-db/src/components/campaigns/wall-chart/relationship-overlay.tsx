"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LeaderLink } from "./use-leader-links";

export type RelationshipOverlayProps = {
  /** Element that contains the worker tiles; tile positions are measured relative to this. */
  containerRef: React.RefObject<HTMLElement | null>;
  links: LeaderLink[];
  /** Worker -> OU(s) map used to decide which links "cross units". */
  unitsByWorker: Map<number, number[]>;
  /** Hidden when false. */
  enabled: boolean;
  /** Cap for rendered paths to avoid runaway DOM. */
  maxLines?: number;
};

type Point = { x: number; y: number };

type Segment = {
  key: string;
  from: Point;
  to: Point;
  crossesUnits: boolean;
};

/**
 * SVG overlay drawing curved paths from a leader tile to each of their follower tiles.
 * Positions are measured from `data-worker-id` attributes on tile wrappers.
 */
export function RelationshipOverlay({
  containerRef,
  links,
  unitsByWorker,
  enabled,
  maxLines = 200,
}: RelationshipOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const linksToDraw = useMemo(() => {
    if (!enabled) return [] as LeaderLink[];
    return links.slice(0, maxLines);
  }, [links, enabled, maxLines]);

  const recompute = () => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });

    const tiles = container.querySelectorAll<HTMLElement>("[data-worker-id]");
    const byWorker = new Map<number, HTMLElement[]>();
    tiles.forEach((el) => {
      const idStr = el.dataset.workerId;
      if (!idStr) return;
      const id = Number(idStr);
      if (Number.isNaN(id)) return;
      const arr = byWorker.get(id) ?? [];
      arr.push(el);
      byWorker.set(id, arr);
    });

    const getCentre = (el: HTMLElement): Point => {
      const r = el.getBoundingClientRect();
      return {
        x: r.left - rect.left + r.width / 2,
        y: r.top - rect.top + r.height / 2,
      };
    };

    const next: Segment[] = [];
    for (const link of linksToDraw) {
      const leaderTiles = byWorker.get(link.leader_worker_id) ?? [];
      const followerTiles = byWorker.get(link.follower_worker_id) ?? [];
      if (leaderTiles.length === 0 || followerTiles.length === 0) continue;

      const leaderUnits = new Set(unitsByWorker.get(link.leader_worker_id) ?? []);
      const followerUnits = new Set(unitsByWorker.get(link.follower_worker_id) ?? []);
      let shared = false;
      for (const u of leaderUnits) if (followerUnits.has(u)) { shared = true; break; }
      const crossesUnits = !shared;

      // Draw one line per (leader, follower) pair, picking the closest tiles.
      const leaderCentres = leaderTiles.map(getCentre);
      const followerCentres = followerTiles.map(getCentre);
      let best: { a: Point; b: Point; d2: number } | null = null;
      for (const a of leaderCentres) {
        for (const b of followerCentres) {
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (!best || d2 < best.d2) best = { a, b, d2 };
        }
      }
      if (!best) continue;
      next.push({
        key: String(link.link_id),
        from: best.a,
        to: best.b,
        crossesUnits,
      });
    }
    setSegments(next);
  };

  // Recompute on mount, on window resize, and when container resizes.
  useLayoutEffect(() => {
    recompute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, linksToDraw, unitsByWorker]);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(container);
    const onScroll = () => recompute();
    const onResize = () => recompute();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, containerRef]);

  if (!enabled || segments.length === 0) return null;

  return (
    <div
      ref={overlayRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 print:hidden"
    >
      <svg width={size.width} height={size.height} className="w-full h-full">
        <defs>
          <marker
            id="wc-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-sky-500/70" />
          </marker>
          <marker
            id="wc-arrow-cross"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-amber-500/80" />
          </marker>
        </defs>
        {segments.map((seg) => {
          const midX = (seg.from.x + seg.to.x) / 2;
          // Arc upward by 20% of dx for visual separation.
          const dx = seg.to.x - seg.from.x;
          const dy = seg.to.y - seg.from.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const curve = Math.min(60, Math.max(20, dist * 0.15));
          const controlY = (seg.from.y + seg.to.y) / 2 - curve;
          const d = `M ${seg.from.x} ${seg.from.y} Q ${midX} ${controlY} ${seg.to.x} ${seg.to.y}`;
          return (
            <path
              key={seg.key}
              d={d}
              fill="none"
              strokeWidth={seg.crossesUnits ? 2 : 1.5}
              className={
                seg.crossesUnits
                  ? "stroke-amber-500/70"
                  : "stroke-sky-500/60"
              }
              strokeDasharray={seg.crossesUnits ? "5 3" : undefined}
              markerEnd={seg.crossesUnits ? "url(#wc-arrow-cross)" : "url(#wc-arrow)"}
            />
          );
        })}
      </svg>
    </div>
  );
}
