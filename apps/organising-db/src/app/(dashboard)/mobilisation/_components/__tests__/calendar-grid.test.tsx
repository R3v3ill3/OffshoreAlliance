import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CalendarItem } from "@/lib/mobilisation/schedule";

vi.mock("next/link", () => ({
  default: (props: { href: string; children?: unknown; className?: string; title?: string }) =>
    createElement("a", { href: props.href, className: props.className, title: props.title }, props.children),
}));

import { MobilisationCalendar } from "../calendar-grid";

const items: CalendarItem[] = [
  {
    signalId: 42,
    label: "Castorone · ETA",
    kind: "eta",
    start: new Date("2026-09-25T00:00:00.000Z"),
    end: new Date("2026-09-25T00:00:00.000Z"),
    openEnded: false,
    pinDay: null,
  },
  {
    signalId: 43,
    label: "Castorone · 10d",
    kind: "stay",
    start: new Date("2026-09-01T00:00:00.000Z"),
    end: new Date("2026-09-10T00:00:00.000Z"),
    openEnded: false,
    pinDay: null,
  },
];

describe("MobilisationCalendar", () => {
  it("renders a label as a link to the feed item", () => {
    const html = renderToStaticMarkup(
      createElement(MobilisationCalendar, { items, initialMonth: new Date("2026-09-01T00:00:00.000Z") })
    );
    expect(html).toContain('href="/projects/alerts#signal-42"');
    expect(html).toContain("Castorone · ETA");
    expect(html).toContain('href="/projects/alerts#signal-43"');
    expect(html).toContain("Castorone · 10d");
  });
});
