/**
 * WP2.3 Stage 0 — locators shared by the characterisation and interaction
 * tests. Everything resolves through accessible names or product data
 * attributes, so a locator failing means the affordance genuinely moved.
 */

const CARD_ROOT = '[class~="print:break-inside-avoid"]';

function collapse(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

export function accessibleName(el: Element): string {
  return collapse(el.getAttribute("aria-label")) || collapse(el.textContent);
}

function fail(what: string, available: string[]): never {
  throw new Error(`${what}\nAvailable: ${available.filter(Boolean).join(" | ")}`);
}

/** A unit card, addressed by its `h3` heading. */
export function unitCard(root: ParentNode, title: string): HTMLElement {
  const heading = [...root.querySelectorAll("h3")].find((h) => collapse(h.textContent) === title);
  const card = heading?.closest(CARD_ROOT);
  if (!card) {
    fail(
      `No unit card titled "${title}"`,
      [...root.querySelectorAll("h3")].map((h) => collapse(h.textContent))
    );
  }
  return card as HTMLElement;
}

/** Every unit card heading, in document order. */
export function unitTitles(root: ParentNode): string[] {
  return [...root.querySelectorAll("h3")]
    .filter((h) => h.closest(CARD_ROOT))
    .map((h) => collapse(h.textContent));
}

/** The campaign-wide summary card, which is headed by an `h2`, not an `h3`. */
export function summaryCard(root: ParentNode): HTMLElement {
  const heading = [...root.querySelectorAll("h2")].find(
    (h) => collapse(h.textContent) === "Campaign summary"
  );
  const card = heading?.closest(CARD_ROOT);
  if (!card) fail("No campaign summary card", unitTitles(root));
  return card as HTMLElement;
}

/**
 * The tiles a card renders itself, `"<id> <name>"` each, in document order.
 * Tiles inside a nested sub-unit card belong to that card, not this one.
 */
export function cardTiles(card: HTMLElement): string[] {
  return [...card.querySelectorAll("[data-worker-id]")]
    .filter((t) => t.parentElement?.closest(CARD_ROOT) === card)
    .map((t) => `${t.getAttribute("data-worker-id")} ${t.getAttribute("data-worker-name")}`);
}

/**
 * A checkbox in the open filter popover, addressed by its visible label.
 *
 * Radix portals the popover content out of the chart, so this searches the
 * document rather than the container. It requires exactly one open popover,
 * which is the only state a single card's Filter button can produce.
 */
export function filterCheckbox(label: string): HTMLElement {
  const boxes = [...document.body.querySelectorAll('[role="checkbox"]')].filter(
    (c) => collapse(c.parentElement?.textContent) === label
  );
  if (boxes.length === 0) {
    fail(
      `No filter checkbox labelled "${label}"`,
      [...document.body.querySelectorAll('[role="checkbox"]')].map((c) =>
        collapse(c.parentElement?.textContent)
      )
    );
  }
  if (boxes.length > 1) {
    throw new Error(`${boxes.length} filter checkboxes labelled "${label}"`);
  }
  return boxes[0] as HTMLElement;
}

/** The single open dialog, which Radix portals outside the chart container. */
export function openDialog(): HTMLElement {
  const dialogs = [...document.body.querySelectorAll('[role="dialog"], [role="alertdialog"]')];
  if (dialogs.length !== 1) {
    throw new Error(`Expected exactly 1 open dialog, found ${dialogs.length}`);
  }
  return dialogs[0] as HTMLElement;
}

/** A worker tile's outer draggable wrapper. */
export function tile(root: ParentNode, workerId: number): HTMLElement {
  const el = root.querySelector(`[data-worker-id="${workerId}"]`);
  if (!el) {
    fail(
      `No tile for worker ${workerId}`,
      [...root.querySelectorAll("[data-worker-id]")].map(
        (t) => t.getAttribute("data-worker-id") ?? ""
      )
    );
  }
  return el as HTMLElement;
}

/** The clickable button inside a worker tile. */
export function tileButton(root: ParentNode, workerId: number): HTMLButtonElement {
  const button = tile(root, workerId).querySelector("button");
  if (!button) throw new Error(`Tile ${workerId} has no button (read-only?)`);
  return button;
}

/**
 * A button by accessible name. `within` scopes the search, which matters for
 * the per-card controls that repeat on every unit.
 */
export function button(root: ParentNode, name: string): HTMLButtonElement {
  const matches = [...root.querySelectorAll("button")].filter(
    (b) => accessibleName(b) === name
  );
  if (matches.length === 0) {
    fail(
      `No button named "${name}"`,
      [...root.querySelectorAll("button")].map(accessibleName)
    );
  }
  if (matches.length > 1) {
    throw new Error(`${matches.length} buttons named "${name}" — scope the search`);
  }
  return matches[0];
}

export function maybeButton(root: ParentNode, name: string): HTMLButtonElement | null {
  const matches = [...root.querySelectorAll("button")].filter(
    (b) => accessibleName(b) === name
  );
  return matches.length === 1 ? matches[0] : null;
}

/** Metric chips owned by an element, as `label=value`. */
export function metrics(root: ParentNode): string[] {
  return [...root.querySelectorAll("[title]")]
    .filter(
      (el) =>
        el.children.length >= 2 &&
        el.children.length <= 3 &&
        [...el.children].every((c) => c.tagName === "SPAN")
    )
    .map((el) => `${collapse(el.children[0].textContent)}=${collapse(el.children[el.children.length - 1].textContent)}`);
}

export function selectionBar(root: ParentNode): HTMLElement | null {
  return root.querySelector('[role="region"][aria-label="Wall chart selection"]');
}

export function openDialogTitles(): string[] {
  return [...document.body.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
    .map((d) => collapse(d.getAttribute("aria-label")) || collapse(d.querySelector("h2, h3")?.textContent))
    .filter(Boolean)
    .sort();
}
