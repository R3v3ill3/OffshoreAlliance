/**
 * Seed script: large onshore brownfields worksite with test data.
 *
 * Creates a Gas Plant worksite with 1 producer and 3 contractor employers,
 * each with a workforce of 40-150 workers across site-appropriate occupations.
 * ~50% of workers are union members (financial_member). All emails use the
 * RFC 2606 reserved domain @testdata.example.com so they are guaranteed
 * non-deliverable.
 *
 * Usage:  npx tsx scripts/seed-test-onshore-worksite.ts
 *
 * Prerequisites:
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   - Migrations applied (including 0012 work_scopes, occupation seeds, union_membership_types)
 *
 * Safe to re-run: uses ON CONFLICT / existence checks so duplicates are skipped.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Auto-load .env.local so the script works with a plain `npx tsx` invocation
const envLocalPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envLocalPath)) {
  const lines = fs.readFileSync(envLocalPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

const FIRST_NAMES_MALE = [
  "James", "Jack", "Liam", "Noah", "Oliver", "William", "Thomas", "Lucas",
  "Henry", "Alexander", "Daniel", "Matthew", "Ethan", "Samuel", "Benjamin",
  "Ryan", "Nathan", "Connor", "Dylan", "Jake", "Lachlan", "Cooper", "Riley",
  "Harrison", "Kai", "Tyler", "Jayden", "Hamish", "Angus", "Caleb",
  "Mitchell", "Blake", "Declan", "Patrick", "Shane", "Brendan", "Darren",
  "Craig", "Scott", "Brett", "Mark", "David", "Michael", "Andrew", "Chris",
  "Jason", "Peter", "Paul", "Simon", "Troy", "Cameron", "Darcy", "Brodie",
  "Bailey", "Cody", "Aiden", "Owen", "Mason", "Logan", "Archer", "Hugo",
];

const FIRST_NAMES_FEMALE = [
  "Charlotte", "Olivia", "Amelia", "Isla", "Mia", "Ava", "Grace", "Willow",
  "Harper", "Chloe", "Ella", "Sophie", "Emily", "Isabella", "Zoe", "Lily",
  "Matilda", "Evelyn", "Layla", "Sienna", "Ruby", "Ivy", "Aria", "Scarlett",
  "Hannah", "Sarah", "Jessica", "Lauren", "Amy", "Kate", "Emma", "Georgia",
  "Tara", "Kelly", "Nicole", "Samantha", "Brooke", "Courtney", "Tahlia",
  "Jade",
];

const LAST_NAMES = [
  "Smith", "Jones", "Williams", "Brown", "Wilson", "Taylor", "Johnson",
  "White", "Martin", "Anderson", "Thompson", "Walker", "Harris", "Lee",
  "Clark", "Robinson", "Mitchell", "Campbell", "Roberts", "Turner",
  "Stewart", "Edwards", "Murphy", "Kelly", "Cook", "Morgan", "Bell",
  "Murray", "King", "Baker", "Hill", "Collins", "Wood", "Ward", "Hughes",
  "Moore", "Young", "Allen", "Wright", "Scott", "Green", "Adams", "Nelson",
  "Carter", "Hall", "Parker", "Davis", "Evans", "Thomas", "Cooper",
  "O'Brien", "Ryan", "Sullivan", "Reid", "Graham", "Watson", "Palmer",
  "Grant", "McDonald", "Kennedy", "Burns", "Fox", "Gibson", "Chapman",
  "Simpson", "Shaw", "Burke", "Russell", "Nguyen", "Patel", "Singh",
  "Chen", "Li", "Santos", "De Silva", "Fernandez", "Kim",
];

// ---------------------------------------------------------------------------
// Employer / scope / occupation definitions
// ---------------------------------------------------------------------------

interface EmployerDef {
  name: string;
  category: string;
  siteRole: string;
  projectRole: string;
  workforceSize: number;
  occupations: string[];
  scopeNames: string[];
  engagementType: string;
}

const EMPLOYERS: EmployerDef[] = [
  {
    name: "TestCo Energy",
    category: "Producer",
    siteRole: "Operator",
    projectRole: "Operator",
    workforceSize: 80,
    occupations: [
      "Production Technician", "Process Operator", "Control Room Operator",
      "Field Operator", "Plant Operator", "Production Specialist",
      "Operations Technician", "Process Technician", "Laboratory Analyst",
      "Engineer", "Storeperson", "Admin", "Scheduler/Planner",
    ],
    scopeNames: ["Operations"],
    engagementType: "direct_employment",
  },
  {
    name: "Fortis Maintenance Services",
    category: "Major_Contractor",
    siteRole: "Principal_Contractor",
    projectRole: "Principal_Contractor",
    workforceSize: 120,
    occupations: [
      "Boilermaker", "Welder", "Mechanical Fitter", "Pipefitter",
      "Fitter and Turner", "Electrician", "INLEC Technician",
      "Electrical Technician", "Instrument Fitter", "Rigger",
      "Advanced Rigger", "Scaffolder", "Crane Operator", "Dogman",
      "Trade Assistant", "Valve Technician", "Turbine Technician",
    ],
    scopeNames: ["Mechanical", "Electrical", "Whole of Project"],
    engagementType: "contractor",
  },
  {
    name: "Pacific Coatings & Insulation",
    category: "Subcontractor",
    siteRole: "Subcontractor",
    projectRole: "Subcontractor",
    workforceSize: 55,
    occupations: [
      "Painter", "Blaster", "Painter/Blaster", "Insulator",
      "Sheet Metal Worker", "Lagger/Cladder", "Fireproofer",
      "Scaffolder", "UHP Operator", "Coatings Technician",
    ],
    scopeNames: ["PFP"],
    engagementType: "subcontractor",
  },
  {
    name: "Alliance Site Services",
    category: "Major_Contractor",
    siteRole: "Principal_Contractor",
    projectRole: "Principal_Contractor",
    workforceSize: 95,
    occupations: [
      "Chef", "Cook", "Baker", "Steward", "Service Attendant",
      "Camp Boss", "Galley Hand", "Cleaner", "Storeperson",
      "Logistics Coordinator", "Warehouse Officer", "Driver",
      "Materials Controller",
    ],
    scopeNames: ["Catering", "Logistics", "Facility Management", "Emergency Response"],
    engagementType: "contractor",
  },
];

// ---------------------------------------------------------------------------
// Deterministic-ish random helpers (seeded via simple LCG)
// ---------------------------------------------------------------------------

let _seed = 42;
function rand(): number {
  _seed = (_seed * 1664525 + 1013904223) & 0x7fffffff;
  return _seed / 0x7fffffff;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function pickWeighted<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
  console.log("=== Onshore Brownfields Test Data Seeder ===\n");

  // ---- 1. Employers ----
  console.log("1. Inserting employers...");
  const employerIds: Record<string, number> = {};

  for (const emp of EMPLOYERS) {
    const { data: existing } = await supabase
      .from("employers")
      .select("employer_id")
      .eq("employer_name", emp.name)
      .maybeSingle();

    if (existing) {
      employerIds[emp.name] = existing.employer_id;
      console.log(`   [skip] ${emp.name} already exists (id=${existing.employer_id})`);
    } else {
      const { data, error } = await supabase
        .from("employers")
        .insert({
          employer_name: emp.name,
          employer_category: emp.category,
          is_active: true,
        })
        .select("employer_id")
        .single();
      if (error) throw new Error(`Insert employer ${emp.name}: ${error.message}`);
      employerIds[emp.name] = data.employer_id;
      console.log(`   [new]  ${emp.name} (id=${data.employer_id})`);
    }
  }

  const producerEmployerId = employerIds["TestCo Energy"];

  // ---- 2. Worksite ----
  console.log("\n2. Inserting worksite...");
  let worksiteId: number;

  const { data: existingWs } = await supabase
    .from("worksites")
    .select("worksite_id")
    .eq("worksite_name", "Test Onshore Gas Plant")
    .maybeSingle();

  if (existingWs) {
    worksiteId = existingWs.worksite_id;
    console.log(`   [skip] Test Onshore Gas Plant already exists (id=${worksiteId})`);
  } else {
    const { data, error } = await supabase
      .from("worksites")
      .insert({
        worksite_name: "Test Onshore Gas Plant",
        worksite_type: "Gas_Plant",
        is_offshore: false,
        is_active: true,
        principal_employer_id: producerEmployerId,
        location_description: "Pilbara, Western Australia",
        latitude: -20.7167,
        longitude: 116.8463,
      })
      .select("worksite_id")
      .single();
    if (error) throw new Error(`Insert worksite: ${error.message}`);
    worksiteId = data.worksite_id;
    console.log(`   [new]  Test Onshore Gas Plant (id=${worksiteId})`);
  }

  // ---- 3. Project ----
  console.log("\n3. Inserting brownfields project...");
  let projectId: number;

  const { data: existingProj } = await supabase
    .from("projects")
    .select("project_id")
    .eq("project_name", "Test Onshore Gas Plant Brownfields")
    .maybeSingle();

  if (existingProj) {
    projectId = existingProj.project_id;
    console.log(`   [skip] Project already exists (id=${projectId})`);
  } else {
    const { data, error } = await supabase
      .from("projects")
      .insert({
        project_name: "Test Onshore Gas Plant Brownfields",
        worksite_id: worksiteId,
        work_type: "brownfields",
        project_status: "operational",
        is_active: true,
      })
      .select("project_id")
      .single();
    if (error) throw new Error(`Insert project: ${error.message}`);
    projectId = data.project_id;
    console.log(`   [new]  Project (id=${projectId})`);
  }

  // ---- 4. Employer-worksite roles ----
  console.log("\n4. Inserting employer-worksite roles...");
  for (const emp of EMPLOYERS) {
    const { error } = await supabase.from("employer_worksite_roles").upsert(
      {
        employer_id: employerIds[emp.name],
        worksite_id: worksiteId,
        role_type: emp.siteRole,
        is_current: true,
      },
      { onConflict: "employer_id,worksite_id,role_type" }
    );
    if (error) {
      console.log(`   [warn] ${emp.name} role: ${error.message}`);
    } else {
      console.log(`   [ok]   ${emp.name} → ${emp.siteRole}`);
    }
  }

  // ---- 5. Project employers ----
  console.log("\n5. Inserting project-employer links...");
  for (const emp of EMPLOYERS) {
    const { error } = await supabase.from("project_employers").upsert(
      {
        project_id: projectId,
        employer_id: employerIds[emp.name],
        role_type: emp.projectRole,
        is_current: true,
      },
      { onConflict: "project_id,employer_id,role_type" }
    );
    if (error) {
      console.log(`   [warn] ${emp.name} project link: ${error.message}`);
    } else {
      console.log(`   [ok]   ${emp.name} → project`);
    }
  }

  // ---- 6. Work scopes ----
  console.log("\n6. Looking up work scopes and inserting worksite_scopes...");
  const { data: allScopes, error: scopeErr } = await supabase
    .from("work_scopes")
    .select("scope_id, scope_name");
  if (scopeErr) throw new Error(`Fetch scopes: ${scopeErr.message}`);

  const scopeMap = new Map<string, number>();
  for (const s of allScopes || []) {
    scopeMap.set(s.scope_name, s.scope_id);
  }

  for (const emp of EMPLOYERS) {
    for (const scopeName of emp.scopeNames) {
      const scopeId = scopeMap.get(scopeName);
      if (!scopeId) {
        console.log(`   [warn] Scope "${scopeName}" not found in work_scopes — skipping`);
        continue;
      }

      const { data: existingScope } = await supabase
        .from("worksite_scopes")
        .select("id")
        .eq("worksite_id", worksiteId)
        .eq("scope_id", scopeId)
        .eq("employer_id", employerIds[emp.name])
        .maybeSingle();

      if (existingScope) {
        console.log(`   [skip] ${emp.name} / ${scopeName}`);
      } else {
        const { error } = await supabase.from("worksite_scopes").insert({
          worksite_id: worksiteId,
          scope_id: scopeId,
          employer_id: employerIds[emp.name],
          engagement_type: emp.engagementType,
          is_current: true,
        });
        if (error) {
          console.log(`   [warn] ${emp.name} / ${scopeName}: ${error.message}`);
        } else {
          console.log(`   [ok]   ${emp.name} / ${scopeName}`);
        }
      }
    }
  }

  // ---- 7. Look up union_membership_types ----
  console.log("\n7. Loading reference data...");
  const { data: membershipTypes } = await supabase
    .from("union_membership_types")
    .select("union_membership_type_id, type_name");

  const membershipMap = new Map<string, number>();
  for (const m of membershipTypes || []) {
    membershipMap.set(m.type_name, m.union_membership_type_id);
  }
  console.log(`   Membership types: ${[...membershipMap.keys()].join(", ")}`);

  // ---- 8. Look up AWU union_id ----
  const { data: awuRow } = await supabase
    .from("unions")
    .select("union_id")
    .eq("union_code", "AWU")
    .maybeSingle();
  const awuId = awuRow?.union_id ?? null;
  console.log(`   AWU union_id: ${awuId}`);

  // ---- 9. Generate and insert workers ----
  console.log("\n8. Generating workers...");

  const membershipTypeIds = {
    financial_member: membershipMap.get("financial_member") ?? null,
    non_member: membershipMap.get("non_member") ?? null,
    non_oa_member: membershipMap.get("non_oa_member") ?? null,
    resigned_member: membershipMap.get("resigned_member") ?? null,
  };

  const { data: nonOaRows } = await supabase.from("non_oa_union_options").select("non_oa_union_option_id");
  const nonOaCatalogIds = (nonOaRows ?? [])
    .map((r: { non_oa_union_option_id: number }) => r.non_oa_union_option_id)
    .filter((id: number) => Number.isFinite(id));

  const engagementLevels: Array<{ level: string; score: number }> = [
    { level: "contact", score: 5 },
    { level: "contact", score: 10 },
    { level: "attendee", score: 25 },
    { level: "attendee", score: 35 },
    { level: "activist", score: 55 },
    { level: "activist", score: 65 },
    { level: "delegate", score: 80 },
    { level: "leader", score: 95 },
  ];

  let workerSeq = 1;
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const emp of EMPLOYERS) {
    const workers: Array<Record<string, unknown>> = [];

    for (let i = 0; i < emp.workforceSize; i++) {
      const isFemale = rand() < 0.18; // ~18% female typical for onshore O&G
      const firstName = isFemale
        ? pick(FIRST_NAMES_FEMALE)
        : pick(FIRST_NAMES_MALE);
      const lastName = pick(LAST_NAMES);
      const email = `testworker.${String(workerSeq).padStart(4, "0")}@testdata.example.com`;
      const phone = `+614000${String(workerSeq).padStart(5, "0")}`;

      // Membership: ~45% financial, ~5% non_oa, ~5% resigned, ~45% non_member
      const membershipRoll = rand();
      let unionMembershipTypeId: number | null;
      let unionId: number | null = null;
      let memberNumber: string | null = null;
      let non_oa_union_option_id: number | null = null;

      if (membershipRoll < 0.45) {
        unionMembershipTypeId = membershipTypeIds.financial_member;
        unionId = awuId;
        memberNumber = `T${String(100000 + workerSeq)}`;
      } else if (membershipRoll < 0.50) {
        unionMembershipTypeId = membershipTypeIds.non_oa_member;
        non_oa_union_option_id =
          nonOaCatalogIds.length > 0 && rand() < 0.75 ? pick(nonOaCatalogIds) : null;
      } else if (membershipRoll < 0.55) {
        unionMembershipTypeId = membershipTypeIds.resigned_member;
      } else {
        unionMembershipTypeId = membershipTypeIds.non_member;
      }

      const eng = pick(engagementLevels);
      const occupation = pick(emp.occupations);

      const states = ["WA", "QLD", "NT", "SA", "NSW", "VIC"];
      const state = pickWeighted(states, [50, 15, 10, 5, 10, 10]);

      workers.push({
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        occupation,
        employer_id: employerIds[emp.name],
        worksite_id: worksiteId,
        project_id: projectId,
        union_membership_type_id: unionMembershipTypeId,
        union_id: unionId,
        member_number: memberNumber,
        non_oa_union_option_id,
        is_active: true,
        state,
        is_hsr: rand() < 0.03 ? true : null,
      });

      workerSeq++;
    }

    // Check which emails already exist to avoid duplicates
    const emails = workers.map((w) => w.email as string);
    const { data: existingWorkers } = await supabase
      .from("workers")
      .select("email")
      .in("email", emails);

    const existingEmails = new Set(
      (existingWorkers || []).map((w: { email: string }) => w.email)
    );

    const newWorkers = workers.filter(
      (w) => !existingEmails.has(w.email as string)
    );
    const skipped = workers.length - newWorkers.length;

    if (newWorkers.length > 0) {
      // Insert in batches of 50
      for (let i = 0; i < newWorkers.length; i += 50) {
        const batch = newWorkers.slice(i, i + 50);
        const { error } = await supabase.from("workers").insert(batch);
        if (error) {
          console.error(`   [error] ${emp.name} batch ${i}: ${error.message}`);
        }
      }
    }

    totalInserted += newWorkers.length;
    totalSkipped += skipped;
    console.log(
      `   ${emp.name}: ${newWorkers.length} inserted, ${skipped} skipped (already exist)`
    );
  }

  // ---- Summary ----
  console.log("\n=== Summary ===");
  console.log(`Worksite:  Test Onshore Gas Plant (id=${worksiteId})`);
  console.log(`Project:   Test Onshore Gas Plant Brownfields (id=${projectId})`);
  console.log(`Employers: ${Object.entries(employerIds).map(([n, id]) => `${n} (${id})`).join(", ")}`);
  console.log(`Workers:   ${totalInserted} inserted, ${totalSkipped} skipped`);
  console.log(`Emails:    testworker.0001@testdata.example.com → testworker.${String(workerSeq - 1).padStart(4, "0")}@testdata.example.com`);
  console.log("\nDone.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
