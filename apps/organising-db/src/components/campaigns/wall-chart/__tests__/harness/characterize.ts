/**
 * WP2.3 Stage 0 — the characterisation contract.
 *
 * `characterize()` reduces a mounted wall chart to a compact semantic
 * description: which regions rendered and in what order, which controls exist
 * and what state they advertise, the unit-card tree with its metrics and tiles,
 * the aggregate counts, the hint anchors, the accessible names, and the query
 * keys. Snapshotting this instead of HTML is deliberate — a snapshot of markup
 * would fail on every Tailwind tweak and pass on a real behavioural regression,
 * which is the opposite of what a decomposition needs.
 *
 * Everything is located through product-authored semantics (roles, aria labels,
 * headings, `data-worker-id`, `title`) rather than styling, with one exception:
 * `CampaignUnitCard` marks its own root with `print:break-inside-avoid` and
 * exposes no other identifier, so that class is the card locator. It is matched
 * with `[class~=...]` so a class-list reorder cannot break it.
 */

import type { QueryClient } from "@tanstack/react-query";

import { HINT_BY_ID } from "@/lib/hints/registry";

import { normalizeQueryKeys } from "./query-client";

const CARD_ROOT = '[class~="print:break-inside-avoid"]';
const BUILD_LIST = '[role="region"][aria-label="Build list panel"]';
const SELECTION_BAR = '[role="region"][aria-label="Wall chart selection"]';
/** `FirstUseHint`'s callout: `PopoverContent` with `role="status" aria-live="polite"`. */
const HINT_BUBBLE = '[role="status"][aria-live="polite"]';

/**
 * The two empty states the shell can render in place of the unit hierarchy,
 * matched on the opening clause of the real copy. Anchored deliberately: a
 * loose `/organising units/` matched neither string, which is how fix round 1
 * finding 2 got in — the characterisation recorded `empty-state=none` for the
 * no-units campaign and would not have noticed the paragraph disappearing.
 */
const EMPTY_STATE_COPY: readonly RegExp[] = [
  /^Add organising units to group workers into frames on the wall chart\./u,
  /^All organising units are hidden for this browser\./u,
];

export type CharacterizedTile = {
  worker: string;
  ouId: string;
  selected: boolean;
  disabled: boolean;
  draggable: boolean;
  badge: string;
  title: string;
};

export type CharacterizedCard = {
  level: number;
  title: string;
  type: string | null;
  header: string | null;
  assessing: string | null;
  ratingsBar: string | null;
  metrics: string[];
  controls: string[];
  tiles: CharacterizedTile[];
  placeholders: number;
  /** "+N more placeholder cells" when the unfilled-slot grid is capped. */
  overflow: string | null;
};

export type WallChartContract = {
  regions: string[];
  controls: string[];
  cards: CharacterizedCard[];
  counts: string[];
  anchors: string[];
  a11y: string[];
  queryKeys: string[];
};

function text(node: Element | null | undefined): string {
  return (node?.textContent ?? "").replace(/\s+/gu, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * A card is a `print:break-inside-avoid` root carrying a heading: the unit
 * cards (h3) and the campaign summary header (h2). The summary is included
 * deliberately — its metrics are campaign-wide roll-ups and nothing else in the
 * contract would notice if extraction broke them.
 */
function isCard(el: Element | null): el is Element {
  return !!el && el.matches(CARD_ROOT) && !!el.querySelector("h2, h3");
}

function cardsIn(container: HTMLElement): Element[] {
  return [...container.querySelectorAll(CARD_ROOT)].filter(
    (el) => isCard(el) && !el.closest(BUILD_LIST)
  );
}

/** Unit cards only — the campaign summary header is a card but not a unit. */
function isUnitCard(el: Element): boolean {
  return !!el.querySelector("h3");
}

/** The card that owns `el`, i.e. the nearest card ancestor. */
function owningCard(el: Element): Element | null {
  const parent = el.parentElement?.closest(CARD_ROOT) ?? null;
  return isCard(parent) ? parent : null;
}

function ownedBy(card: Element, selector: string): Element[] {
  return [...card.querySelectorAll(selector)].filter((el) => owningCard(el) === card);
}

function describeControl(button: Element): string {
  const label =
    button.getAttribute("aria-label")?.trim() || text(button) || button.getAttribute("title")?.trim() || "∅";
  const bits = [label];
  const pressed = button.getAttribute("aria-pressed");
  if (pressed !== null) bits.push(`pressed=${pressed}`);
  const expanded = button.getAttribute("aria-expanded");
  if (expanded !== null) bits.push(`expanded=${expanded}`);
  const state = button.getAttribute("data-state");
  if (state !== null) bits.push(`state=${state}`);
  if ((button as HTMLButtonElement).disabled) bits.push("disabled");
  return bits.join(" | ");
}

/** MetricChip and the compact mapping chips: a titled element of 2–3 spans. */
function describeMetric(el: Element): string | null {
  const children = [...el.children];
  if (children.length < 2 || children.length > 3) return null;
  if (!children.every((c) => c.tagName === "SPAN")) return null;
  const label = text(children[0]);
  const value = text(children[children.length - 1]);
  return `${label}=${value}`;
}

function describeTile(wrapper: Element): CharacterizedTile {
  const button = wrapper.querySelector("button");
  const badge = wrapper.querySelector('[role="button"], span[aria-label]');
  return {
    worker: `${wrapper.getAttribute("data-worker-id") ?? "?"} ${wrapper.getAttribute("data-worker-name") ?? "?"}`,
    ouId: wrapper.getAttribute("data-ou-id") ?? "",
    selected: button?.getAttribute("aria-pressed") === "true",
    disabled: !!(button as HTMLButtonElement | null)?.disabled,
    draggable: (wrapper as HTMLElement).draggable,
    badge: text(badge),
    title: button?.getAttribute("title") ?? "",
  };
}

function describeCard(card: Element, allCards: Element[]): CharacterizedCard {
  let level = 0;
  for (let p = card.parentElement; p; p = p.parentElement) {
    if (allCards.includes(p)) level++;
  }

  const heading = card.querySelector("h2, h3");
  const headerParagraphs = ownedBy(card, "p").map(text);
  const assessing = headerParagraphs.find((p) => p.startsWith("Assessing:")) ?? null;
  const header = headerParagraphs.find((p) => /\bnamed\b/u.test(p)) ?? null;
  const typeChip = heading?.nextElementSibling;

  const tiles = ownedBy(card, "[data-worker-id]");
  // Unfilled-slot cells: the only empty dashed divs in a card.
  const placeholders = ownedBy(card, 'div[class~="border-dashed"]').filter(
    (d) => d.childNodes.length === 0
  ).length;
  const overflow = headerParagraphs.find((p) => /more placeholder cells$/u.test(p)) ?? null;

  return {
    level,
    title: text(heading),
    type: typeChip && typeChip.tagName === "SPAN" ? text(typeChip) : null,
    header,
    assessing,
    ratingsBar:
      ownedBy(card, '[aria-label="Rating distribution"]')[0]?.getAttribute("title") ?? null,
    metrics: ownedBy(card, "[title]")
      .map(describeMetric)
      .filter((m): m is string => m !== null),
    controls: ownedBy(card, "button")
      .filter((b) => !b.closest("[data-worker-id]"))
      .map(describeControl),
    tiles: tiles.map(describeTile),
    placeholders,
    overflow,
  };
}

/**
 * The open callout belonging to hint `id`, or null.
 *
 * `FirstUseHint` renders `PopoverAnchor` in place (tagged `data-hint-anchor`)
 * but Radix PORTALS `PopoverContent` to the end of the owner document's
 * `<body>`, so the callout is not a DOM descendant of its anchor. Searching
 * inside the anchor — what this did before fix round 1 finding 1 — can only
 * ever find the anchored control itself, so a visible hint was recorded as
 * `hidden` and "Got it" was never characterised at all.
 *
 * The bubble is tied back to the hint id by its registered copy, which
 * `FirstUseHint` renders verbatim, so a bubble belonging to some other popover
 * (or to another hint) cannot be mistaken for this one.
 */
function hintBubbleFor(anchor: Element, id: string): Element | null {
  const copy = (HINT_BY_ID as Record<string, { copy: string } | undefined>)[id]?.copy;
  if (!copy) return null;
  return (
    [...anchor.ownerDocument.body.querySelectorAll(HINT_BUBBLE)].find(
      (node) => node.getAttribute("data-state") === "open" && text(node).startsWith(copy)
    ) ?? null
  );
}

/**
 * `hint-id@anchor-worker:state`, where a visible hint also records the label of
 * its dismiss control — the copy an organiser has to press to make the hint go
 * away, and the one string a portalled-content regression would drop first.
 *
 * A portalled bubble can only be attributed to an anchor unambiguously while
 * one anchor carries the id, so that is asserted rather than assumed.
 */
function describeAnchor(anchor: Element, allAnchors: Element[]): string {
  const id = anchor.getAttribute("data-hint-anchor") ?? "?";
  const worker = anchor.closest("[data-worker-id]")?.getAttribute("data-worker-name") ?? "none";
  const sameId = allAnchors.filter((a) => a.getAttribute("data-hint-anchor") === id);
  if (sameId.length > 1) return `${id}@${worker}:ambiguous(${sameId.length} anchors)`;

  const bubble = hintBubbleFor(anchor, id);
  if (!bubble) return `${id}@${worker}:hidden`;
  const dismiss = [...bubble.querySelectorAll("button")].map(text).join("/") || "∅";
  return `${id}@${worker}:visible dismiss=[${dismiss}]`;
}

/** Regions in document order, each `name` or `name:state`. Portalled dialogs sort last. */
function describeRegions(container: HTMLElement): string[] {
  const found: { el: Element; entry: string }[] = [];

  const push = (el: Element | null | undefined, entry: string) => {
    if (el) found.push({ el, entry });
  };

  const cardTitle = [...container.querySelectorAll("div")].find(
    (d) => d.children.length === 0 && text(d) === "Wall chart"
  );
  push(cardTitle, "card-title:Wall chart");

  const selectionBar = container.querySelector(SELECTION_BAR);
  push(selectionBar, `selection-bar:${text(selectionBar)}`);

  const summary = [...container.querySelectorAll("h2")].find((h) => text(h) === "Campaign summary");
  push(summary, "summary");

  const unitCards = cardsIn(container).filter(isUnitCard);
  push(unitCards[0], `units:${unitCards.length}`);

  const buildList = container.querySelector(BUILD_LIST);
  push(buildList, "build-list:open");

  const charts = [...container.querySelectorAll("div")].find(
    (d) => d.children.length === 0 && text(d) === "Assessment distribution"
  );
  push(charts, "charts");

  const ordered = found
    .sort((a, b) =>
      a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    )
    .map((f) => f.entry);

  const dialogs = [...document.body.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
    .map((d) => d.getAttribute("aria-label") ?? text(d.querySelector("h2, h3, [id$='-title']")))
    .sort();
  ordered.push(`dialogs:${dialogs.length === 0 ? "none" : dialogs.join(", ")}`);

  return ordered;
}

export function characterize(
  container: HTMLElement,
  queryClient: QueryClient
): WallChartContract {
  const cards = cardsIn(container);
  const described = cards.map((card) => describeCard(card, cards));

  const unitCards = cards.filter(isUnitCard);
  const topLevel = unitCards.filter((c) => !unitCards.some((o) => o !== c && o.contains(c)));

  // Band headers: `<span>{type}</span><span>· N units</span><div class=rule/>`.
  // Matched on that shape plus the text, because each card sits in its own
  // wrapper so the header is not a sibling we can reach from the card.
  const bands = [...container.querySelectorAll("div")]
    .filter(
      (d) =>
        d.children.length === 3 &&
        d.children[0].tagName === "SPAN" &&
        d.children[1].tagName === "SPAN" &&
        /·\s*\d+\s+units?$/u.test(text(d))
    )
    .map(text);

  const controls = [...container.querySelectorAll("button")]
    .filter((b) => !b.closest("[data-worker-id]") && !owningCard(b))
    .map(describeControl);

  const anchorEls = [...container.querySelectorAll("[data-hint-anchor]")];
  const anchors = anchorEls.map((el) => describeAnchor(el, anchorEls));

  const a11y = unique([
    ...[...container.querySelectorAll("[aria-label]")].map(
      (el) => el.getAttribute("aria-label") ?? ""
    ),
    ...[...container.querySelectorAll("h1, h2, h3, h4")].map(text),
  ]).sort();

  const emptyState = text(
    [...container.querySelectorAll("p")].find((p) =>
      EMPTY_STATE_COPY.some((copy) => copy.test(text(p)))
    )
  );

  return {
    regions: describeRegions(container),
    controls,
    cards: described,
    counts: [
      `unit-cards=${unitCards.length}`,
      `top-level-units=${topLevel.length}`,
      `tiles=${container.querySelectorAll("[data-worker-id]").length}`,
      `placeholders=${described.reduce((sum, c) => sum + c.placeholders, 0)}`,
      `bands=[${bands.join(", ")}]`,
      `empty-state=${emptyState || "none"}`,
    ],
    anchors,
    a11y,
    queryKeys: normalizeQueryKeys(queryClient),
  };
}

/**
 * Tag + semantic attributes only, no classes, ids, styles or text, to a fixed
 * depth. Pins the shell's structural nesting — the thing extraction is most
 * likely to change accidentally — without pinning presentation.
 */
export function domSkeleton(container: HTMLElement, maxDepth = 7): string {
  const keep = (name: string) =>
    name === "role" || name === "draggable" || name.startsWith("aria-") || name.startsWith("data-");

  const walk = (el: Element, depth: number): string[] => {
    const attrs = [...el.attributes]
      .filter((a) => keep(a.name))
      .map((a) => `${a.name}="${a.value}"`)
      .sort();
    const line = `${"  ".repeat(depth)}<${el.tagName.toLowerCase()}${attrs.length ? ` ${attrs.join(" ")}` : ""}>`;
    if (depth >= maxDepth) return [line];
    return [line, ...[...el.children].flatMap((child) => walk(child, depth + 1))];
  };

  return [...container.children].flatMap((child) => walk(child, 0)).join("\n");
}
