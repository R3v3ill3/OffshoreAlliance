// @vitest-environment jsdom
/**
 * DA0.3 (da0.3.md §2.6.5) — the Name Reviews page under jsdom.
 *
 * Only the edges are faked: the Supabase browser client (a chainable
 * recorder that answers per table), the auth context (`isAdmin`), `next/link`
 * and `fetch` (the decide route). The page, its hooks and the React Query
 * cache run for real.
 *
 * Pinned: a non-admin sees the rows and no decision control; an admin sees
 * the proposals and the search; "Create new" is absent until the search has
 * been used (empty for the typed text, or "None of these"); the create
 * dialog posts `action: "create"` to the decide route; a 409 is shown
 * verbatim; a decision reports its counts and invalidates the three keys.
 * Organisation strings only.
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Call = [string, ...unknown[]];

const state = vi.hoisted(() => ({
  isAdmin: false,
  tables: {} as Record<string, unknown[]>,
  /** employers answer by the `or=(…)` text; aliases always empty unless set. */
  employerSearch: {} as Record<string, unknown[]>,
  queries: [] as { table: string; calls: [string, ...unknown[]][] }[],
}));

vi.mock("@/lib/supabase/client", () => {
  function builder(table: string) {
    const calls: Call[] = [];
    state.queries.push({ table, calls });
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "or", "ilike", "order", "limit"]) {
      b[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return b;
      };
    }
    b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      let data: unknown[] = state.tables[table] ?? [];
      if (table === "employers") {
        const or = calls.find((c) => c[0] === "or");
        const text = String(or?.[1] ?? "");
        const key = Object.keys(state.employerSearch).find((k) => text.includes(k));
        data = key ? state.employerSearch[key] : [];
      }
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    };
    return b;
  }
  const client = { from: (table: string) => builder(table) };
  return {
    createClient: () => client,
    getKnownExpiryMs: () => Date.now() + 60 * 60 * 1000,
    refreshSessionViaServer: async () => ({ ok: true, expiresAt: null, reason: "ok" as const }),
  };
});

vi.mock("@/lib/supabase/auth-context", () => ({
  useAuth: () => ({ isAdmin: state.isAdmin }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import NameReviewsPage from "../page";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const IMPORT = { import_id: 41, file_name: "status-sync-september.xlsx", import_type: "membership_status_sync", imported_at: "2026-09-20T01:00:00Z" };

function review(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    entity: "employer",
    raw_name: "Acme Offshore Pty Ltd",
    normalised_name: "acme offshore pty ltd",
    status: "needs_review",
    match_score: 0.81,
    match_method: null,
    candidate_proposals: [
      { id: 101, name: "Acme Offshore Services", score: 0.81, is_principal: false },
      { id: 102, name: "Acme Marine", score: 0.7, is_principal: true },
    ],
    resolved_employer_id: null,
    resolved_worksite_id: null,
    occurrences: 12,
    source_context: { other_raw_name: "Example Platform A", import_type: "membership_status_sync" },
    notes: null,
    decided_by: null,
    decided_at: null,
    created_at: "2026-09-20T01:00:05Z",
    import_logs: IMPORT,
    employers: null,
    worksites: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function installShims() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  const proto = window.HTMLElement.prototype;
  proto.scrollIntoView ??= function () {};
  proto.hasPointerCapture ??= function () {
    return false;
  };
  proto.releasePointerCapture ??= function () {};
}

async function flush(ms = 0): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, i === 0 ? ms : 0));
    });
  }
}

function text(): string {
  return (document.body.textContent ?? "").replace(/\s+/gu, " ");
}

function buttons(): HTMLButtonElement[] {
  return [...document.body.querySelectorAll("button")];
}

function buttonByText(label: string): HTMLButtonElement | undefined {
  return buttons().find((b) => (b.textContent ?? "").replace(/\s+/gu, " ").trim() === label);
}

function mustButton(label: string): HTMLButtonElement {
  const b = buttonByText(label) ?? buttons().find((x) => x.getAttribute("aria-label") === label);
  if (!b) throw new Error(`No button "${label}" in: ${buttons().map((x) => x.textContent).join(" | ")}`);
  return b;
}

async function click(el: Element): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flush();
}

async function type(el: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  // Past the 250 ms debounce, then let the search settle.
  await flush(300);
}

function searchInput(): HTMLInputElement {
  const el = document.body.querySelector('input[aria-label^="Search existing"]');
  if (!(el instanceof HTMLInputElement)) throw new Error("No search input");
  return el;
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

let root: Root | null = null;
let container: HTMLElement | null = null;
let queryClient: QueryClient;
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function respond(status: number, body: unknown) {
  fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify(body), { status }));
}

async function mount(): Promise<void> {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container!);
    root.render(
      <QueryClientProvider client={queryClient}>
        <NameReviewsPage />
      </QueryClientProvider>
    );
  });
  await flush();
}

function decideBodies(): Record<string, unknown>[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body ?? "{}")));
}

beforeEach(() => {
  installShims();
  state.isAdmin = false;
  state.tables = { name_match_reviews: [review()], import_logs: [IMPORT], user_profiles: [] };
  state.employerSearch = {};
  state.queries = [];
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Name Reviews page", () => {
  it("reads the open employer queue with the planned PostgREST shape (P1)", async () => {
    await mount();
    const q = state.queries.find((x) => x.table === "name_match_reviews");
    expect(q?.calls).toEqual([
      ["select", expect.stringContaining("import_logs(import_id,file_name,import_type,imported_at),employers(employer_id,employer_name),worksites(worksite_id,worksite_name)")],
      ["eq", "entity", "employer"],
      ["in", "status", ["needs_review", "unmatched"]],
      ["order", "created_at", { ascending: false }],
    ]);
  });

  it("non-admin: sees the rows and proposals, no decision control, and the admins-only note", async () => {
    await mount();
    expect(text()).toContain("Acme Offshore Pty Ltd");
    expect(text()).toContain("12 rows");
    expect(text()).toContain("Worksite in file: Example Platform A");
    expect(text()).toContain("Import: status-sync-september.xlsx");
    expect(text()).toContain("Acme Offshore Services");
    expect(text()).toContain("Score 0.810");
    expect(text()).toContain("Match decisions can only be made by admins.");
    for (const label of ["Confirm", "Search existing employers", "Reject (not an employer)", "Reopen"]) {
      expect(buttonByText(label)).toBeUndefined();
    }
    expect(document.body.querySelector('input[aria-label="Decision note"]')).toBeNull();
  });

  it("admin: sees Confirm on each proposal and the search, and no Create new before searching", async () => {
    state.isAdmin = true;
    await mount();
    expect(text()).not.toContain("Match decisions can only be made by admins.");
    expect(buttons().filter((b) => b.textContent === "Confirm")).toHaveLength(2);
    expect(buttonByText("Search existing employers")).toBeDefined();
    expect(buttonByText("Create new employer")).toBeUndefined();

    await click(mustButton("Search existing employers"));
    // Opened but not used yet: still no Create new.
    expect(buttonByText("Create new employer")).toBeUndefined();
  });

  it("Create new appears only after the search returned no rows for the typed text", async () => {
    state.isAdmin = true;
    state.employerSearch = { Acme: [{ employer_id: 101, employer_name: "Acme Offshore Services", trading_name: null, is_active: true }] };
    await mount();
    await click(mustButton("Search existing employers"));

    await type(searchInput(), "Acme");
    expect(text()).toContain("Acme Offshore Services");
    expect(buttonByText("Map to this")).toBeDefined();
    expect(buttonByText("Create new employer")).toBeUndefined();

    await type(searchInput(), "Zenith");
    expect(text()).toContain("No employers or aliases match “Zenith”.");
    expect(buttonByText("Create new employer")).toBeDefined();

    // P2 / P3 were issued for the typed text.
    const employerQuery = state.queries.filter((x) => x.table === "employers").at(-1);
    expect(employerQuery?.calls).toContainEqual(["or", "employer_name.ilike.*Zenith*,trading_name.ilike.*Zenith*"]);
    const aliasQuery = state.queries.filter((x) => x.table === "employer_name_aliases").at(-1);
    expect(aliasQuery?.calls).toContainEqual(["ilike", "alias_name", "*Zenith*"]);
  });

  it("Create new appears after an explicit None of these", async () => {
    state.isAdmin = true;
    state.employerSearch = { Acme: [{ employer_id: 101, employer_name: "Acme Offshore Services", trading_name: null, is_active: true }] };
    await mount();
    await click(mustButton("Search existing employers"));
    await type(searchInput(), "Acme");
    expect(buttonByText("Create new employer")).toBeUndefined();
    await click(mustButton("None of these"));
    expect(buttonByText("Create new employer")).toBeDefined();
  });

  it("Map to this posts override with the canonical id, reports the counts and invalidates the three keys", async () => {
    state.isAdmin = true;
    state.employerSearch = { Acme: [{ employer_id: 101, employer_name: "Acme Offshore Services", trading_name: null, is_active: true }] };
    await mount();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await click(mustButton("Search existing employers"));
    await type(searchInput(), "Acme");

    respond(200, { success: true, review: {}, aliasWritten: true, backfilledWorkerIds: [1, 2, 3], siblingsResolved: 2 });
    await click(mustButton("Map to this"));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/name-match-reviews/7/decide");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    expect(decideBodies()[0]).toEqual({ action: "override", employer_id: 101, notes: null });
    expect(text()).toContain("alias written · 3 worker rows updated · 2 duplicate queue rows resolved");
    const keys = invalidate.mock.calls.map(([f]) => JSON.stringify(f?.queryKey));
    expect(keys).toEqual(
      expect.arrayContaining(['["name-match-reviews"]', '["employers-active"]', '["worksites-all"]'])
    );
  });

  it("Confirm on a proposal posts confirm with the proposal id", async () => {
    state.isAdmin = true;
    await mount();
    respond(200, { success: true, review: {}, aliasWritten: false, backfilledWorkerIds: [], siblingsResolved: 0 });
    await click(mustButton("Confirm Acme Marine"));
    await flush();
    expect(decideBodies()[0]).toEqual({ action: "confirm", employer_id: 102, notes: null });
    expect(text()).toContain("no new alias needed · 0 worker rows updated");
  });

  it("the create dialog posts action: create with the name prefilled from the raw string", async () => {
    state.isAdmin = true;
    await mount();
    await click(mustButton("Search existing employers"));
    await type(searchInput(), "Zenith");
    await click(mustButton("Create new employer"));

    const nameInput = document.getElementById("name-review-create-name") as HTMLInputElement | null;
    expect(nameInput?.value).toBe("Acme Offshore Pty Ltd");

    respond(200, { success: true, review: {}, aliasWritten: false, backfilledWorkerIds: [5], siblingsResolved: 0 });
    await click(mustButton("Create and map"));
    await flush();

    expect(decideBodies()).toEqual([
      {
        action: "create",
        create: { employer_name: "Acme Offshore Pty Ltd", trading_name: null, employer_category: null },
        notes: null,
      },
    ]);
    expect(text()).toContain("1 worker row updated");
  });

  it("a 409 from the decide route is shown verbatim in the create dialog", async () => {
    state.isAdmin = true;
    await mount();
    await click(mustButton("Search existing employers"));
    await type(searchInput(), "Zenith");
    await click(mustButton("Create new employer"));

    const message = 'employer "Acme Offshore Pty Ltd" already exists — search for it instead';
    respond(409, { success: false, error: message });
    await click(mustButton("Create and map"));
    await flush();

    const alert = [...document.body.querySelectorAll('[role="alert"]')].map((a) => a.textContent);
    expect(alert).toContain(message);
  });

  it("a 409 on a row decision is shown verbatim on the row", async () => {
    state.isAdmin = true;
    await mount();
    const message = 'alias "acme offshore pty ltd" already points at Acme Marine; resolve that alias first';
    respond(409, { success: false, error: message });
    await click(mustButton("Confirm Acme Offshore Services"));
    await flush();
    expect(text()).toContain(message);
  });

  it("Reject posts reject and reports the resolved duplicates", async () => {
    state.isAdmin = true;
    await mount();
    respond(200, { success: true, review: {}, aliasWritten: false, backfilledWorkerIds: [], siblingsResolved: 1 });
    await click(mustButton("Reject (not an employer)"));
    await flush();
    expect(decideBodies()[0]).toEqual({ action: "reject", notes: null });
    expect(text()).toContain("rejected · 1 duplicate queue row resolved");
  });

  it("decided row: admin can reopen, non-admin cannot", async () => {
    state.tables.name_match_reviews = [
      review({
        status: "overridden",
        match_method: "manual",
        resolved_employer_id: 101,
        employers: { employer_id: 101, employer_name: "Acme Offshore Services" },
        decided_at: "2026-09-21T02:00:00Z",
        decided_by: "00000000-0000-0000-0000-000000000001",
      }),
    ];
    state.tables.user_profiles = [{ user_id: "00000000-0000-0000-0000-000000000001", display_name: "Admin One" }];
    await mount();
    expect(text()).toContain("Mapped to Acme Offshore Services");
    expect(text()).toContain("by Admin One");
    expect(buttonByText("Reopen")).toBeUndefined();
    act(() => root?.unmount());
    container?.remove();

    state.isAdmin = true;
    await mount();
    respond(200, { success: true, review: {}, aliasWritten: false, backfilledWorkerIds: [], siblingsResolved: 0 });
    await click(mustButton("Reopen"));
    await flush();
    expect(decideBodies()[0]).toEqual({ action: "reopen", notes: null });
  });

  it("auto row (round 2): only Confirm of the auto target and Reject — no search, no other-proposal Confirm", async () => {
    state.tables.name_match_reviews = [
      review({
        status: "auto",
        match_method: "fuzzy",
        match_score: 0.95,
        resolved_employer_id: 101,
        employers: { employer_id: 101, employer_name: "Acme Offshore Services" },
      }),
    ];
    state.isAdmin = true;
    await mount();
    expect(text()).toContain("Mapped to Acme Offshore Services");
    expect(text()).toContain("The alias was already written on import.");
    expect(buttonByText("Search existing employers")).toBeUndefined();
    expect(buttonByText("Map to this")).toBeUndefined();
    expect(buttonByText("Create new employer")).toBeUndefined();
    expect(buttons().filter((b) => b.textContent === "Confirm").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Confirm Acme Offshore Services",
    ]);
    expect(buttonByText("Reject (not an employer)")).toBeDefined();

    respond(200, { success: true, review: {}, aliasWritten: false, backfilledWorkerIds: [], siblingsResolved: 0 });
    await click(mustButton("Confirm Acme Offshore Services"));
    await flush();
    expect(decideBodies()[0]).toEqual({ action: "confirm", employer_id: 101, notes: null });
  });

  it("an alias hit carries its canonical row's is_active (P3 embeds it)", async () => {
    state.isAdmin = true;
    state.tables.employer_name_aliases = [
      { id: 9, alias_name: "Zenith Old", employer_id: 150, employers: { employer_id: 150, employer_name: "Zenith Holdings", is_active: false } },
    ];
    await mount();
    await click(mustButton("Search existing employers"));
    await type(searchInput(), "Zenith");
    expect(text()).toContain("alias “Zenith Old” of Zenith Holdings");
    expect(text()).toContain("Inactive");
    const aliasQuery = state.queries.filter((x) => x.table === "employer_name_aliases").at(-1);
    expect(aliasQuery?.calls[0]).toEqual([
      "select",
      "id,alias_name,employer_id,employers(employer_id,employer_name,is_active)",
    ]);
  });

  it("empty queue links to the imports", async () => {
    state.tables.name_match_reviews = [];
    await mount();
    expect(text()).toContain("No employer names are waiting for review.");
    const hrefs = [...document.body.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining(["/administration?tab=data", "/administration?tab=data&sub=weekly_updates"])
    );
  });
});
