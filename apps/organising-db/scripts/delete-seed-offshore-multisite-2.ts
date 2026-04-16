/**
 * Removes data created by seed-test-offshore-multisite.ts (batch offshore-multisite-2).
 *
 * Deletes in FK-safe order. Run against staging first.
 *
 * Usage:
 *   npx tsx scripts/delete-seed-offshore-multisite-2.ts           # execute
 *   npx tsx scripts/delete-seed-offshore-multisite-2.ts --dry-run   # print plan only
 *   npx tsx scripts/delete-seed-offshore-multisite-2.ts --deactivate-only
 *
 * --deactivate-only: sets is_active = false on employers, worksites, projects,
 * programs, and workers matching this batch (no row deletion).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (same .env.local loading as seed script).
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const OA_SEED_BATCH = "oa_seed_batch=offshore-multisite-2";

/** Keep in sync with seed-test-offshore-multisite.ts */
const PROGRAM_NAME = "TEST · TestCo 2 Offshore Maintenance Program";

const WORKSITE_NAMES = [
  "TEST · TestCo 2 — Alpha FPSO",
  "TEST · TestCo 2 — Bravo Platform",
  "TEST · TestCo 2 — Charlie FPU",
];

const PROJECT_NAMES = [
  "TEST · TestCo 2 — Alpha — brownfields",
  "TEST · TestCo 2 — Bravo — maintenance",
  "TEST · TestCo 2 — Charlie — maintenance",
];

const EMPLOYER_NAMES = [
  "TestCo 2",
  "Aegis Offshore Maintenance Pty Ltd",
  "NorthStar Marine Coatings",
  "Offshore Crew Services Ltd",
];

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

async function runDeactivateOnly(dryRun: boolean) {
  console.log("=== Deactivate-only (is_active = false) ===\n");

  const { data: workers } = await supabase
    .from("workers")
    .select("worker_id")
    .like("email", "offshore2.worker.%@testdata.example.com");

  const { data: ws } = await supabase
    .from("worksites")
    .select("worksite_id")
    .in("worksite_name", WORKSITE_NAMES);

  const { data: emp } = await supabase
    .from("employers")
    .select("employer_id")
    .in("employer_name", EMPLOYER_NAMES);

  const { data: proj } = await supabase
    .from("projects")
    .select("project_id")
    .in("project_name", PROJECT_NAMES);

  const { data: prog } = await supabase
    .from("programs")
    .select("program_id")
    .eq("program_name", PROGRAM_NAME);

  console.log(
    `Workers: ${workers?.length ?? 0}, worksites: ${ws?.length ?? 0}, employers: ${emp?.length ?? 0}, projects: ${proj?.length ?? 0}, programs: ${prog?.length ?? 0}`
  );

  if (dryRun) {
    console.log("[dry-run] no updates");
    return;
  }

  if (workers?.length) {
    const ids = workers.map((w) => w.worker_id);
    const { error } = await supabase
      .from("workers")
      .update({ is_active: false })
      .in("worker_id", ids);
    if (error) console.error("workers:", error.message);
    else console.log(`Updated ${ids.length} workers`);
  }

  if (proj?.length) {
    const ids = proj.map((p) => p.project_id);
    const { error } = await supabase
      .from("projects")
      .update({ is_active: false })
      .in("project_id", ids);
    if (error) console.error("projects:", error.message);
    else console.log(`Updated ${ids.length} projects`);
  }

  if (prog?.length) {
    const ids = prog.map((p) => p.program_id);
    const { error } = await supabase
      .from("programs")
      .update({ is_active: false })
      .in("program_id", ids);
    if (error) console.error("programs:", error.message);
    else console.log(`Updated ${ids.length} programs`);
  }

  if (ws?.length) {
    const ids = ws.map((w) => w.worksite_id);
    const { error } = await supabase
      .from("worksites")
      .update({ is_active: false })
      .in("worksite_id", ids);
    if (error) console.error("worksites:", error.message);
    else console.log(`Updated ${ids.length} worksites`);
  }

  if (emp?.length) {
    const ids = emp.map((e) => e.employer_id);
    const { error } = await supabase
      .from("employers")
      .update({ is_active: false })
      .in("employer_id", ids);
    if (error) console.error("employers:", error.message);
    else console.log(`Updated ${ids.length} employers`);
  }
}

async function deleteBatch(dryRun: boolean) {
  console.log(`=== Delete batch: ${OA_SEED_BATCH} ===\n`);

  const { data: workers, error: wErr } = await supabase
    .from("workers")
    .select("worker_id, email")
    .like("email", "offshore2.worker.%@testdata.example.com");

  if (wErr) throw new Error(`List workers: ${wErr.message}`);

  const { data: projects } = await supabase
    .from("projects")
    .select("project_id, project_name")
    .in("project_name", PROJECT_NAMES);

  const { data: program } = await supabase
    .from("programs")
    .select("program_id")
    .eq("program_name", PROGRAM_NAME)
    .maybeSingle();

  const { data: worksites } = await supabase
    .from("worksites")
    .select("worksite_id, worksite_name")
    .in("worksite_name", WORKSITE_NAMES);

  console.log(`Workers to delete: ${workers?.length ?? 0}`);
  console.log(`Projects: ${projects?.map((p) => p.project_name).join(", ") || "(none)"}`);
  console.log(`Program id: ${program?.program_id ?? "(none)"}`);
  console.log(`Worksites: ${worksites?.map((w) => w.worksite_name).join(", ") || "(none)"}`);

  if (dryRun) {
    console.log("\n[dry-run] no deletes");
    return;
  }

  if (workers?.length) {
    const ids = workers.map((w) => w.worker_id);
    const { error } = await supabase.from("workers").delete().in("worker_id", ids);
    if (error) throw new Error(`Delete workers: ${error.message}`);
    console.log(`\nDeleted ${ids.length} workers`);
  }

  if (projects?.length) {
    for (const p of projects) {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("project_id", p.project_id);
      if (error) throw new Error(`Delete project ${p.project_id}: ${error.message}`);
    }
    console.log(`Deleted ${projects.length} projects`);
  }

  if (program?.program_id) {
    const { error: pwErr } = await supabase
      .from("program_worksites")
      .delete()
      .eq("program_id", program.program_id);
    if (pwErr) throw new Error(`Delete program_worksites: ${pwErr.message}`);

    const { error: pgErr } = await supabase
      .from("programs")
      .delete()
      .eq("program_id", program.program_id);
    if (pgErr) throw new Error(`Delete program: ${pgErr.message}`);
    console.log(`Deleted program ${program.program_id} and links`);
  }

  if (worksites?.length) {
    for (const w of worksites) {
      const { error } = await supabase
        .from("worksites")
        .delete()
        .eq("worksite_id", w.worksite_id);
      if (error) {
        throw new Error(
          `Delete worksite ${w.worksite_name} (${w.worksite_id}): ${error.message}`
        );
      }
    }
    console.log(`Deleted ${worksites.length} worksites`);
  }

  const { data: employers } = await supabase
    .from("employers")
    .select("employer_id, employer_name")
    .in("employer_name", EMPLOYER_NAMES);

  if (employers?.length) {
    for (const e of employers) {
      const { error } = await supabase
        .from("employers")
        .delete()
        .eq("employer_id", e.employer_id);
      if (error) {
        console.error(
          `Could not delete employer ${e.employer_name}: ${error.message} — try --deactivate-only or remove dependent rows`
        );
      } else {
        console.log(`Deleted employer ${e.employer_name}`);
      }
    }
  }

  console.log("\nDone.");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const doDeactivate = process.argv.includes("--deactivate-only");

  if (doDeactivate) {
    await runDeactivateOnly(dryRun);
  } else {
    await deleteBatch(dryRun);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
