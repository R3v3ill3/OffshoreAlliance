/**
 * Seed script: offshore multi-worksite brownfields / maintenance test data.
 *
 * Creates producer "TestCo 2" with three offshore worksites (FPSO, Platform, FPU),
 * one program linking all sites, per-site maintenance projects, contractors, scopes,
 * and a split workforce. Emails: offshore2.worker.NNNN@testdata.example.com (RFC 2606).
 * Phones: +614001NNNNN — synthetic, not real subscriber numbers.
 *
 * Batch marker (for cleanup / filtering): oa_seed_batch=offshore-multisite-2
 *
 * Usage:  npx tsx scripts/seed-test-offshore-multisite.ts
 *
 * Prerequisites:
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   - Migrations applied (programs, work_scopes, union_membership_types, etc.)
 *
 * Safe to re-run: existence checks and email dedupe; skips existing rows.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const OA_SEED_BATCH = "oa_seed_batch=offshore-multisite-2";

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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
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

const PROGRAM_NAME = "TEST · TestCo 2 Offshore Maintenance Program";

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

interface WorksiteDef {
  name: string;
  worksiteType: string;
  lat: number;
  lon: number;
  projectName: string;
  workType: "brownfields" | "maintenance";
  isPrimary: boolean;
}

const WORKSITES: WorksiteDef[] = [
  {
    name: "TEST · TestCo 2 — Alpha FPSO",
    worksiteType: "FPSO",
    lat: -19.25,
    lon: 116.82,
    projectName: "TEST · TestCo 2 — Alpha — brownfields",
    workType: "brownfields",
    isPrimary: true,
  },
  {
    name: "TEST · TestCo 2 — Bravo Platform",
    worksiteType: "Platform",
    lat: -19.42,
    lon: 117.05,
    projectName: "TEST · TestCo 2 — Bravo — maintenance",
    workType: "maintenance",
    isPrimary: false,
  },
  {
    name: "TEST · TestCo 2 — Charlie FPU",
    worksiteType: "FPU",
    lat: -18.98,
    lon: 116.55,
    projectName: "TEST · TestCo 2 — Charlie — maintenance",
    workType: "maintenance",
    isPrimary: false,
  },
];

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
    name: "TestCo 2",
    category: "Producer",
    siteRole: "Operator",
    projectRole: "Operator",
    workforceSize: 72,
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
    name: "Aegis Offshore Maintenance Pty Ltd",
    category: "Major_Contractor",
    siteRole: "Maintenance",
    projectRole: "Principal_Contractor",
    workforceSize: 108,
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
    name: "NorthStar Marine Coatings",
    category: "Subcontractor",
    siteRole: "Subcontractor",
    projectRole: "Subcontractor",
    workforceSize: 48,
    occupations: [
      "Painter", "Blaster", "Painter/Blaster", "Insulator",
      "Sheet Metal Worker", "Lagger/Cladder", "Fireproofer",
      "Scaffolder", "UHP Operator", "Coatings Technician",
    ],
    scopeNames: ["PFP"],
    engagementType: "subcontractor",
  },
  {
    name: "Offshore Crew Services Ltd",
    category: "Major_Contractor",
    siteRole: "Catering",
    projectRole: "Catering",
    workforceSize: 84,
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

let _seed = 1337;
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

function splitCounts(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const rem = total % parts;
  const arr = Array(parts).fill(base) as number[];
  for (let i = 0; i < rem; i++) arr[i] += 1;
  return arr;
}

async function seed() {
  console.log("=== Offshore multi-site test data seeder ===\n");
  console.log(`Batch: ${OA_SEED_BATCH}\n`);

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
      console.log(`   [skip] ${emp.name} (id=${existing.employer_id})`);
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

  const producerId = employerIds["TestCo 2"];

  console.log("\n2. Inserting worksites...");
  const worksiteIds: number[] = [];

  for (const ws of WORKSITES) {
    const { data: existingWs } = await supabase
      .from("worksites")
      .select("worksite_id")
      .eq("worksite_name", ws.name)
      .maybeSingle();

    if (existingWs) {
      worksiteIds.push(existingWs.worksite_id);
      console.log(`   [skip] ${ws.name} (id=${existingWs.worksite_id})`);
    } else {
      const { data, error } = await supabase
        .from("worksites")
        .insert({
          worksite_name: ws.name,
          worksite_type: ws.worksiteType,
          is_offshore: true,
          is_active: true,
          principal_employer_id: producerId,
          location_description: `North West Shelf — ${OA_SEED_BATCH}`,
          latitude: ws.lat,
          longitude: ws.lon,
        })
        .select("worksite_id")
        .single();
      if (error) throw new Error(`Insert worksite ${ws.name}: ${error.message}`);
      worksiteIds.push(data.worksite_id);
      console.log(`   [new]  ${ws.name} (id=${data.worksite_id})`);
    }
  }

  console.log("\n3. Inserting program...");
  let programId: number;
  const { data: existingProg } = await supabase
    .from("programs")
    .select("program_id")
    .eq("program_name", PROGRAM_NAME)
    .maybeSingle();

  if (existingProg) {
    programId = existingProg.program_id;
    console.log(`   [skip] ${PROGRAM_NAME} (id=${programId})`);
  } else {
    const { data, error } = await supabase
      .from("programs")
      .insert({
        program_name: PROGRAM_NAME,
        description: `Synthetic offshore program for QA. ${OA_SEED_BATCH}`,
        principal_employer_id: producerId,
        program_status: "active",
        is_active: true,
        notes: OA_SEED_BATCH,
      })
      .select("program_id")
      .single();
    if (error) throw new Error(`Insert program: ${error.message}`);
    programId = data.program_id;
    console.log(`   [new]  ${PROGRAM_NAME} (id=${programId})`);
  }

  console.log("\n4. Linking program ↔ worksites...");
  for (let i = 0; i < WORKSITES.length; i++) {
    const ws = WORKSITES[i];
    const wid = worksiteIds[i];
    const { data: existingLink } = await supabase
      .from("program_worksites")
      .select("id")
      .eq("program_id", programId)
      .eq("worksite_id", wid)
      .maybeSingle();

    if (existingLink) {
      console.log(`   [skip] ${ws.name}`);
    } else {
      const { error } = await supabase.from("program_worksites").insert({
        program_id: programId,
        worksite_id: wid,
        is_current: true,
        is_primary: ws.isPrimary,
        notes: OA_SEED_BATCH,
      });
      if (error) {
        console.log(`   [warn] ${ws.name}: ${error.message}`);
      } else {
        console.log(`   [ok]   ${ws.name} primary=${ws.isPrimary}`);
      }
    }
  }

  console.log("\n5. Inserting per-site projects...");
  const projectIds: number[] = [];

  for (let i = 0; i < WORKSITES.length; i++) {
    const ws = WORKSITES[i];
    const wid = worksiteIds[i];

    const { data: existingProj } = await supabase
      .from("projects")
      .select("project_id")
      .eq("project_name", ws.projectName)
      .maybeSingle();

    if (existingProj) {
      projectIds.push(existingProj.project_id);
      console.log(`   [skip] ${ws.projectName} (id=${existingProj.project_id})`);
    } else {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          project_name: ws.projectName,
          worksite_id: wid,
          work_type: ws.workType,
          project_status: "operational",
          is_active: true,
          notes: OA_SEED_BATCH,
        })
        .select("project_id")
        .single();
      if (error) throw new Error(`Insert project ${ws.projectName}: ${error.message}`);
      projectIds.push(data.project_id);
      console.log(`   [new]  ${ws.projectName} (id=${data.project_id})`);
    }
  }

  console.log("\n6. Employer ↔ worksite roles (all sites)...");
  for (let i = 0; i < WORKSITES.length; i++) {
    const wid = worksiteIds[i];
    for (const emp of EMPLOYERS) {
      const { error } = await supabase.from("employer_worksite_roles").upsert(
        {
          employer_id: employerIds[emp.name],
          worksite_id: wid,
          role_type: emp.siteRole,
          is_current: true,
        },
        { onConflict: "employer_id,worksite_id,role_type" }
      );
      if (error) {
        console.log(`   [warn] ${WORKSITES[i].name} / ${emp.name}: ${error.message}`);
      }
    }
    console.log(`   [ok] roles for ${WORKSITES[i].name}`);
  }

  console.log("\n7. Project ↔ employers...");
  for (let i = 0; i < WORKSITES.length; i++) {
    const pid = projectIds[i];
    for (const emp of EMPLOYERS) {
      const { error } = await supabase.from("project_employers").upsert(
        {
          project_id: pid,
          employer_id: employerIds[emp.name],
          role_type: emp.projectRole,
          is_current: true,
        },
        { onConflict: "project_id,employer_id,role_type" }
      );
      if (error) {
        console.log(`   [warn] project ${pid} ${emp.name}: ${error.message}`);
      }
    }
  }

  console.log("\n8. Worksite scopes...");
  const { data: allScopes, error: scopeErr } = await supabase
    .from("work_scopes")
    .select("scope_id, scope_name");
  if (scopeErr) throw new Error(`Fetch scopes: ${scopeErr.message}`);

  const scopeMap = new Map<string, number>();
  for (const s of allScopes || []) {
    scopeMap.set(s.scope_name, s.scope_id);
  }

  for (let i = 0; i < WORKSITES.length; i++) {
    const wid = worksiteIds[i];
    for (const emp of EMPLOYERS) {
      for (const scopeName of emp.scopeNames) {
        const scopeId = scopeMap.get(scopeName);
        if (!scopeId) {
          console.log(`   [warn] Scope "${scopeName}" missing — skip`);
          continue;
        }

        const { data: existingScope } = await supabase
          .from("worksite_scopes")
          .select("id")
          .eq("worksite_id", wid)
          .eq("scope_id", scopeId)
          .eq("employer_id", employerIds[emp.name])
          .maybeSingle();

        if (existingScope) continue;

        const { error } = await supabase.from("worksite_scopes").insert({
          worksite_id: wid,
          scope_id: scopeId,
          employer_id: employerIds[emp.name],
          engagement_type: emp.engagementType,
          is_current: true,
          notes: OA_SEED_BATCH,
        });
        if (error) {
          console.log(`   [warn] ${emp.name} / ${scopeName}: ${error.message}`);
        }
      }
    }
  }

  console.log("\n9. Reference: union membership + AWU...");
  const { data: membershipTypes } = await supabase
    .from("union_membership_types")
    .select("union_membership_type_id, type_name");

  const membershipMap = new Map<string, number>();
  for (const m of membershipTypes || []) {
    membershipMap.set(m.type_name, m.union_membership_type_id);
  }

  const { data: awuRow } = await supabase
    .from("unions")
    .select("union_id")
    .eq("union_code", "AWU")
    .maybeSingle();
  const awuId = awuRow?.union_id ?? null;

  const membershipTypeIds = {
    financial_member: membershipMap.get("financial_member") ?? null,
    non_member: membershipMap.get("non_member") ?? null,
    non_oa_member: membershipMap.get("non_oa_member") ?? null,
    resigned_member: membershipMap.get("resigned_member") ?? null,
  };

  const { data: nonOaSeedRows } = await supabase.from("non_oa_union_options").select("non_oa_union_option_id");
  const nonOaCatalogIds = (nonOaSeedRows ?? [])
    .map((r: { non_oa_union_option_id: number }) => r.non_oa_union_option_id)
    .filter((id: number) => Number.isFinite(id));

  console.log("\n10. Generating workers (split across sites)...");
  let workerSeq = 1;
  let totalInserted = 0;
  let totalSkipped = 0;
  const numSites = WORKSITES.length;

  for (const emp of EMPLOYERS) {
    const counts = splitCounts(emp.workforceSize, numSites);
    const siteWorkers: Array<{
      workers: Array<Record<string, unknown>>;
      siteIndex: number;
    }> = [];

    for (let s = 0; s < numSites; s++) {
      const bucket: Array<Record<string, unknown>> = [];
      for (let i = 0; i < counts[s]; i++) {
        const isFemale = rand() < 0.14;
        const firstName = isFemale
          ? pick(FIRST_NAMES_FEMALE)
          : pick(FIRST_NAMES_MALE);
        const lastName = pick(LAST_NAMES);
        const email = `offshore2.worker.${String(workerSeq).padStart(4, "0")}@testdata.example.com`;
        const phone = `+614001${String(workerSeq).padStart(5, "0")}`;

        const membershipRoll = rand();
        let unionMembershipTypeId: number | null;
        let unionId: number | null = null;
        let memberNumber: string | null = null;
        let non_oa_union_option_id: number | null = null;

        if (membershipRoll < 0.45) {
          unionMembershipTypeId = membershipTypeIds.financial_member;
          unionId = awuId;
          memberNumber = `O2${String(200000 + workerSeq)}`;
        } else if (membershipRoll < 0.5) {
          unionMembershipTypeId = membershipTypeIds.non_oa_member;
          non_oa_union_option_id =
            nonOaCatalogIds.length > 0 && rand() < 0.75 ? pick(nonOaCatalogIds) : null;
        } else if (membershipRoll < 0.55) {
          unionMembershipTypeId = membershipTypeIds.resigned_member;
        } else {
          unionMembershipTypeId = membershipTypeIds.non_member;
        }

        const occupation = pick(emp.occupations);
        const states = ["WA", "QLD", "NT", "SA", "NSW", "VIC"];
        const state = pickWeighted(states, [50, 15, 10, 5, 10, 10]);

        bucket.push({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          occupation,
          employer_id: employerIds[emp.name],
          worksite_id: worksiteIds[s],
          project_id: projectIds[s],
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
      siteWorkers.push({ workers: bucket, siteIndex: s });
    }

    const flatWorkers = siteWorkers.flatMap((x) => x.workers);
    const emails = flatWorkers.map((w) => w.email as string);
    const { data: existingWorkers } = await supabase
      .from("workers")
      .select("email")
      .in("email", emails);

    const existingEmails = new Set(
      (existingWorkers || []).map((w: { email: string }) => w.email)
    );

    const newWorkers = flatWorkers.filter(
      (w) => !existingEmails.has(w.email as string)
    );
    const skipped = flatWorkers.length - newWorkers.length;

    if (newWorkers.length > 0) {
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
      `   ${emp.name}: ${newWorkers.length} inserted, ${skipped} skipped`
    );
  }

  console.log("\n=== Summary ===");
  console.log(`Program:   ${PROGRAM_NAME} (id=${programId})`);
  console.log(`Worksites: ${WORKSITES.map((w, i) => `${w.name} (${worksiteIds[i]})`).join("; ")}`);
  console.log(`Projects:  ${projectIds.join(", ")}`);
  console.log(`Employers: ${Object.entries(employerIds).map(([n, id]) => `${n} (${id})`).join(", ")}`);
  console.log(`Workers:   ${totalInserted} inserted, ${totalSkipped} skipped`);
  console.log(
    `Emails:    offshore2.worker.0001@… → offshore2.worker.${String(workerSeq - 1).padStart(4, "0")}@…`
  );
  console.log("\nDone.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
