# Employer Connection Wizard — Agent Task

> **Instructions for the agent reading this file:**
> Read this entire document before writing a single line of code.
> It contains everything you need: codebase context, data model, fuzzy matching
> algorithm, AI integration spec, API route specs, UI spec, and implementation order.
> Follow the implementation order exactly. Run `npx tsc --noEmit` and check lints
> after each significant file. Do not stop until all steps are complete.

---

## 1. What you are building

An **Employer Connection Wizard** — an admin-only, multi-step tool added as a new
tab on the existing Administration page (`/administration`). It:

1. Loads all employers and worksites from the database.
2. Runs a client-side fuzzy matching algorithm to detect:
   - Employer corporate families (parent company groups)
   - Appropriate `employer_category` for each employer
   - Which Principal Employer (Shell / Woodside / Inpex / Chevron) each worksite belongs to
3. Optionally sends data to Anthropic Claude for AI-powered analysis (if
   `ANTHROPIC_API_KEY` is configured).
4. Presents a multi-step review UI so an admin can accept, adjust, or reject each
   individual proposal before anything is written.
5. Applies all accepted changes to the database in a single batch operation via
   a server-side API route using the Supabase service role key.

---

## 2. Codebase context

### Tech stack

| Concern | Library |
|---|---|
| Framework | Next.js 16 App Router + React 19 |
| Database | Supabase (PostgreSQL) via `@supabase/supabase-js` v2 |
| UI primitives | Radix UI wrappers in `src/components/ui/` |
| Styling | Tailwind CSS v4 |
| Icons | `lucide-react` |
| Data fetching | `@tanstack/react-query` v5 |
| Auth | Supabase Auth; roles: `admin` | `user` | `viewer` |

### Key existing files — read these before writing new files

| File | Purpose |
|---|---|
| `src/types/database.ts` | All TypeScript interfaces and types |
| `src/lib/supabase/client.ts` | Browser Supabase client factory |
| `src/lib/supabase/admin.ts` | Service role admin client (server-side only) |
| `src/lib/supabase/auth-context.tsx` | `useAuth()` hook: `{ user, profile, isAdmin, canWrite }` |
| `src/app/(dashboard)/administration/page.tsx` | Admin page — add the new wizard tab here |
| `src/components/ui/` | Badge, Button, Card, Dialog, Input, Label, Select, Tabs, Textarea, Separator |
| `src/components/data-tables/data-table.tsx` | Generic `DataTable<T>` with search/sort |
| `src/components/ui/eureka-loading.tsx` | `<EurekaLoadingSpinner size="sm"|"md"|"lg" />` |
| `src/app/api/admin/` | Pattern for admin API routes (check auth, use admin client) |

### Existing administration page tabs (do not remove any)

```
Users | Member Roles | Sectors | Settings | Import History
```

Add a new tab: **Employer Wizard** — rendered only when `isAdmin`.

### Badge variants in use across the app

```typescript
// These are all valid — use them for confidence and category display
"success"     // green  — HIGH confidence, Active, Current
"warning"     // amber  — MEDIUM confidence, Under Negotiation, expiring soon
"destructive" // red    — LOW confidence, Expired, Inactive
"secondary"   // grey   — no confidence / neutral
"info"        // blue   — informational
"outline"     // outline only
```

---

## 3. Database schema (relevant tables only)

```sql
-- employers (new fields added in migration 00006)
CREATE TABLE employers (
  employer_id        SERIAL PRIMARY KEY,
  employer_name      VARCHAR(200) NOT NULL,
  trading_name       VARCHAR(100),
  abn                VARCHAR(20),
  employer_category  VARCHAR(30) CHECK (employer_category IN (
                       'Producer','Major_Contractor','Subcontractor',
                       'Labour_Hire','Specialist','Principal_Employer')),
  parent_company     VARCHAR(200),          -- legacy text field, keep it
  parent_employer_id INT REFERENCES employers(employer_id),  -- new FK
  is_active          BOOLEAN NOT NULL DEFAULT true
);

-- worksites (new field added in migration 00006)
CREATE TABLE worksites (
  worksite_id            SERIAL PRIMARY KEY,
  worksite_name          VARCHAR(100) NOT NULL,
  worksite_type          VARCHAR(30) NOT NULL,
  operator_id            INT REFERENCES employers(employer_id),
  principal_employer_id  INT REFERENCES employers(employer_id),  -- new FK
  basin                  VARCHAR(100),
  is_offshore            BOOLEAN
);

-- agreements
CREATE TABLE agreements (
  agreement_id  SERIAL PRIMARY KEY,
  employer_id   INT REFERENCES employers(employer_id),
  status        VARCHAR(20) NOT NULL CHECK (status IN (
                  'Current','Expired','Under_Negotiation','Terminated')),
  expiry_date   DATE
);

-- agreement_employers (junction: additional employers on an agreement)
CREATE TABLE agreement_employers (
  agreement_id INT REFERENCES agreements(agreement_id),
  employer_id  INT REFERENCES employers(employer_id),
  is_primary   BOOLEAN DEFAULT false
);

-- employer_worksite_roles (junction: who works at which worksite)
CREATE TABLE employer_worksite_roles (
  employer_id INT REFERENCES employers(employer_id),
  worksite_id INT REFERENCES worksites(worksite_id),
  role_type   VARCHAR(30),   -- Owner|Operator|Principal_Contractor|Subcontractor|...
  is_current  BOOLEAN NOT NULL DEFAULT true
);
```

### Seeded Principal Employers (already in DB from migration 00006)

Shell, Woodside, Inpex, Chevron — `employer_category = 'Principal_Employer'`

---

## 4. TypeScript types to add / reference

The `Employer` and `Worksite` interfaces in `src/types/database.ts` already include
`parent_employer_id` and `principal_employer_id` (added in a prior session).

Add these new types to `src/types/database.ts` for the wizard's internal state:

```typescript
// Confidence level for wizard proposals
export type WizardConfidence = "high" | "medium" | "low";

// A detected employer corporate family
export interface EmployerGroupProposal {
  proposedParentName: string;
  /** null = use an existing employer as parent; string = create new employer record */
  existingParentId: number | null;
  isNewParent: boolean;
  memberEmployerIds: number[];
  confidence: WizardConfidence;
  source: "fuzzy" | "ai" | "merged";
  accepted: boolean;
}

// A proposed employer_category change
export interface CategoryProposal {
  employerId: number;
  employerName: string;
  currentCategory: string | null;
  proposedCategory: string;
  confidence: WizardConfidence;
  reasoning: string;
  source: "fuzzy" | "ai" | "merged";
  accepted: boolean;
}

// A proposed worksite → principal employer link
export interface WorksitePeProposal {
  worksiteId: number;
  worksiteName: string;
  worksiteType: string;
  currentPrincipalEmployerId: number | null;
  currentPrincipalEmployerName: string | null;
  proposedPrincipalEmployerId: number;
  proposedPrincipalEmployerName: string;
  confidence: WizardConfidence;
  reasoning: string;
  source: "fuzzy" | "ai" | "merged";
  accepted: boolean;
}

export interface WizardProposals {
  employerGroups: EmployerGroupProposal[];
  categoryAssignments: CategoryProposal[];
  worksitePeAssignments: WorksitePeProposal[];
}
```

---

## 5. Fuzzy matching algorithm (implement in pure TypeScript, no extra deps)

Place this logic in `src/lib/utils/employer-fuzzy.ts`.

### 5.1 — Name normalisation

```typescript
// Strip legal suffixes and normalise whitespace
function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pty\.?\s*ltd\.?|ltd\.?|pty\.?|inc\.?|corp\.?|llc\.?|llp\.?)\b/gi, "")
    .replace(/\b(australia|australian|aus|international|intl|services|service|group|holdings|solutions)\b/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Extract the first 1-2 significant words as root tokens
function rootTokens(normalised: string): string[] {
  const stopWords = new Set(["the", "and", "of", "for", "in", "at", "by"]);
  return normalised.split(" ")
    .filter(w => w.length >= 2 && !stopWords.has(w))
    .slice(0, 2);
}
```

### 5.2 — Employer grouping

```typescript
export function detectEmployerGroups(employers: Employer[]): EmployerGroupProposal[] {
  // Skip Principal Employers (already categorised)
  const candidates = employers.filter(e => e.employer_category !== "Principal_Employer");

  // Build map: normalised root → [employer]
  const groups = new Map<string, Employer[]>();
  for (const emp of candidates) {
    const tokens = rootTokens(normaliseName(emp.employer_name));
    if (tokens.length === 0) continue;
    const key = tokens[0]; // primary root token
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(emp);
  }

  const proposals: EmployerGroupProposal[] = [];
  for (const [, members] of groups) {
    if (members.length < 2) continue; // singleton — not a group

    // Proposed parent name = shortest member name (most likely the "clean" entity)
    const sorted = [...members].sort((a, b) => a.employer_name.length - b.employer_name.length);
    const proposedParentName = sorted[0].employer_name;

    // Check if any member has no legal suffix (likely already the clean parent name)
    const cleanParent = members.find(e =>
      normaliseName(e.employer_name).split(" ").length <= 2 &&
      e.employer_name === e.employer_name.trim()
    );

    proposals.push({
      proposedParentName: cleanParent?.employer_name ?? proposedParentName,
      existingParentId: cleanParent?.employer_id ?? null,
      isNewParent: !cleanParent,
      memberEmployerIds: members
        .filter(e => e.employer_id !== cleanParent?.employer_id)
        .map(e => e.employer_id),
      confidence: members.length >= 3 ? "high" : "medium",
      source: "fuzzy",
      accepted: false,
    });
  }

  return proposals;
}
```

### 5.3 — Category assignment rules

```typescript
const CATEGORY_RULES: { patterns: RegExp[]; category: string }[] = [
  // Labour hire
  { patterns: [/labour\s*hire/i, /workforce/i, /staffing/i, /recruitment/i, /manpower/i], category: "Labour_Hire" },
  // Known producers
  { patterns: [/origin\s*energy/i, /santos/i, /beach\s*energy/i, /buru/i, /karoon/i], category: "Producer" },
  // Major contractors — catering / camp management
  { patterns: [/\bess\b/i, /sodexo/i, /compass/i, /eurest/i, /spotless/i, /broadspectrum/i, /downer/i], category: "Major_Contractor" },
  // Major contractors — subsea / marine / construction
  { patterns: [/subsea\s*7/i, /technip/i, /mcdermott/i, /sapura/i, /allseas/i, /fugro/i, /petrofac/i, /worley/i, /clough/i], category: "Major_Contractor" },
  // Drilling
  { patterns: [/transocean/i, /ensco/i, /rowan/i, /valaris/i, /seadrill/i, /noble\s*corp/i, /odfjell/i, /borr\s*drilling/i], category: "Major_Contractor" },
  // Specialist / inspection
  { patterns: [/bureau\s*veritas/i, /lloyd/i, /rina/i, /applus/i, /mistras/i], category: "Specialist" },
  // Subcontractors — generic maintenance, scaffolding, painting etc
  { patterns: [/scaffolding/i, /painting/i, /insulation/i, /electrical/i, /instrumentation/i], category: "Subcontractor" },
];

export function proposeCategories(employers: Employer[]): CategoryProposal[] {
  return employers
    .filter(e => e.employer_category !== "Principal_Employer")
    .map(emp => {
      for (const rule of CATEGORY_RULES) {
        if (rule.patterns.some(p => p.test(emp.employer_name) || p.test(emp.trading_name ?? ""))) {
          return {
            employerId: emp.employer_id,
            employerName: emp.employer_name,
            currentCategory: emp.employer_category,
            proposedCategory: rule.category,
            confidence: "high",
            reasoning: `Name matches known ${rule.category} pattern`,
            source: "fuzzy" as const,
            accepted: false,
          };
        }
      }
      // If already categorised, skip (return null filtered below)
      if (emp.employer_category) return null;
      return {
        employerId: emp.employer_id,
        employerName: emp.employer_name,
        currentCategory: null,
        proposedCategory: "Subcontractor", // default if no signal
        confidence: "low",
        reasoning: "No keyword match; defaulting to Subcontractor",
        source: "fuzzy" as const,
        accepted: false,
      };
    })
    .filter((x): x is CategoryProposal => x !== null)
    // Only include rows where proposal differs from current or current is null
    .filter(p => p.currentCategory !== p.proposedCategory);
}
```

### 5.4 — Worksite → Principal Employer assignment

```typescript
// Key: keyword regex → principal employer name
const PE_WORKSITE_SIGNALS: { pattern: RegExp; peName: string }[] = [
  // Chevron
  { pattern: /gorgon|wheatstone|barrow\s*island|jansz/i,   peName: "Chevron" },
  // Woodside
  { pattern: /pluto|north\s*west\s*shelf|nws|nganhurra|vincent|stybarrow|enfield|pyrenees|macedon|browse\s*fpso/i, peName: "Woodside" },
  // Inpex
  { pattern: /ichthys|inpex|prelude\s*flng|darwin\s*lng/i, peName: "Inpex" },
  // Shell
  { pattern: /prelude|\bshell\b/i,                         peName: "Shell" },
];

export function proposeWorksitePeAssignments(
  worksites: Worksite[],
  principalEmployers: Employer[],
  operatorMap: Map<number, Employer>  // operator_id → employer
): WorksitePeProposal[] {
  const proposals: WorksitePeProposal[] = [];

  for (const ws of worksites) {
    // Already assigned and no new signal — skip
    const signals: { peName: string; source: string }[] = [];

    // Signal 1: operator is a Principal Employer
    if (ws.operator_id) {
      const op = operatorMap.get(ws.operator_id);
      if (op?.employer_category === "Principal_Employer") {
        signals.push({ peName: op.employer_name, source: "operator" });
      }
    }

    // Signal 2: worksite name keyword match
    for (const rule of PE_WORKSITE_SIGNALS) {
      if (rule.pattern.test(ws.worksite_name)) {
        signals.push({ peName: rule.peName, source: "name_match" });
        break;
      }
    }

    if (signals.length === 0) continue;

    // Resolve PE — prefer operator signal (most authoritative)
    const peName = signals[0].peName;
    const pe = principalEmployers.find(p => p.employer_name === peName);
    if (!pe) continue;

    // Only propose if it differs from current
    if (ws.principal_employer_id === pe.employer_id) continue;

    proposals.push({
      worksiteId: ws.worksite_id,
      worksiteName: ws.worksite_name,
      worksiteType: ws.worksite_type,
      currentPrincipalEmployerId: ws.principal_employer_id,
      currentPrincipalEmployerName:
        ws.principal_employer_id
          ? principalEmployers.find(p => p.employer_id === ws.principal_employer_id)?.employer_name ?? null
          : null,
      proposedPrincipalEmployerId: pe.employer_id,
      proposedPrincipalEmployerName: pe.employer_name,
      confidence: signals.length >= 2 ? "high" : signals[0].source === "operator" ? "high" : "medium",
      reasoning: signals.map(s => s.source).join(" + "),
      source: "fuzzy",
      accepted: false,
    });
  }

  return proposals;
}
```

---

## 6. AI integration (Anthropic Claude — optional)

### 6.1 — Install SDK and configure env

```bash
npm install @anthropic-ai/sdk
```

Add to `.env.local`:

```
# Optional: Anthropic Claude API key for AI-powered employer analysis.
# Leave empty to use fuzzy matching only.
ANTHROPIC_API_KEY=
```

### 6.2 — API route: `src/app/api/employer-wizard/analyse/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  // Auth check — admin only
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("user_profiles").select("role").eq("user_id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 400 });
  }

  const body = await req.json();
  const { employers, worksites, principalEmployers } = body;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are a data analyst for the Offshore Alliance, an Australian maritime union.
You are given a list of employers and worksites operating in the Australian offshore oil and gas industry.

Your tasks:
1. Identify employer corporate families — groups of entities belonging to the same parent company
   (e.g. 'ESS Catering Pty Ltd' and 'ESS Aviation Pty Ltd' should group under parent 'ESS').
   Do NOT group Shell, Woodside, Inpex, or Chevron entities — they are already Principal Employers.
2. Suggest the appropriate employer_category for each employer:
   Producer | Major_Contractor | Subcontractor | Labour_Hire | Specialist
   Do NOT suggest Principal_Employer — that is reserved for Shell/Woodside/Inpex/Chevron.
3. Suggest which Principal Employer (Shell, Woodside, Inpex, or Chevron) each worksite belongs to.
   Use worksite name, type, basin, and offshore context as signals.

Return ONLY a valid JSON object — no markdown, no commentary, no trailing text. Schema:
{
  "employer_groups": [
    { "proposed_parent_name": "string", "member_employer_ids": [number], "confidence": "high"|"medium"|"low" }
  ],
  "category_assignments": [
    { "employer_id": number, "proposed_category": "string", "confidence": "high"|"medium"|"low", "reasoning": "string" }
  ],
  "worksite_pe_assignments": [
    { "worksite_id": number, "principal_employer_id": number, "confidence": "high"|"medium"|"low", "reasoning": "string" }
  ]
}`;

  const userContent = `Principal Employers (IDs for reference):
${JSON.stringify(principalEmployers, null, 2)}

Employers to analyse:
${JSON.stringify(employers, null, 2)}

Worksites to analyse:
${JSON.stringify(worksites, null, 2)}`;

  try {
    const message = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const parsed = JSON.parse(text);
    return NextResponse.json({ success: true, proposals: parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

### 6.3 — Merging AI and fuzzy results

After getting AI results, merge them with fuzzy results:

```typescript
function mergeProposals(
  fuzzy: WizardProposals,
  ai: {
    employer_groups: { proposed_parent_name: string; member_employer_ids: number[]; confidence: string }[];
    category_assignments: { employer_id: number; proposed_category: string; confidence: string; reasoning: string }[];
    worksite_pe_assignments: { worksite_id: number; principal_employer_id: number; confidence: string; reasoning: string }[];
  } | null,
  principalEmployers: Pick<Employer, "employer_id" | "employer_name">[]
): WizardProposals {
  if (!ai) return fuzzy;

  // Category: AI wins if AI confidence is high or medium
  const categoryMap = new Map(fuzzy.categoryAssignments.map(c => [c.employerId, c]));
  for (const aiCat of ai.category_assignments) {
    if (aiCat.confidence === "high" || aiCat.confidence === "medium") {
      const existing = categoryMap.get(aiCat.employer_id);
      categoryMap.set(aiCat.employer_id, {
        ...(existing ?? { employerId: aiCat.employer_id, employerName: "", currentCategory: null }),
        proposedCategory: aiCat.proposed_category,
        confidence: aiCat.confidence as WizardConfidence,
        reasoning: aiCat.reasoning,
        source: "ai",
        accepted: false,
      });
    }
  }

  // Groups: merge (AI groups take precedence, add fuzzy-only groups)
  const aiGroupIds = new Set(ai.employer_groups.flatMap(g => g.member_employer_ids));
  const fuzzyGroupsNotInAi = fuzzy.employerGroups.filter(
    fg => !fg.memberEmployerIds.some(id => aiGroupIds.has(id))
  );
  const aiGroups: EmployerGroupProposal[] = ai.employer_groups.map(g => ({
    proposedParentName: g.proposed_parent_name,
    existingParentId: null,
    isNewParent: true,
    memberEmployerIds: g.member_employer_ids,
    confidence: g.confidence as WizardConfidence,
    source: "ai",
    accepted: false,
  }));

  // Worksite PE: AI wins if confident
  const wsMap = new Map(fuzzy.worksitePeAssignments.map(w => [w.worksiteId, w]));
  for (const aiWs of ai.worksite_pe_assignments) {
    if (aiWs.confidence === "high" || aiWs.confidence === "medium") {
      const pe = principalEmployers.find(p => p.employer_id === aiWs.principal_employer_id);
      if (!pe) continue;
      const existing = wsMap.get(aiWs.worksite_id);
      if (existing) {
        wsMap.set(aiWs.worksite_id, {
          ...existing,
          proposedPrincipalEmployerId: aiWs.principal_employer_id,
          proposedPrincipalEmployerName: pe.employer_name,
          confidence: aiWs.confidence as WizardConfidence,
          reasoning: aiWs.reasoning,
          source: "ai",
        });
      }
    }
  }

  return {
    employerGroups: [...aiGroups, ...fuzzyGroupsNotInAi],
    categoryAssignments: Array.from(categoryMap.values()),
    worksitePeAssignments: Array.from(wsMap.values()),
  };
}
```

---

## 7. Apply API route: `src/app/api/employer-wizard/apply/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface ApplyPayload {
  employer_updates: {
    employer_id: number;
    parent_employer_id: number | null;
    employer_category: string | null;
  }[];
  new_parent_companies: {
    employer_name: string;
    is_active: boolean;
  }[];
  worksite_updates: {
    worksite_id: number;
    principal_employer_id: number;
  }[];
}

export async function POST(req: NextRequest) {
  // Auth check — admin only
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase
    .from("user_profiles").select("role").eq("user_id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const adminClient = createAdminClient();
  const payload: ApplyPayload = await req.json();
  const errors: string[] = [];
  let parentsCreated = 0;
  let employersUpdated = 0;
  let worksitesUpdated = 0;

  // Step 1: Create new parent company employer records
  const newParentIdMap = new Map<string, number>(); // name → new employer_id
  for (const parent of payload.new_parent_companies) {
    const { data, error } = await adminClient
      .from("employers")
      .insert({ employer_name: parent.employer_name, is_active: parent.is_active })
      .select("employer_id")
      .single();
    if (error) { errors.push(`Create parent ${parent.employer_name}: ${error.message}`); continue; }
    newParentIdMap.set(parent.employer_name, data.employer_id);
    parentsCreated++;
  }

  // Step 2: Apply employer updates
  for (const update of payload.employer_updates) {
    const patch: Record<string, unknown> = {};
    if (update.employer_category) patch.employer_category = update.employer_category;
    if (update.parent_employer_id !== undefined) patch.parent_employer_id = update.parent_employer_id;
    if (Object.keys(patch).length === 0) continue;

    const { error } = await adminClient
      .from("employers")
      .update(patch)
      .eq("employer_id", update.employer_id);
    if (error) { errors.push(`Update employer ${update.employer_id}: ${error.message}`); continue; }
    employersUpdated++;
  }

  // Step 3: Apply worksite updates
  for (const update of payload.worksite_updates) {
    const { error } = await adminClient
      .from("worksites")
      .update({ principal_employer_id: update.principal_employer_id })
      .eq("worksite_id", update.worksite_id);
    if (error) { errors.push(`Update worksite ${update.worksite_id}: ${error.message}`); continue; }
    worksitesUpdated++;
  }

  return NextResponse.json({
    success: errors.length === 0,
    parents_created: parentsCreated,
    employers_updated: employersUpdated,
    worksites_updated: worksitesUpdated,
    errors,
  });
}
```

---

## 8. Wizard component: `src/components/administration/employer-wizard.tsx`

### 8.1 — State machine and data loading

```typescript
"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import type {
  Employer, Worksite, WizardProposals, EmployerGroupProposal,
  CategoryProposal, WorksitePeProposal, WizardConfidence,
} from "@/types/database";
import {
  detectEmployerGroups, proposeCategories, proposeWorksitePeAssignments
} from "@/lib/utils/employer-fuzzy";

type WizardStep =
  | "idle"
  | "loading"
  | "review_groups"
  | "review_categories"
  | "review_worksites"
  | "confirm"
  | "applying"
  | "done";
```

### 8.2 — Data fetch pattern

```typescript
const supabase = createClient();

const { data: employers = [] } = useQuery({
  queryKey: ["wizard-employers"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("employers")
      .select("employer_id, employer_name, trading_name, employer_category, parent_employer_id, abn, is_active")
      .order("employer_name");
    if (error) throw error;
    return data as Employer[];
  },
});

const { data: worksites = [] } = useQuery({
  queryKey: ["wizard-worksites"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("worksites")
      .select("worksite_id, worksite_name, worksite_type, operator_id, principal_employer_id, basin, is_offshore")
      .order("worksite_name");
    if (error) throw error;
    return data as Worksite[];
  },
});

const principalEmployers = useMemo(
  () => employers.filter(e => e.employer_category === "Principal_Employer"),
  [employers]
);
```

### 8.3 — Run analysis

```typescript
const runAnalysis = async () => {
  setStep("loading");
  setError(null);

  // Run fuzzy analysis
  const operatorMap = new Map(employers.map(e => [e.employer_id, e]));
  const fuzzyGroups = detectEmployerGroups(employers);
  const fuzzyCategories = proposeCategories(employers);
  const fuzzyWorksites = proposeWorksitePeAssignments(worksites, principalEmployers, operatorMap);

  let merged: WizardProposals = {
    employerGroups: fuzzyGroups,
    categoryAssignments: fuzzyCategories,
    worksitePeAssignments: fuzzyWorksites,
  };

  // Try AI analysis
  try {
    const res = await fetch("/api/employer-wizard/analyse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employers: employers.map(e => ({
          id: e.employer_id,
          name: e.employer_name,
          trading_name: e.trading_name,
          current_category: e.employer_category,
        })),
        worksites: worksites.map(w => {
          const op = operatorMap.get(w.operator_id ?? 0);
          return {
            id: w.worksite_id,
            name: w.worksite_name,
            type: w.worksite_type,
            operator_name: op?.employer_name ?? null,
            basin: w.basin,
            is_offshore: w.is_offshore,
          };
        }),
        principalEmployers: principalEmployers.map(p => ({ id: p.employer_id, name: p.employer_name })),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.proposals) {
        merged = mergeProposals(merged, data.proposals, principalEmployers);
        setAiUsed(true);
      }
    }
    // If AI fails (e.g. no key), silently use fuzzy-only
  } catch {
    // fuzzy-only — already set
  }

  setProposals(merged);
  setStep("review_groups");
};
```

### 8.4 — Step UI structure

The wizard renders a vertical step indicator at the top and the current step's
content below. Use Tailwind for the step indicator — do NOT add a new dependency.

```
[Step 1: Analyse] → [Step 2: Parent Groups] → [Step 3: Categories] → [Step 4: Worksites] → [Step 5: Apply]
```

**Step indicator:** 5 numbered circles connected by lines. Active = filled, completed =
filled with a checkmark, pending = outline.

**Step 1 — idle/loading:**
- Show a description of what the wizard will do
- "Use AI Analysis" checkbox (disabled if no API key is configured; detect by
  attempting a quick HEAD to the analyse route or just always show it and let it
  fail silently)
- "Run Analysis" button → triggers `runAnalysis()`
- While loading: show spinner + "Analysing [X] employers and [Y] worksites..."

**Step 2 — review_groups:**
- Heading: "Detected Corporate Groups"
- Summary badge: "X groups detected (Y employers)"
- If AI was used, show a "Powered by AI analysis" badge
- For each `EmployerGroupProposal`:
  - Card with:
    - Left: group name (editable Input), confidence Badge
    - Right: list of member employer names with remove (×) buttons
    - Footer: "Accept this group" toggle / skip button
    - Option: "Mark as new parent company" vs "Use existing employer as parent" (Select)
  - Skipped groups shown collapsed at the bottom
- "Select all high-confidence" button
- "Next →" button (disabled if any unreviewed groups remain? Or allow skipping)

**Step 3 — review_categories:**
- Heading: "Category Assignments"
- Table columns: Employer | Current | Proposed | Confidence | Override | Accept
- Confidence badge: success=high, warning=medium, destructive=low
- Override column: Select dropdown with all valid categories
- "Accept all high-confidence" button → sets accepted=true for all HIGH rows
- "Next →" button

**Step 4 — review_worksites:**
- Heading: "Worksite → Principal Employer"
- Table columns: Worksite | Type | Current PE | Proposed PE | Confidence | Override | Accept
- Override: Select dropdown showing only Principal Employers
- "Accept all high-confidence" button
- "Next →" button

**Step 5 — confirm/apply:**
- Summary section:
  - X new parent companies to create
  - Y employer categories to update
  - Z parent company links to apply
  - W worksite assignments to apply
- "Apply All Accepted Changes" button → POST to `/api/employer-wizard/apply`
- While applying: spinner + "Applying changes..."
- On success: green summary card, "Refresh data" button, option to run wizard again

### 8.5 — Apply function

```typescript
const applyChanges = async () => {
  setStep("applying");

  // Build employer_updates from accepted group proposals (parent links)
  const parentLinks: Map<number, number | null> = new Map();
  for (const group of proposals.employerGroups.filter(g => g.accepted)) {
    const parentId = group.isNewParent ? null : group.existingParentId; // null = will use created ID
    for (const empId of group.memberEmployerIds) {
      parentLinks.set(empId, parentId);
    }
  }

  const employer_updates = [
    // Category changes
    ...proposals.categoryAssignments
      .filter(c => c.accepted)
      .map(c => ({
        employer_id: c.employerId,
        employer_category: c.proposedCategory,
        parent_employer_id: parentLinks.get(c.employerId) ?? undefined,
      })),
    // Parent links for employers not in category list
    ...[...parentLinks.entries()]
      .filter(([empId]) => !proposals.categoryAssignments.find(c => c.employerId === empId && c.accepted))
      .map(([empId, parentId]) => ({
        employer_id: empId,
        employer_category: null,
        parent_employer_id: parentId,
      })),
  ];

  const new_parent_companies = proposals.employerGroups
    .filter(g => g.accepted && g.isNewParent)
    .map(g => ({ employer_name: g.proposedParentName, is_active: true }));

  const worksite_updates = proposals.worksitePeAssignments
    .filter(w => w.accepted)
    .map(w => ({ worksite_id: w.worksiteId, principal_employer_id: w.proposedPrincipalEmployerId }));

  const res = await fetch("/api/employer-wizard/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ employer_updates, new_parent_companies, worksite_updates }),
  });

  const result = await res.json();
  setApplyResult(result);
  setStep("done");

  // Invalidate cached data so the rest of the app reflects changes
  queryClient.invalidateQueries({ queryKey: ["employers"] });
  queryClient.invalidateQueries({ queryKey: ["worksites"] });
  queryClient.invalidateQueries({ queryKey: ["principal-employer-eba-summary"] });
};
```

---

## 9. Administration page integration

In `src/app/(dashboard)/administration/page.tsx`:

1. Add a new import at the top:
   ```typescript
   import { EmployerWizard } from "@/components/administration/employer-wizard";
   ```

2. Add a new `TabsTrigger` (admin-only, so wrap in `{isAdmin && ...}`):
   ```tsx
   {isAdmin && (
     <TabsTrigger value="employer_wizard">Employer Wizard</TabsTrigger>
   )}
   ```

3. Add the corresponding `TabsContent`:
   ```tsx
   {isAdmin && (
     <TabsContent value="employer_wizard">
       <EmployerWizard />
     </TabsContent>
   )}
   ```

---

## 10. Utility file location

Create `src/lib/utils/employer-fuzzy.ts` with the exported functions:

```typescript
export { detectEmployerGroups } from "./employer-fuzzy";
export { proposeCategories } from "./employer-fuzzy";
export { proposeWorksitePeAssignments } from "./employer-fuzzy";
```

The `mergeProposals` function lives in
`src/components/administration/employer-wizard.tsx` (co-located with usage, since
it depends on the WizardProposals type and is not reused elsewhere).

---

## 11. Implementation order

Execute in this exact order. After each step, check for TypeScript errors with
`npx tsc --noEmit` before proceeding.

```
1.  npm install @anthropic-ai/sdk
2.  Add ANTHROPIC_API_KEY='' to .env.local (above the other keys, with comment)
3.  Add WizardConfidence, EmployerGroupProposal, CategoryProposal,
    WorksitePeProposal, WizardProposals types to src/types/database.ts
4.  Create src/lib/utils/employer-fuzzy.ts with all fuzzy functions
5.  Create src/app/api/employer-wizard/analyse/route.ts
6.  Create src/app/api/employer-wizard/apply/route.ts
7.  Create src/components/administration/employer-wizard.tsx
8.  Edit src/app/(dashboard)/administration/page.tsx — add tab + import
9.  npx tsc --noEmit — fix any type errors
10. Check lints with ReadLints tool on all edited files
```

---

## 12. UI style reference

Copy these import and usage patterns exactly — do not deviate from the codebase's
established component conventions.

```typescript
// Standard imports for a client component in this codebase
import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import type { Employer, Worksite } from "@/types/database";

// Error display
<p className="text-sm text-destructive">{errorMessage}</p>

// Loading
<EurekaLoadingSpinner size="lg" />

// Confidence badge
const confidenceBadge = (c: WizardConfidence) => ({
  high:   <Badge variant="success">High</Badge>,
  medium: <Badge variant="warning">Medium</Badge>,
  low:    <Badge variant="destructive">Low</Badge>,
}[c]);
```

---

## 13. Edge cases and notes

- **Circular parent references:** An employer cannot be its own parent. Add a guard
  that filters out the employer itself from the parent select dropdown.
- **Principal Employers as parents:** Shell/Woodside/Inpex/Chevron should NOT be
  proposed as `parent_employer_id` targets — they have a different relationship
  (via `worksite.principal_employer_id`). Filter them out of parent company selects.
- **Already-linked employers:** If `parent_employer_id` is already set, still show
  the proposal but mark as "already linked" and skip in the default view (add
  a "Show already-linked" toggle).
- **Large datasets:** The Supabase query is paginated at 1000 rows by default. Add
  `.limit(1000)` and note that the wizard may need pagination for very large tenants.
- **AI token limits:** If the employer list is very large (>200), batch the AI call
  into chunks of 100 employers and merge results.
- **No proposals found:** If fuzzy matching finds no groups and no category changes,
  show a "No proposals found — your data is already well-structured" message instead
  of advancing through empty steps.

---

*End of agent task specification.*
