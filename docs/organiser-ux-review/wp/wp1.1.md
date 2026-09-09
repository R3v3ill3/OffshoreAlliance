# WP1.1 — Module registry and workspace mode

Planner output. Branch: `feat/oux-wp1.1-workspace-mode` (off merged `develop`).
Live schema: `supabase/migrations/20260908050000_baseline_schema.sql`. Everything in
`supabase/migrations_legacy/` is audit-only.

---

## 1. Specification

### 1.1 Work package (verbatim)

> **WP1.1 Module registry and workspace mode.** Standard implementer. A typed module registry
> (ids from plan 5.2), an `app_settings` key holding org-wide defaults per work role, a
> `workspace_prefs` JSONB column on `user_profiles` (new migration), an admin editor in
> Administration → Users, and a `useWorkspace()` hook exposing `mode`, `enabledModules`,
> `canShowEverything`. Acceptance: unit tests for visibility resolution (role default, per-user
> override, session "Show everything"); the flag defaults to `full` for everyone. Depends on
> decision 1.

### 1.2 Decisions consumed

From `docs/organiser-ux-review/DECISIONS.md` "Answers":

- **Decision 1 — Confirmed** (`DECISIONS.md:35`): "Module table in plan 5.2 as written; 'Show
  everything' allowed for organisers." → the registry reproduces the 13 rows of the plan-5.2
  table with the same defaults, and `canShowEverything` defaults to **true** for every
  non-admin in organiser mode.
- **Decision 8 — Confirmed, with a note** (`DECISIONS.md:43`): "A `user`-role organiser must be
  able to create campaigns and actions with themselves assigned." → consumed here only as a
  constraint on what this package must *not* do: nothing in this package gates any creation
  path on `mode` or on module membership. Workspace mode is presentation, never permission
  (see §2.9).

### 1.3 Source sections read

- `docs/ORGANISER_UX_REVIEW_AND_PLAN.md:202-235` (5.2 workspace mode, hidden-vs-muted rule,
  module table, implementation-hooks paragraph); `:122-134` (3.6 terminology).
- `docs/organiser-ux-review/appendix-D-navigation-roles.md:244-251` (5.1 roles), `:253-255`
  (5.2 `AuthProvider.fetchProfile`), `:288-297` (5.6 settings/feature-flag mechanisms),
  `:362-372` (10 items 1, 4, 5).
- `docs/organiser-ux-review/appendix-C-data-model.md:316-325` (6.1 `user_profiles`,
  `get_user_role`), `:346-352` (6.3 `app_settings` admin-only SELECT).
- Baseline: `user_profiles` DDL at `20260908050000_baseline_schema.sql:9887-9899`;
  `app_settings` DDL `:7881-7892`, policies `:25841-25852`, grants `:30673-30675`;
  `handle_new_user()` `:3534-3555`; `get_user_role()` `:3346-3353`;
  `user_profiles` policies `:25817`, `:27205`, `:27875`, `:27887`.

---

## 2. Plan

### 2.1 The registry — `src/lib/workspace/modules.ts` (new, pure, no React)

Exactly the 13 rows of the plan-5.2 table (`ORGANISER_UX_REVIEW_AND_PLAN.md:220-234`), in that
order. Ids are stable snake_case and are the contract WP1.2 (nav) and WP1.4 (campaign tabs)
will key off; they are never derived from labels.

| `WorkspaceModuleId` | `label` (plan 3.6/5.2 words) | `defaultForOrganiser` | `adminOnly` | `offState` |
|---|---|---|---|---|
| `wall_chart_people` | Wall chart & people | `true` | `false` | `muted` |
| `actions` | Actions | `true` | `false` | `muted` |
| `setup` | Setup | `true` | `false` | `muted` |
| `inbox` | Inbox | `true` | `false` | `muted` |
| `strategic_plan` | Strategic plan | `false` | `false` | `muted` |
| `bargaining` | Bargaining | `false` | `false` | `muted` |
| `insights` | Insights | `false` | `false` | `muted` |
| `data_fields` | Data fields | `false` | `false` | `muted` |
| `activists_wocs` | Activists & WOCs | `false` | `false` | `muted` |
| `library` | Library | `false` | `false` | `muted` |
| `imports` | Imports | `false` | `false` | `hidden` |
| `organisation_databases` | Organisation databases | `false` | `false` | `muted` |
| `administration` | Administration | `false` | `true` | `hidden` |

Terminology notes (plan 3.6, `:126`): the label is **"Strategic plan"**, not "Strategic
planning" — the id stays `strategic_plan` so the two never drift. "Guides" is deliberately
**not** a module: plan 5.2 (`:217`) lists it as always present in the organiser sidebar.

`offState` is the "hidden vs muted" rule as data, per `ORGANISER_UX_REVIEW_AND_PLAN.md:218`:
"hidden … when the user could never use it (an organiser who is not allowed to import), and
shown muted with 'Ask an admin to enable' when it is merely off for that campaign". Modules
that are *permission-shaped* — `imports` (the plan's own example) and `administration` — are
`hidden`. Modules that are *capability-shaped and attachable per campaign* — the other eleven,
including `organisation_databases` — are `muted`. WP1.2/1.4 consume `offState`; nothing in this
package renders it.

> **Fix round 1 (orchestrator ruling from WP1.2's approval):**
> `organisation_databases` moved from `hidden` to `muted`. Looking a worksite or employer up is
> a capability every organiser has, so when the module is off it should say "Ask an admin to
> enable", not vanish. `imports` and `administration` stay `hidden`.

File contents:

```ts
export type WorkspaceModuleId = "wall_chart_people" | ... | "administration";
export type ModuleOffState = "hidden" | "muted";
export interface WorkspaceModule {
  id: WorkspaceModuleId;
  label: string;          // plan 3.6 wording; user-facing
  description: string;    // the "Contains" column of the plan-5.2 table
  defaultForOrganiser: boolean;
  adminOnly: boolean;
  offState: ModuleOffState;
}
export const MODULES: readonly WorkspaceModule[];
export const MODULE_IDS: readonly WorkspaceModuleId[];       // MODULES.map(m => m.id)
export const ALL_MODULE_IDS: ReadonlySet<WorkspaceModuleId>;
export const ADMIN_ONLY_MODULE_IDS: ReadonlySet<WorkspaceModuleId>;
export const ORGANISER_DEFAULT_MODULE_IDS: ReadonlySet<WorkspaceModuleId>;
export function isWorkspaceModuleId(v: unknown): v is WorkspaceModuleId;
export function getModule(id: WorkspaceModuleId): WorkspaceModule;
```

`description` copies the plan's "Contains" column verbatim (e.g. `actions` → "SMS blasts, chat
boards, surveys and relays; email sends; call lists and sessions; task lists and the leader
webform; standalone or campaign-linked"), so the admin checklist explains each module without
new copy.

### 2.2 Org-wide defaults: where they live and how a non-admin reads them

**The problem.** `app_settings` SELECT is admin-only —
`baseline:25841-25845` (`Admin read app_settings`) plus RLS enabled at `:28160`. Appendix C 6.3
(`appendix-C-data-model.md:348`) states it plainly: "because SELECT is admin-only it cannot be
read by `user`/`viewer` clients to gate UI". The table also holds every integration secret
(`action_network_api_key`, Mobile Message credentials, SendGrid keys, webhook tokens —
`app/api/admin/settings/route.ts:4-23`), so any widening is a real risk, not a formality.

**Option (a): `app_settings` key `workspace_defaults` + a read path for non-admins.**
Two sub-variants:
- (a1) an additional permissive SELECT policy `FOR SELECT TO authenticated USING (key =
  'workspace_defaults')`. RLS policies OR together, so this exposes exactly one row. It works,
  but it puts a `USING` clause on a secrets table that a future migration could widen by
  accident (change `=` to `IN (...)`, or drop the predicate), and it is invisible from the app
  code — nothing in the repo would show *why* that policy exists.
- (a2) a `SECURITY DEFINER` function `public.get_workspace_defaults()` that reads exactly one
  key and returns `jsonb`. RLS on `app_settings` is untouched; the function name states its
  scope; it cannot be re-pointed at another key without a migration that is obvious in review;
  and it can swallow a malformed stored value rather than 500-ing the client. This is the same
  pattern the schema already uses for role reads (`get_user_role()`, `baseline:3346-3353`) and
  for admin-scoped JSON (`get_ai_cache_stats()`, `:2962-2984`), including the grant shape
  (`:29794-29796`).

**Option (b): a new `workspace_settings` table** with read-all / admin-write policies. Clean in
isolation and precedented in the (never-built) proposal at
`docs/stream3-4/STREAM3_4_DATA_MODEL_CHANGES.md:517-545` cited by
`appendix-C-data-model.md:350`. But it adds a table, two policies, grants, generated types and
a second org-config store alongside `app_settings` — for one row of JSON. It also loses the
existing Administration → Settings home (`administration/page.tsx:1581`,
`appendix-D-navigation-roles.md:289`) that the plan's implementation-hooks paragraph
(`ORGANISER_UX_REVIEW_AND_PLAN.md:235`) explicitly points at.

**Recommendation: (a2).** One key in the existing store, one narrowly-scoped
`SECURITY DEFINER` reader, no change to `app_settings` RLS. The work package's own wording
("an `app_settings` key holding org-wide defaults per work role") is satisfied literally.

#### Migration DDL

New file `supabase/migrations/20260909100000_workspace_mode.sql` (never edit an applied
migration; the three `20260908*` baselines stay untouched):

```sql
-- WP1.1 — module registry and workspace mode.
-- 1) Per-user overrides on user_profiles (baseline:9887-9899).
-- 2) A non-admin read path for the org-wide defaults held in app_settings
--    (app_settings SELECT is admin-only — baseline:25841-25845).

ALTER TABLE "public"."user_profiles"
  ADD COLUMN IF NOT EXISTS "workspace_prefs" "jsonb" NOT NULL DEFAULT '{}'::"jsonb";

COMMENT ON COLUMN "public"."user_profiles"."workspace_prefs" IS
  'WP1.1 workspace mode: per-user override of the org-wide defaults in '
  'app_settings.workspace_defaults. Shape {"mode":"full"|"organiser",'
  '"modules":[<module id>,...],"allowShowEverything":boolean} — every key optional; '
  '{} means "follow the default for my work role". Presentation only: it never '
  'grants or removes any data permission (RLS is unchanged).';

-- Narrow, auditable reader. SECURITY DEFINER (owner postgres) so a user/viewer
-- client can read this ONE key without app_settings SELECT being widened.
-- Returns '{}'::jsonb when the key is absent, empty or not valid JSON, so a bad
-- stored value degrades to "full for everyone" instead of erroring the client.
CREATE OR REPLACE FUNCTION "public"."get_workspace_defaults"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_raw text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;
  SELECT value INTO v_raw FROM public.app_settings WHERE key = 'workspace_defaults';
  IF v_raw IS NULL OR btrim(v_raw) = '' THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN v_raw::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN '{}'::jsonb;
END;
$$;

ALTER FUNCTION "public"."get_workspace_defaults"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_workspace_defaults"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."get_workspace_defaults"() FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."get_workspace_defaults"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_workspace_defaults"() TO "service_role";
```

No row is seeded. **An absent key is the "nothing stored" case and resolves to `full` for
everyone** — that is the acceptance criterion, and it holds on day one because the migration
writes no `workspace_defaults` row (§2.4 rule R1, §2.10 test T1).

Note the grant shape deliberately differs from the baseline's blanket
`GRANT ALL … TO anon/authenticated/service_role` (e.g. `:29848-29850`): `anon` must not be able
to probe org configuration, and the `auth.uid() IS NULL` guard is a second belt.

#### JSON shape

Stored as the TEXT `value` of `app_settings.key = 'workspace_defaults'` (the column is `text` —
`baseline:7881-7886` — so the API stores `JSON.stringify(...)` and the function casts):

```json
{
  "byWorkRole": {
    "organiser":              { "mode": "organiser", "modules": ["wall_chart_people","actions","setup","inbox"], "allowShowEverything": true },
    "lead_organiser":         { "mode": "full" },
    "coordinator":            { "mode": "full" },
    "industrial_officer":     { "mode": "full" },
    "industrial_coordinator": { "mode": "full" },
    "specialist":             { "mode": "full" }
  }
}
```

Every key is optional at every level. A missing work-role entry, a missing `mode`, a missing
`modules` array — each falls back one step (§2.4). The six work-role keys are exactly the
`user_profiles_work_role_check` values (`baseline:9898`).

#### Admin write path

**Do not extend `ALLOWED_KEYS` in `src/app/api/admin/settings/route.ts:4-23`.** That route's
`PATCH` (`:63-91`) takes `Record<string, string>` and upserts with **no validation** (`:70-72`,
`:81-87`), and `SettingsTab.handleSave` (`administration/page.tsx:1620-1650`) sends *every*
key in one body. Putting a structured JSON document behind that would (i) let any admin store
unparseable text that silently disables the feature for the whole org, and (ii) risk the
Settings form round-tripping the JSON through a text input.

Instead: **new route `src/app/api/admin/workspace-defaults/route.ts`** —
- `GET` → admin only; returns the parsed defaults (or `{}`), using the same `requireAdmin()`
  shape as `admin/settings/route.ts:27-46`.
- `PUT` → admin only; body validated with zod (`workspaceDefaultsSchema`, §2.3) against the
  registry; on success upserts `app_settings` with `key: "workspace_defaults"`,
  `value: JSON.stringify(parsed)`, `updated_at`, `updated_by: user.id` — same upsert shape as
  `admin/settings/route.ts:81-87`, using the caller's server client (the admin RLS policy
  `baseline:25847-25852` covers the write).
- Zod rejects unknown work-role keys, unknown module ids, and any `mode` outside
  `"full" | "organiser"` with a 400 and the zod issue list.

### 2.3 Per-user override — `user_profiles.workspace_prefs`

Migration DDL above. Baseline anchor: the `user_profiles` table is
`20260908050000_baseline_schema.sql:9887-9899`; the new column is appended, so
`handle_new_user()` (`:3534-3555`) — which inserts only `(user_id, role, display_name)` at
`:3538-3543` — needs **no change**: the `DEFAULT '{}'::jsonb` applies to every new row, and
`NOT NULL DEFAULT` on a `jsonb` column is a metadata-only rewrite in PG 11+, so no table
rewrite on dev or production.

**Who can write it.** The baseline policies on `user_profiles` are:
- `:25817` `Admin can insert profiles` — INSERT, `get_user_role() = 'admin'`.
- `:27205` `Authenticated users can read user_profiles` — SELECT `USING (true)`.
- `:27875` `Users can read own profile` — SELECT `USING (true)` (redundant duplicate).
- `:27887` `Users can update own profile` — UPDATE `USING (user_id = auth.uid() OR
  get_user_role() = 'admin')` with the same `WITH CHECK`.

So **at the database level any user can already update their own profile row, including the new
column.** There is no column-level grant on `user_profiles` to narrow that, and adding one is
out of scope here (it would change the update surface for `display_name`/`phone` too).

**Recommendation: admin-only writes in the application.** The only writer this package ships is
the Administration → Users editor, which goes through `/api/admin/update-user` (admin-checked at
`route.ts:29-36`) and the **service-role** client (`:84`, `createAdminClient()`). No client-side
code writes `workspace_prefs`. "Show everything" is session state and is never persisted, so a
user needs no self-write path at all.

This is safe to leave as-is because **workspace mode is presentation, never permission**
(§2.9): decision 1 already allows any organiser to flip to full for the session, so a user who
hand-crafted a PostgREST call to set their own `workspace_prefs.mode = "full"` would gain
exactly what the "Show everything" button gives them. Recorded as a risk (§2.11 R3) rather than
a blocker; a column-level grant belongs with WP1.6 (Auth and RLS alignment) if the operator
wants it.

### 2.4 Resolution logic — `src/lib/workspace/resolve.ts` (new, pure)

```ts
export type WorkspaceMode = "full" | "organiser";
export type WorkspaceSource = "default" | "role" | "user" | "session";

export interface ResolveWorkspaceInput {
  role: UserRole;                       // "admin" | "user" | "viewer"
  workRole: WorkRole | null;
  orgDefaults: unknown;                 // raw jsonb from get_workspace_defaults()
  userPrefs: unknown;                   // raw jsonb from user_profiles.workspace_prefs
  sessionShowEverything: boolean;
}
export interface ResolvedWorkspace {
  mode: WorkspaceMode;
  enabledModules: Set<WorkspaceModuleId>;
  canShowEverything: boolean;
  source: WorkspaceSource;              // where `mode` came from
}
export function resolveWorkspace(input: ResolveWorkspaceInput): ResolvedWorkspace;
```

Both JSON inputs are typed `unknown` and go through `safeParse` (§2.3 schemas) — the function
never throws, for any input.

Rules, in order:

- **R1 (default).** Nothing stored and nothing overridden → `mode: "full"`, `source: "default"`,
  `enabledModules` = every module the role may see. **This is the acceptance criterion.**
- **R2 (admin).** `role === "admin"` → always `mode: "full"`, `source: "role"`, all 13 modules
  including `administration`, `canShowEverything: false` (there is nothing more to show). Org
  defaults and user prefs for admins are ignored.
- **R3 (admin-only modules).** For any non-admin, `adminOnly` ids are removed from
  `enabledModules` unconditionally — in full mode, in organiser mode, from user prefs, from org
  defaults, and from a session "Show everything" expansion.
- **R4 (role default lookup).** Lookup key = `workRole` when it is one of the six legal values.
  When `workRole` is null: `role === "viewer"` uses the `organiser` entry ("`viewer` follows
  organiser defaults"); `role === "user"` has no entry and falls to R1 (`full`).
- **R5 (user override).** A valid `mode` in `userPrefs` beats the role default in both
  directions (`organiser → full` and `full → organiser`); `source: "user"`. A valid `modules`
  array in `userPrefs` replaces the role's module list wholesale (not a union).
- **R6 (module list fallback), organiser mode only.** `userPrefs.modules` → else
  `orgDefaults.byWorkRole[key].modules` → else `ORGANISER_DEFAULT_MODULE_IDS` (the registry's
  four `defaultForOrganiser: true` ids). Full mode always means every module the role may see,
  regardless of any stored list.
- **R7 (unknown ids).** Any id in stored JSON that is not in `MODULE_IDS` is dropped silently;
  it never invalidates the rest of the document. Duplicates collapse in the `Set`.
- **R8 (`canShowEverything`).** `mode === "organiser" && role !== "admin" &&
  allowShowEverything !== false`, where `allowShowEverything` is read from `userPrefs` first,
  then the role entry, defaulting to **true** (decision 1).
- **R9 (session).** `sessionShowEverything && canShowEverything` → `mode: "full"`,
  `enabledModules` = every module the role may see, `source: "session"`, and
  `canShowEverything` stays `true` (so the UI can offer "Back to my workspace"). When the
  resolved mode was already `full`, `sessionShowEverything` changes nothing — `source` keeps
  its earlier value, never `"session"`.
- **R10 (malformed).** `orgDefaults` that is not an object, or whose `byWorkRole` is not an
  object, parses to "absent" → R1. A malformed `userPrefs` parses to "absent" → the role
  default still applies (a bad user document must not drag the whole org back to `full`, and
  must not crash). Both are `null`/`undefined`-safe.

Helper `modulesForRole(role) → Set<WorkspaceModuleId>` (all ids, minus `adminOnly` for
non-admins) is exported and reused by R1/R2/R9.

### 2.3b Schemas — `src/lib/workspace/prefs-schema.ts` (new, pure)

Zod v4 (`package.json:79`), shared by the two API routes and by `resolve.ts`:

```ts
export const workspaceModeSchema = z.enum(["full", "organiser"]);
export const workspaceModuleIdSchema = z.enum(MODULE_IDS);     // from the registry
export const workspacePrefsSchema = z.object({
  mode: workspaceModeSchema.optional(),
  modules: z.array(workspaceModuleIdSchema).optional(),
  allowShowEverything: z.boolean().optional(),
}).strict();
export const workspaceRoleDefaultSchema = /* same shape */;
export const workspaceDefaultsSchema = z.object({
  byWorkRole: z.record(z.enum(WORK_ROLE_VALUES), workspaceRoleDefaultSchema).optional(),
}).strict();

// Never throw; used by resolve.ts on untrusted DB JSON.
export function parseWorkspacePrefs(v: unknown): WorkspacePrefs | null;
export function parseWorkspaceDefaults(v: unknown): WorkspaceDefaults | null;
```

`.strict()` is used on the **API write path** (reject typos in an admin's payload). The lenient
readers `parseWorkspacePrefs`/`parseWorkspaceDefaults` first strip unknown module ids and
unknown work-role keys, then parse, so R7/R10 hold for documents that predate a future registry
change. `WORK_ROLE_VALUES` is a new exported const in the registry file mirroring the six
`user_profiles_work_role_check` values (`baseline:9898`) and `WorkRole`
(`src/types/organising-row-types.ts:3-9`).

### 2.5 The hook — `src/lib/workspace/use-workspace.tsx` (new, client)

```tsx
"use client";
export function WorkspaceProvider({ children }: { children: ReactNode }): JSX.Element;
export function useWorkspace(): {
  mode: WorkspaceMode;
  enabledModules: Set<WorkspaceModuleId>;
  canShowEverything: boolean;
  showEverything: boolean;              // the session toggle's current value
  setShowEverything: (v: boolean) => void;
  isModuleEnabled: (id: WorkspaceModuleId) => boolean;
  moduleState: (id: WorkspaceModuleId) => "on" | "muted" | "hidden";
  source: WorkspaceSource;
  loading: boolean;                     // auth or defaults still loading
};
```

Inputs:
- `useAuth()` (`src/lib/supabase/auth-context.tsx:384`) for `role` (`:361`) and
  `profile.work_role` / `profile.workspace_prefs`. **`fetchProfile` needs no change**: it
  already does `.select("*")` (`auth-context.tsx:111-117`), so the new column arrives with the
  role automatically — exactly the mechanism appendix D item 5
  (`appendix-D-navigation-roles.md:368`) points at. Only the TypeScript type must be widened
  (§2.7).
- Org defaults through `useWorkspaceDefaults()` (new, `src/lib/hooks/useWorkspaceDefaults.ts`):
  React Query, key `["workspace-defaults"]`, `queryFn` = `supabase.rpc("get_workspace_defaults")`
  (same `.rpc(...)` idiom as `src/lib/hooks/useDeleteCampaign.ts:13`), `enabled: !!user`,
  `staleTime: 5 * 60_000`, `retry: 1`. On error the hook returns `undefined` → R10 → `full`.
  One RPC per session, not per page.
- Session toggle: **plain React `useState` in the provider.** Not `localStorage` (the
  orchestrator rule: "Do not keep view state in localStorage") and not `sessionStorage` either.
  `sessionStorage` survives reloads within a tab, which would make "Show everything" sticky and
  invisible; plan 5.2 (`:214`) says "for the session". Plain state resets on reload, which is
  the conservative reading and keeps the toggle discoverable. The existing `sessionStorage`
  keys in `providers.tsx:272,283,425,442` are recovery cooldowns, not view state — not a
  precedent for this.

`moduleState(id)`: `"on"` when enabled; otherwise the module's `offState` from the registry
(§2.1) — `"hidden"` or `"muted"`. Nothing consumes it in this package.

The body is a `useMemo` over `resolveWorkspace({...})`, so all the logic under test is the pure
function; the hook is plumbing only.

**Mount point:** `src/components/providers.tsx:480` — change
`<AuthProvider>{children}</AuthProvider>` to
`<AuthProvider><WorkspaceProvider>{children}</WorkspaceProvider></AuthProvider>`. It must be
*inside* `AuthProvider` (needs `useAuth`) and *inside* `QueryClientProvider` (`:476`, needs
React Query). Import added at `providers.tsx:6-7`.

A default context value (`mode: "full"`, all non-admin modules, `canShowEverything: false`)
means `useWorkspace()` outside the provider — the token-based `/call/` and `/leader/` routes
noted at `providers.tsx:34-35` — behaves as full mode rather than throwing.

### 2.6 Admin editor

#### (a) Per user — Administration → Users

`src/app/(dashboard)/administration/page.tsx`:

- **State** (add beside `:107-120`): `editWorkspaceMode: "default" | "full" | "organiser"` and
  `editWorkspaceModules: WorkspaceModuleId[] | null` (`null` = "follow the default for this
  role"; the checklist is disabled and shows the resolved role default as placeholder ticks
  until the admin clicks "Set modules for this user").
- **Populate on open** (`:297-306`, inside the Pencil button's `onClick`): parse
  `row.workspace_prefs` with `parseWorkspacePrefs` and seed both fields; `null`/`{}` →
  `"default"` / `null`.
- **UI** (insert after the "Reports To" block, which ends at `:623`, before the `editError`
  block at `:624-626`): a bordered "Workspace" section —
  - `<Label>Workspace mode</Label>` + `<Select>` with `Default for role` / `Full` /
    `Organiser` (`@/components/ui/select`, already imported).
  - `<Label>Modules</Label>` + a `<Checkbox>` list built from `MODULES`
    (`@/components/ui/checkbox` exists at `src/components/ui/checkbox.tsx`) rendering
    `module.label` with `module.description` as helper text; `adminOnly` rows are rendered
    disabled with "Admins only" when the edited user is not an admin.
  - A one-line note: "Workspace mode changes what this person sees, not what they can do."
- **Mutation** (`:181-217`): add `workspacePrefs: WorkspacePrefs | null` to the `mutationFn`
  argument type (`:186-195`) and to the JSON body (`:199-208`).
- **Save call** (`:645-657`): build `workspacePrefs` from the two fields — omit `mode` when
  `"default"`, omit `modules` when `null`, and send `{}` when both are default (clearing the
  override).

`UserRow extends UserProfile` (`:92-95`) and `/api/admin/users` selects `*`
(`src/app/api/admin/users/route.ts:29-32`), so `workspace_prefs` reaches the table with no
route change.

#### (b) API — `src/app/api/admin/update-user/route.ts`

- Destructure `workspacePrefs` in the body block at `:38-56` (typed `unknown`).
- Validate after the existing `email` check at `:77-83`:
  `if (workspacePrefs !== undefined) { const parsed = workspacePrefsSchema.safeParse(workspacePrefs ?? {}); if (!parsed.success) return 400 with the issue list; }`.
  This is the allow-list widening the work package asks for — one new field, schema-validated
  against the registry, unlike the free-text keys in `admin/settings/route.ts`.
- Extend the `updates` allow-list at `:127-136`:
  `if (workspacePrefs !== undefined) updates.workspace_prefs = parsedPrefs;` (never the raw
  body value). `null` is normalised to `{}` so the column's `NOT NULL` holds.
- `willUpdateProfile` (`:150`) already keys off `Object.keys(updates).length`, so a
  workspace-only edit saves correctly and the "No fields to update" 400 (`:155-157`) is not hit.

#### (c) Org-wide defaults — Administration → Settings

New component `src/components/administration/workspace-defaults-card.tsx` (the existing
`src/components/administration/` folder holds `organiser-patches-tab.tsx`,
`worker-dimensions-tab.tsx`, …), rendered as an extra `<Card>` inside the SettingsTab grid at
`administration/page.tsx:1663`. It has its **own** load/save against
`/api/admin/workspace-defaults` and does **not** join `SettingsTab.handleSave`
(`:1620-1650`) — so a workspace edit can never resend the SendGrid/Mobile Message credentials,
and a credentials edit can never blank the workspace defaults.

Contents: one row per work role (the six `WORK_ROLES` already defined for this page at
`:77-86`), each with the same mode select and module checklist as the per-user editor, plus an
"Allow Show everything" switch defaulting **on** (decision 1). Saving `PUT`s the whole
`{ byWorkRole: … }` document; rows left at "Full" are written as `{ mode: "full" }`.

### 2.7 Types

- `src/types/organising-row-types.ts:832-842` — add `workspace_prefs: unknown;` to
  `UserProfile`. Typed `unknown` (not `Record<string, unknown>`) so every consumer is forced
  through `parseWorkspacePrefs`. Only one other place references the interface
  (`auth-context.tsx:32`), and `UserRow` extends it (`administration/page.tsx:92-95`), so the
  blast radius is two files.
- After the migration is applied to **dev**, from the repo root:
  `SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types`, then commit
  `packages/db-types/generated.ts`. Expected diff: `workspace_prefs: Json` on the
  `user_profiles` `Row`/`Insert`/`Update` (currently `generated.ts:18358-18368`) and a
  `get_workspace_defaults` entry under `public.Functions` (which is what makes
  `supabase.rpc("get_workspace_defaults")` typecheck — regenerate **before** writing the hook,
  or the build fails).
- **Never** run `pnpm gen:types` without `SUPABASE_PROJECT_REF` — it defaults to production
  (`package.json:9`, PROGRESS standing note).

**Verifier's migration steps** (per `docs/DEV_PROD_ENVIRONMENT.md:64-79`), from the repo root:

```bash
pnpm validate:migrations
npx supabase link --project-ref dpnnmkhabysfdogllsyh
env -u SUPABASE_DB_PASSWORD npx supabase migration list
env -u SUPABASE_DB_PASSWORD npx supabase db push --dry-run
env -u SUPABASE_DB_PASSWORD npx supabase db push
SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types
```

Production (`gteygwfgjvczanmrwgbr`) is never touched — not even a read.

### 2.8 No behaviour change

Nothing in this package renders differently for anyone. The registry, the resolver and the hook
are additive; `sidebar.tsx:33-53` (`navItems`/`adminItems`), `src/lib/campaign-tabs.ts` and
`campaigns/[id]/page.tsx` are **not** touched — WP1.2 and WP1.4 own those.

**What an organiser sees after this package ships: exactly what they see today.** The
`workspace_defaults` key does not exist, so `get_workspace_defaults()` returns `{}`; every
`workspace_prefs` is `{}` by column default; R1 resolves `mode: "full"`, `source: "default"`
for every role and work role; and no component reads `useWorkspace()` anyway. The only visible
change is two new admin-only editors (Administration → Users, Administration → Settings), which
are inert until WP1.2 consumes the result.

### 2.9 Role coverage: proving a `user`-role client can read the defaults

This is the one thing that could silently fail in production, because it fails *closed and
quietly* (RLS returns no row, the resolver falls back to `full`, and the feature just never
turns on for the people it targets).

**Primary check — SQL probe on dev, inside a rolled-back transaction.** Run against
`dpnnmkhabysfdogllsyh` only, substituting the `user_id` of the existing `user`-role e2e account
(the one WP0.2 used for flow one, PROGRESS "Previews and e2e"):

```sql
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '<user-role-account-uuid>', 'role', 'authenticated')::text,
  true);
SET LOCAL ROLE authenticated;

-- 1. The reader works for a non-admin and returns the stored document.
SELECT public.get_workspace_defaults();

-- 2. The table itself is still closed: expect 0.
SELECT count(*) FROM public.app_settings;

-- 3. The user's own prefs column is readable (SELECT USING (true), baseline:27205).
SELECT workspace_prefs FROM public.user_profiles WHERE user_id = auth.uid();
ROLLBACK;
```

Pass = (1) returns the JSON document (or `{}` when unset), (2) returns `0`, (3) returns `{}`.
Repeat with a `viewer` account's uuid; both must behave identically. Run the same three
statements *without* the `SET LOCAL ROLE` block as the service role to confirm the seeded value
is actually present when the admin editor has written one.

**Secondary check — through the app on the branch preview.** The `WorkspaceProvider` is mounted
globally (`providers.tsx:480`), so the RPC fires on every authenticated page load. Log into the
`feat/oux-wp1.1-workspace-mode` Vercel Preview (dev-backed) with the `user`-role e2e account and
confirm in the network panel a `POST /rest/v1/rpc/get_workspace_defaults` returning **200** with
a JSON body — not 401/403/404. This is the check that would have caught option (b)'s missing
grant or a mis-scoped policy. No local `pnpm dev` and no local screenshots (PROGRESS standing
note: `.env.local` points at production).

**Order matters:** run the app check *after* an admin has saved a non-empty document through
Administration → Settings, so a `200 {}` cannot be mistaken for success.

### 2.10 Tests

All pure, `environment: "node"` (`vitest.config.ts:19`), following
`src/lib/nav/__tests__/active-nav.test.ts`. There is no `@testing-library/react` and no jsdom in
this app (no `*.test.tsx` exists anywhere under `src/`), so the hook is deliberately a thin
`useMemo` wrapper and **the resolver carries the whole acceptance criterion**. Adding jsdom +
testing-library is out of scope (§3).

`src/lib/workspace/__tests__/resolve.test.ts` — table-driven, one case per rule:

| # | Case | Expectation |
|---|---|---|
| T1 | nothing stored × {admin, user, viewer} × {all six work roles, null} | `mode: "full"`, `source: "default"` (`"role"` for admin) — **the acceptance criterion** |
| T2 | admin with org default `organiser` and user pref `organiser` | still `full`, `source: "role"`, `administration` enabled, `canShowEverything: false` |
| T3 | org default `organiser` with no `modules` | organiser mode, `enabledModules` = the four `defaultForOrganiser` ids, `source: "role"` |
| T4 | org default `organiser` with explicit `modules` | exactly those ids |
| T5 | org default `organiser` for `organiser`, `full` for `lead_organiser` | each work role resolves by its own key |
| T6 | user pref `mode: "full"` over org default `organiser`; and the reverse | `source: "user"` both ways |
| T7 | user pref `modules` over org default `modules` | replaces wholesale, not a union |
| T8 | non-admin with `administration` in user prefs and in org defaults | `administration` absent (R3) |
| T9 | viewer, `work_role: null`, org default set for `organiser` | follows the organiser entry; no admin-only module |
| T10 | organiser mode + `sessionShowEverything: true` | `full`, `source: "session"`, all non-admin modules, `canShowEverything` still `true` |
| T11 | `allowShowEverything: false` (role entry, then user pref) + `sessionShowEverything: true` | stays `organiser`, `canShowEverything: false` |
| T12 | already `full` + `sessionShowEverything: true` | `full`, `source` unchanged (never `"session"`) |
| T13 | `modules: ["wall_chart_people","not_a_module","actions","actions"]` | unknown dropped, duplicate collapsed, no throw |
| T14 | malformed `orgDefaults`: `null`, `undefined`, `"x"`, `[]`, `{byWorkRole: 5}`, `{byWorkRole:{organiser:"x"}}` | `full`, `source: "default"`, no throw |
| T15 | malformed `userPrefs` with a valid org default `organiser` | role default still applies (`organiser`, `source: "role"`) |
| T16 | `canShowEverything` default with nothing stored about it | `true` in organiser mode (decision 1) |

`src/lib/workspace/__tests__/modules.test.ts`:
- 13 modules; ids unique; `MODULE_IDS` matches the `WorkspaceModuleId` union exhaustively (a
  `satisfies Record<WorkspaceModuleId, true>` map built from `MODULE_IDS`).
- `defaultForOrganiser === true` for exactly `wall_chart_people, actions, setup, inbox` (plan
  5.2's "the first four are on for organisers by default", `:220`).
- `administration` is the only `adminOnly`.
- `offState === "hidden"` for exactly `imports, administration` (fix round 1; the other eleven,
  `organisation_databases` included, are `muted`).
- Every module has a non-empty `label` and `description`; the `strategic_plan` label is
  `"Strategic plan"` (plan 3.6, guards against "Strategic planning" creeping back).

`src/lib/workspace/__tests__/prefs-schema.test.ts`:
- valid prefs/defaults parse and round-trip; unknown module ids and unknown work-role keys are
  stripped by the lenient readers but **rejected** by the strict API schemas; `mode: "simple"`
  rejected; `null`/`[]`/`"x"`/`0` → `null` from both lenient readers.

### 2.11 Commands and acceptance mapping

From `apps/organising-db`:

```bash
pnpm test -- src/lib/workspace     # acceptance: resolution rules, incl. "full for everyone"
pnpm test                          # whole suite; must not regress the recorded baseline
pnpm lint                          # errors must not rise above 143 (PROGRESS standing note)
pnpm build
```

From the repo root:

```bash
pnpm validate:migrations
```

| Acceptance criterion | Proved by |
|---|---|
| Unit tests for visibility resolution — role default | T3, T4, T5, T9 |
| — per-user override | T6, T7, T8 |
| — session "Show everything" | T10, T11, T12, T16 |
| The flag defaults to `full` for everyone | T1 (every role × every work role), plus §2.2 "no row is seeded" and §2.8 |
| Non-admin can read the org defaults | §2.9 SQL probe on dev + a 200 RPC on the preview |
| Registry ids match plan 5.2 | `modules.test.ts` |

Lint discipline (PROGRESS standing note): every file touched must lint clean on its changed
lines; the 143-error/151-warning total must not rise. `administration/page.tsx` is a
pre-existing offender — keep the added JSX inside the existing style and re-measure before/after.

### 2.12 Risks

- **R1 — the new read path fails closed and silently.** If the grant, the `SECURITY DEFINER`
  owner or the `search_path` is wrong, a `user` client gets an error the hook swallows, and
  organiser mode never activates for anyone in WP1.2. Mitigated by the §2.9 probe *and* the
  preview RPC check, both mandatory before the PR leaves draft.
- **R2 — widening the admin API allow-list.** `/api/admin/update-user` gains a field that
  writes with the **service-role** client (`route.ts:84`), which bypasses RLS. Mitigation: zod
  validation before the write, `updates.workspace_prefs` assigned only from the parsed value,
  and the field ignored entirely when absent. The generic `/api/admin/settings` allow-list is
  **not** widened (§2.2) precisely because it does no validation.
- **R3 — a user can already self-write `workspace_prefs`** via the `Users can update own
  profile` policy (`baseline:27887`). Accepted: mode is presentation, decision 1 grants
  "Show everything" anyway, and no RLS policy or API check anywhere will read `workspace_prefs`.
  Flag to the operator (§4 Q1) as a WP1.6 candidate if a column grant is wanted.
- **R4 — JSON validity.** `app_settings.value` is `text` (`baseline:7881-7886`), so a bad row
  written outside the app (SQL editor, a future migration) would break the cast. Mitigated at
  three layers: the function's `EXCEPTION … RETURN '{}'`, the lenient reader, and R10 in the
  resolver.
- **R5 — `handle_new_user()`.** It inserts three columns (`baseline:3538-3543`) and is
  `SECURITY DEFINER` with a swallow-all handler (`:3547-3549`) — a missing column default would
  have silently stopped profile creation for every new user. The `NOT NULL DEFAULT '{}'::jsonb`
  is what prevents that; the function is deliberately **not** edited. Verifier should confirm
  by inviting a throwaway user on dev and checking the row appears with `workspace_prefs = {}`.
- **R6 — type-regeneration ordering.** `supabase.rpc("get_workspace_defaults")` does not
  typecheck until `generated.ts` is regenerated from dev. Implement in the order: migration →
  `db push` (dev) → `gen:types` → hook/route code → `pnpm build`.
- **R7 — `AuthProvider.fetchProfile` retry path.** `select("*")` (`auth-context.tsx:111-117`)
  returns `null` after two failures (`:141`), so `profile` can be `null` while a session is
  live. `useWorkspace` must treat `profile == null` as "no prefs" → `full` (never "organiser
  with no modules", which would render an empty shell in WP1.2).
- **R8 — an extra RPC on every session.** One `staleTime`-guarded call per session on top of
  the existing profile fetch. Negligible, but it is a new dependency in the login path: the
  query must never block render (`loading` is exposed, the resolver returns `full` meanwhile).

---

## 3. Out of scope

Tempted, deliberately excluded:

- **Any navigation or tab change.** `sidebar.tsx:33-53`, `mobile-nav.tsx`,
  `src/lib/campaign-tabs.ts` and `campaigns/[id]/page.tsx` are untouched. Adding a `module:`
  field to `navItems`/`VALID_TABS` is WP1.2/WP1.4 and would make this package's "no behaviour
  change" claim untestable.
- **The "Show everything" button itself.** The hook exposes `showEverything` /
  `setShowEverything`; the control that calls it lives in the organiser chrome (WP1.2).
- **"Ask an admin to enable" muted rendering.** `moduleState()` returns the classification;
  the copy and the muted treatment ship with the surfaces that use them.
- **"My campaigns" home** (plan 5.3) and the campaign workspace (5.4) — WP1.3/WP1.4.
- **`isLeadOrganiser` / `isOrganiser` on the auth context** (plan 5.10,
  `appendix-D-navigation-roles.md:364`). Tempting one-liners, but nothing here needs them and
  WP1.2 is the honest consumer.
- **Removing the duplicate `Users can read own profile` SELECT policy** (`baseline:27875`,
  redundant with `:27205`) and **column-level grants on `user_profiles`**. Both are RLS changes
  → WP1.6.
- **Backfilling `workspace_prefs` or seeding `workspace_defaults`** for the pilot group. The
  acceptance criterion is `full` for everyone; turning organiser mode on for real people is a
  Phase 1 exit activity, not a migration.
- **jsdom + `@testing-library/react`** to test the hook directly. It would be the first
  component test in the app (`vitest.config.ts:19` is `environment: "node"`; no `*.test.tsx`
  exists) and a new dev dependency. Keeping the hook a thin `useMemo` over a fully tested pure
  function gets the same coverage for no infrastructure.
- **Retiring `wallchart:displayMode` localStorage** (`wall-chart/use-display-mode.ts:6-35`,
  the orchestrator's "no view state in localStorage" rule). Real, but it is per-campaign chart
  state, not workspace state — plan 5.1 principle 6 puts it in Phase 2.
- **A `workspace_settings` table** (option (b), §2.2) — evaluated and rejected.

---

## 4. Open questions

Only one needs the operator; everything else is decided above with a stated assumption.

**Q1 — Should a user be able to change their own workspace mode?** The DB already allows it
(`baseline:27887`), and this package simply does not ship a UI for it (§2.3). *Assumption,
proceeding:* admin-only writes in the app; no self-service editor; no column grant. If the
operator wants self-service later ("let organisers switch themselves back to full permanently"),
it is a small addition to a profile page and needs no schema change. If the operator wants the
opposite — the DB to *enforce* admin-only writes — that is a column-level `GRANT UPDATE`
change on `user_profiles` and belongs in WP1.6 alongside the other RLS work.

Assumptions recorded without asking:

- Module ids as proposed in §2.1 (`wall_chart_people`, `strategic_plan`, `activists_wocs`,
  `organisation_databases`, …). They are internal; only the labels are user-facing, and those
  come from plan 3.6/5.2 verbatim.
- The hidden/muted split (§2.1) follows the plan's single worked example (imports → hidden);
  `administration` joins it as the other permission-shaped module. (`organisation_databases`
  was proposed as hidden too; the orchestrator ruled it `muted` in fix round 1.) Reviewable as
  data in one file if the operator disagrees.
- `allowShowEverything` defaults to `true` everywhere, per decision 1's "'Show everything'
  allowed for organisers"; it is settable to `false` per role and per user so a future policy
  change needs no migration.
- The session toggle is plain React state, resetting on reload (§2.5).
- The org-defaults document is written by a dedicated validated route, not through the generic
  `/api/admin/settings` allow-list (§2.2).

## 5. Orchestrator approval

**Approved 2026-09-09** as written. Q1: assumption accepted — admin-only writes in the app, no self-service editor in this package; database-level enforcement of admin-only writes on `workspace_prefs` is handed to WP1.6 as a note. The `SECURITY DEFINER` reader with narrow grants is the right call given `app_settings` holds integration secrets; the reviewer (Fable) must check the function cannot be used to read any other key. Implementer is the high-risk tier because the package adds a migration and a definer function. Branch `feat/oux-wp1.1-workspace-mode` off `develop`; PR base `develop`. The verifier applies the migration to dev per docs/DEV_PROD_ENVIRONMENT.md and regenerates types from dev before the hook is typechecked.

## 6. Deviations from plan

1. **No cast on `supabase.rpc("get_workspace_defaults")`.** `createClient()`
   (`src/lib/supabase/client.ts:134`) returns an *untyped* `SupabaseClient`, so the RPC call in
   `src/lib/hooks/useWorkspaceDefaults.ts` typechecks today without the generated `Functions`
   entry. There is therefore **no `// TODO(WP1.1 verifier)` cast to remove** — the comment in
   the hook says so. `pnpm gen:types` is still required (it adds `workspace_prefs: Json` to the
   `user_profiles` Row/Insert/Update and the `get_workspace_defaults` function entry) and
   tsc/test/build must be re-run after it; nothing in the app code has to change.
2. **`z.partialRecord` instead of `z.record`** (§2.3b) for `byWorkRole`. In zod 4, `z.record`
   with an enum key is *exhaustive* — every work role would be required — so a document with
   only an `organiser` entry failed to parse. `partialRecord` is the intended zod-4 form; the
   §2.10 prefs-schema tests caught this on the first run.
3. **Lenient readers ignore unknown *top-level* keys.** `.strict()` is applied only on the API
   write path (as §2.3b states); `parseWorkspacePrefs`/`parseWorkspaceDefaults` use non-strict
   variants after stripping unknown module ids and work-role keys, so a future key in a stored
   document degrades gracefully instead of nulling it. Tested.
4. **`setup` description says "who's in", not "universe".** The plan's "Contains" column reads
   "universe, groups and units, organisers, basics"; the orchestrator's instruction to use plan
   3.6 terminology in labels ("Who's in") was applied to this one helper-text string. Every other
   description is the plan's Contains column verbatim.
5. **Migration additions, documentation only:** a `COMMENT ON FUNCTION` for
   `get_workspace_defaults()` and a header comment stating that no row is seeded. DDL, grants,
   owner, `search_path` and the function body are exactly §2.2.
6. **One extra file:** `src/components/administration/workspace-module-checklist.tsx`, the
   registry-driven checklist shared by the per-user editor and the org-defaults card, so the
   two never drift.
7. **Per-user editor placeholder ticks** (§2.6a) are computed by calling the pure
   `resolveWorkspace()` with the form's current permission role, work role and mode, against the
   org defaults fetched (admin-side, React Query key `["admin-workspace-defaults"]`) from the
   new GET route. The plan asked for "the resolved role default as placeholder ticks" without
   saying how; reusing the resolver keeps one source of truth. A stored per-user
   `allowShowEverything` (writable only via the API) is preserved on save rather than dropped.
8. **Org-defaults card:** in Organiser mode the checklist is initialised from the stored list or
   the registry's four defaults and `modules` is always written; rows at Full are written as
   `{ mode: "full" }` per §2.6c. The R6 "no `modules` → registry default" fallback is therefore
   reached only for hand-written documents (still tested, T3).
9. **`isWorkRole()`** is exported from the registry alongside `isWorkspaceModuleId()`; the
   resolver and the lenient reader both need it.
10. **Provider with a null profile** (§2.12 R7) passes *both* `orgDefaults` and `userPrefs` as
    `undefined`, so a live session whose profile fetch gave up resolves to `full`/`default`
    even when the org has organiser defaults for `viewer` (the auth context's fallback role).

### Implementer notes

**Files (all under `apps/organising-db/` unless noted):**

- `supabase/migrations/20260909100000_workspace_mode.sql` (repo root) — **the migration**.
- `src/lib/workspace/modules.ts` — registry (§2.1) + `WORK_ROLE_VALUES`, `isWorkRole`.
- `src/lib/workspace/prefs-schema.ts` — zod schemas + lenient readers (§2.3b).
- `src/lib/workspace/resolve.ts` — `resolveWorkspace()`, `modulesForRole()` (§2.4).
- `src/lib/workspace/use-workspace.tsx` — `WorkspaceProvider`, `useWorkspace()` (§2.5).
- `src/lib/hooks/useWorkspaceDefaults.ts` — React Query over the RPC (§2.5).
- `src/lib/workspace/__tests__/{resolve,modules,prefs-schema}.test.ts` (§2.10).
- `src/components/providers.tsx` — provider mounted inside `AuthProvider`.
- `src/types/organising-row-types.ts` — `UserProfile.workspace_prefs: unknown` (§2.7).
- `src/app/api/admin/workspace-defaults/route.ts` — GET/PUT (§2.2).
- `src/app/api/admin/update-user/route.ts` — `workspacePrefs` allow-list field (§2.6b).
- `src/app/(dashboard)/administration/page.tsx` — Users editor section, Settings card mount.
- `src/components/administration/workspace-defaults-card.tsx` (§2.6c).
- `src/components/administration/workspace-module-checklist.tsx` (shared, deviation 6).

Not touched, per §2.8/§3: `sidebar.tsx`, `mobile-nav.tsx`, `src/lib/campaign-tabs.ts`,
`campaigns/[id]/page.tsx`, `/api/admin/settings`, `auth-context.tsx`, `handle_new_user()`,
any RLS policy. Nothing consumes `useWorkspace()` yet.

**Gates run by the implementer (from `apps/organising-db` unless noted):**

- `pnpm exec eslint` on every touched file: zero findings on changed lines. `administration/page.tsx`
  is at 0 errors / 2 warnings, both on pre-existing lines (2734, 2740).
- `pnpm test`: 766 passed (766), including the 34 new workspace tests. A mutation pass
  (disabling R1, R2, R3, R4, R5, R6 precedence, R8 default, R8 order, R9, R9 gate, and the
  `role` source one at a time) failed at least one named test each time.
- `pnpm exec tsc --noEmit -p tsconfig.json`: clean.
- `pnpm build`: "Compiled successfully", 126/126 static pages generated, exit 0 (on the final
  code; verifier re-runs after `gen:types`).
- Whole-project `pnpm exec eslint .`: 294 problems (143 errors, 151 warnings) — identical to the
  develop baseline in the PROGRESS standing note; the count did not rise.
- Repo root `pnpm validate:migrations`: "Validated 4 Supabase migrations with unique 14-digit versions."

**Verifier hand-off (dev only — `dpnnmkhabysfdogllsyh`; never `gteygwfgjvczanmrwgbr`):**

```bash
# repo root
pnpm validate:migrations
npx supabase link --project-ref dpnnmkhabysfdogllsyh
env -u SUPABASE_DB_PASSWORD npx supabase migration list
env -u SUPABASE_DB_PASSWORD npx supabase db push --dry-run     # expect only 20260909100000_workspace_mode.sql
env -u SUPABASE_DB_PASSWORD npx supabase db push
SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types        # commit packages/db-types/generated.ts
# there is no cast to remove (deviation 1); confirm the hook still typechecks
cd apps/organising-db && pnpm exec tsc --noEmit -p tsconfig.json && pnpm test && pnpm build
```

Then run the §2.9 role-coverage probe SQL on dev (user-role uuid, then a viewer uuid, then as
service role), and the §2.9 preview RPC check after an admin has saved a non-empty document via
Administration → Settings → Workspace defaults. Also the §2.12 R5 check: invite a throwaway
user on dev and confirm `workspace_prefs = '{}'`.

**Commits (branch `feat/oux-wp1.1-workspace-mode`, not pushed):**

- `e5997f9` feat(oux-wp1.1): module registry, prefs schemas and pure workspace resolver
- `57f9da8` feat(oux-wp1.1): workspace_prefs column, get_workspace_defaults() reader, UserProfile type
- `e2ca3e0` feat(oux-wp1.1): useWorkspace() hook, WorkspaceProvider and org-defaults query
- `99e852f` feat(oux-wp1.1): admin workspace-defaults route and update-user allow-list
- `11c1e83` feat(oux-wp1.1): admin workspace editors in Users and Settings
- (this file) feat(oux-wp1.1): implementer notes and deviations

### Fix round 1

Reviewer findings 1, 2, 3, 4, 6, 8 plus the orchestrator's ruling (9), applied on
`feat/oux-wp1.1-workspace-mode`. Findings 5 and 7 were not raised for this round. No schema
change: the migration and `packages/db-types/generated.ts` are untouched.

1. **A failed load can no longer overwrite the stored defaults**
   (`src/components/administration/workspace-defaults-card.tsx`). The initial GET's failure now
   sets its own `loadError` state, separate from save errors. While it is set, Save is disabled
   and `handleSave` returns early, and the banner says to reload before saving — previously the
   all-`full` seed in `rows` could be `PUT` over a document that had simply failed to load.
2. **No pinned module list under full mode**
   (`src/app/(dashboard)/administration/page.tsx`). "Set modules for this user" is only offered
   when the effective mode is `organiser`; in full mode the row reads "Full mode shows every
   module". The saved document omits `modules` entirely whenever the effective mode is `full`
   (`editWorkspaceModulesToSave`), so switching a user to full clears a stale pinned list
   instead of storing one that would reappear on a later switch back.
3. **An empty `modules: []` never means "zero modules".** In `src/lib/workspace/resolve.ts` R6,
   an empty array from either the user prefs or the role entry is treated as "not provided" and
   falls through (user list → role list → the registry's four organiser defaults); a non-empty
   list that prunes to nothing under R3 is still an explicit choice and stays empty. New test
   `T17` in `src/lib/workspace/__tests__/resolve.test.ts` covers all three fall-throughs. Both
   editors also refuse to save an empty organiser selection: the per-user dialog disables Save
   with an inline hint, and the org-defaults card disables Save and names the offending rows.
4. **A name-only edit no longer rewrites `workspace_prefs`.** The dialog snapshots the three
   workspace fields as parsed on open (`editWorkspaceInitial`) and sends `workspacePrefs` only
   when one of them moved; otherwise the key is `undefined` and `JSON.stringify` drops it, which
   `/api/admin/update-user` already treats as "untouched".
6. **One bad role entry no longer nulls the whole org document**
   (`src/lib/workspace/prefs-schema.ts`). `parseWorkspaceDefaults` now parses each work-role
   entry on its own and skips only the unusable ones, so a single malformed entry can no longer
   drag every other work role back to `full`. `T14` keeps its result (a document whose *only*
   entry is broken still resolves `full`/`default`) with a note on why; new `T14b` proves a good
   entry beside a broken one still applies, and a new `prefs-schema.test.ts` case proves the
   mixed document keeps its valid entries.
8. **Copy** (`workspace-defaults-card.tsx`): the card description now states that a viewer with
   no work role follows the Organiser row and a user with no work role is always Full — the R4
   lookup rule, which was previously only in this plan.
9. **`organisation_databases.offState` is `muted`** (`src/lib/workspace/modules.ts`), per the
   orchestrator's ruling at WP1.2's approval; `imports` and `administration` stay `hidden`. The
   §2.1 table, its surrounding prose, the §2.10 registry-test bullet and the §4 assumption are
   updated, as is the hidden-set assertion in `modules.test.ts` (now `imports, administration`,
   with 11 muted).

**Gates re-run (from `apps/organising-db`):**

- `pnpm exec eslint` on the eight touched files: 0 errors, 2 warnings — both pre-existing, in
  `administration/page.tsx` (the `fetchStatus` dep and the unused `getLatencyColor`, now at
  lines 2795/2801 after the insertions). Zero findings on changed lines.
- `pnpm test`: 769 passed (769) — the 766 baseline plus `T14b`, `T17` and the new
  `parseWorkspaceDefaults` mixed-document case.
- `pnpm exec tsc --noEmit -p tsconfig.json`: exit 0.
- `pnpm build`: "Compiled successfully in 111s", 126/126 static pages, exit 0.
- Whole-project `pnpm exec eslint .`: 294 problems (143 errors, 151 warnings) — unchanged from
  the develop baseline.

## 7. Verification output

Verifier run 2026-09-09 at d61cb8d; migration applied to dev dpnnmkhabysfdogllsyh via supabase db push.

### Step 1 — project-ref and migration validation

```
$ cat supabase/.temp/project-ref
dpnnmkhabysfdogllsyh

$ pnpm validate:migrations
> offshore-alliance-monorepo@ validate:migrations /Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance
> node scripts/validate-supabase-migrations.mjs

Validated 4 Supabase migrations with unique 14-digit versions.
```
Result: green.

### Step 2 — migration list (before push)

```
$ env -u SUPABASE_DB_PASSWORD npx --no-install supabase migration list
Initialising login role...
Connecting to remote database...

   Local          | Remote         | Time (UTC)
  ----------------|----------------|---------------------
   20260908050000 | 20260908050000 | 2026-09-08 05:00:00
   20260908050100 | 20260908050100 | 2026-09-08 05:01:00
   20260908050200 | 20260908050200 | 2026-09-08 05:02:00
   20260909100000 |                | 2026-09-09 10:00:00
```
Result: green — three baselines applied remote, `20260909100000` local-only, as expected.

### Step 3 — dry-run, push, migration list (after push)

```
$ env -u SUPABASE_DB_PASSWORD npx --no-install supabase db push --dry-run
Initialising login role...
DRY RUN: migrations will *not* be pushed to the database.
Connecting to remote database...
Would push these migrations:
 • 20260909100000_workspace_mode.sql
Finished supabase db push.
```

```
$ env -u SUPABASE_DB_PASSWORD npx --no-install supabase db push
Initialising login role...
Connecting to remote database...
Do you want to push these migrations to the remote database?
 • 20260909100000_workspace_mode.sql
Applying migration 20260909100000_workspace_mode.sql...
Finished supabase db push.
```

```
$ env -u SUPABASE_DB_PASSWORD npx --no-install supabase migration list
Initialising login role...
Connecting to remote database...

   Local          | Remote         | Time (UTC)
  ----------------|----------------|---------------------
   20260908050000 | 20260908050000 | 2026-09-08 05:00:00
   20260908050100 | 20260908050100 | 2026-09-08 05:01:00
   20260908050200 | 20260908050200 | 2026-09-08 05:02:00
   20260909100000 | 20260909100000 | 2026-09-09 10:00:00
```
Result: green — dry-run showed only the expected migration, push applied cleanly, `20260909100000` now applied on remote. `--include-all` and `migration repair` were not used. No password prompt occurred.

### Step 4 — schema/function/grants/RLS confirmation (dev, execute_sql)

`select column_name, data_type, column_default from information_schema.columns where table_name='user_profiles' and column_name='workspace_prefs';`
```json
[{"column_name":"workspace_prefs","data_type":"jsonb","column_default":"'{}'::jsonb"}]
```

`select proname, prosecdef from pg_proc where proname='get_workspace_defaults';`
```json
[{"proname":"get_workspace_defaults","prosecdef":true}]
```

`select grantee, privilege_type from information_schema.routine_privileges where routine_name='get_workspace_defaults';`
```json
[{"grantee":"postgres","privilege_type":"EXECUTE"},{"grantee":"authenticated","privilege_type":"EXECUTE"},{"grantee":"service_role","privilege_type":"EXECUTE"}]
```

`select relrowsecurity from pg_class where relname='app_settings';`
```json
[{"relrowsecurity":true}]
```
Result: green — `workspace_prefs` is `jsonb NOT NULL DEFAULT '{}'`, `get_workspace_defaults` is `SECURITY DEFINER`, grants are `postgres` (owner), `authenticated`, `service_role` — `anon` absent — and `app_settings` RLS remains enabled (`true`), unchanged.

### Step 5 — role coverage probe (dev, rolled-back transaction, e2e user uuid f7c048e2-ecfe-4e9c-8715-7f4c899f0d37)

```sql
BEGIN;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', 'f7c048e2-ecfe-4e9c-8715-7f4c899f0d37', 'role', 'authenticated')::text,
  true);
SET LOCAL ROLE authenticated;
SELECT public.get_workspace_defaults() AS defaults, (SELECT count(*) FROM public.app_settings) AS app_settings_count;
ROLLBACK;
```
```json
[{"defaults":{},"app_settings_count":0}]
```
Result: green — `get_workspace_defaults()` returns `{}` (nothing stored yet) and `app_settings` remains 0 rows visible to the `authenticated` role — the table itself stays closed. Note: the MCP `execute_sql` tool executes the statement block as one call and returns only the final SELECT's result set (multi-statement transactions with `SET LOCAL ROLE` cannot be run as separate round-tripped calls through this tool while preserving the transaction/role scope), so both checks were combined into a single `SELECT` to capture both values in one result row, per the task's fallback instruction. Transaction was rolled back; no data was modified.

### Step 6 — type regeneration

```
$ SUPABASE_PROJECT_REF=dpnnmkhabysfdogllsyh pnpm gen:types
> offshore-alliance-monorepo@ gen:types /Volumes/DataDrive/cursor_repos/offshoreAlliance/OffshoreAlliance
> supabase gen types typescript --project-id ${SUPABASE_PROJECT_REF:-gteygwfgjvczanmrwgbr} > packages/db-types/generated.ts
```

```
$ git diff --stat packages/db-types/generated.ts
 packages/db-types/generated.ts | 75 +++++++++++++++++++++++++-----------------
 1 file changed, 45 insertions(+), 30 deletions(-)
```

```
$ git diff packages/db-types/generated.ts | /usr/bin/grep -n 'workspace_prefs\|get_workspace_defaults' | head
87:+          workspace_prefs: Json
95:+          workspace_prefs?: Json
103:+          workspace_prefs?: Json
128:+      get_workspace_defaults: { Args: never; Returns: Json }
```
Result: green — both `workspace_prefs` (Row/Insert/Update) and `get_workspace_defaults` are present in the regenerated types. The diff also contains unrelated drift versus the previously committed file (removal of the `graphql_public` schema block, addition of the `_oux_hygiene_log` table, and a reordering of two FK-constraint entries on `user_profiles_organiser_id_fkey`) — this reflects the current state of dev at regeneration time, not anything introduced by this package. Committed alone as `d61cb8d chore(oux-wp1.1): regenerate database types from dev`.

### Step 7 — apps/organising-db gates (post regen)

```
$ pnpm exec tsc --noEmit -p tsconfig.json; echo tsc $?
tsc 0
```

```
$ pnpm test 2>&1 | /usr/bin/grep -E 'Test Files|Tests |FAIL'
 Test Files  59 passed (59)
      Tests  766 passed (766)
```

```
$ pnpm lint 2>&1 | tail -3
✖ 294 problems (143 errors, 151 warnings)
  7 errors and 16 warnings potentially fixable with the `--fix` option.
 ELIFECYCLE  Command failed with exit code 1.
```

```
$ pnpm build 2>&1 | tail -6
✓ Compiled successfully in 109s
... (full page/route listing omitted for brevity, no errors)
ƒ Proxy (Middleware)
ƒ  (Dynamic)  server-rendered on demand
EXIT 0
```
Result: green across all four — tsc clean, 766/766 tests pass, lint holds at the recorded baseline (294 problems, 143 errors, 151 warnings — no rise), build compiles successfully with exit 0.

### Step 8 — final git state

```
$ git status --short
 M supabase/.temp/cli-latest
 M supabase/.temp/gotrue-version
 M supabase/.temp/pooler-url
 M supabase/.temp/postgres-version
 M supabase/.temp/project-ref
 M supabase/.temp/rest-version
 M supabase/.temp/storage-migration
 M supabase/.temp/storage-version
```
Result: green — only `supabase/.temp/*` CLI link files modified (left unstaged/uncommitted per instructions); no source changes outside the two verifier commits.

```
$ git log --oneline develop..HEAD
d61cb8d chore(oux-wp1.1): regenerate database types from dev
75308cc feat(oux-wp1.1): implementer notes and deviations in wp1.1.md
11c1e83 feat(oux-wp1.1): admin workspace editors in Users and Settings
99e852f feat(oux-wp1.1): admin workspace-defaults route and update-user allow-list
e2ca3e0 feat(oux-wp1.1): useWorkspace() hook, WorkspaceProvider and org-defaults query
57f9da8 feat(oux-wp1.1): workspace_prefs column, get_workspace_defaults() reader, UserProfile type
e5997f9 feat(oux-wp1.1): module registry, prefs schemas and pure workspace resolver
61a8370 docs(oux): WP1.1 plan, approved
1c997d6 docs(oux): record operator's dev run of the WP0.4 scripts
f82bfac docs(oux): phase-0 exit confirmed, SMS test arrangement, WP1.1 planning
```

### Not run / blocked

- The §2.9 "Secondary check — through the app on the branch preview" (login via Vercel Preview, confirm `POST /rest/v1/rpc/get_workspace_defaults` returns 200 in the network panel) was not run by this verifier: it requires a browser session against a deployed preview and an admin having first saved a non-empty `workspace_defaults` document via Administration → Settings, neither of which is available in this non-interactive verification pass. The instruction "Never start the app" also rules out a local substitute.
- The §2.12 R5 check (invite a throwaway user on dev, confirm the new row has `workspace_prefs = '{}'`) was not run: it was not listed in the numbered verifier steps 1–8 given for this pass, and inviting a real auth user is a side-effecting action beyond the SQL-probe/type-regen/build scope defined here. Flagging for the reviewer or a follow-up verification pass.
- No SUPABASE_DB_PASSWORD prompt occurred at any CLI step, so no step was aborted for that reason.

### Verifier run 2 (orchestrator, after fix round 1) at 35a6761
```
$ pnpm test
 Test Files  59 passed (59)
      Tests  769 passed (769)
$ pnpm exec tsc --noEmit -p tsconfig.json; echo tsc $?
tsc 0
$ pnpm lint | tail -1
✖ 294 problems (143 errors, 151 warnings)
$ git log --oneline --stat ad67b6c..HEAD -- supabase/.temp (expect empty)
$ git diff --stat ad67b6c..HEAD | tail -1
 9 files changed, 277 insertions(+), 34 deletions(-)
```

## 8. Reviewer findings

_(reviewer)_
