import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type {
  CampaignImportApplyRequest,
  CampaignImportApplyResponse,
  ApplyVessel,
} from "@/lib/import/campaign-import-shared";

// This route fans out a lot of inserts; allow a generous server budget. All the
// heavy work is batched (see below) so a normal import completes in seconds, but
// very large lists or slow DB round-trips still need headroom.
export const runtime = "nodejs";
export const maxDuration = 300;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

const UNSPECIFIED_VESSEL_KEY = "__unspecified__";
const CHUNK = 200;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── Fold helpers (follow mergeIntoKey chains) ───────────────────────────────

function buildKeyResolver<T extends { key: string; mergeIntoKey?: string | null }>(
  items: T[]
): (key: string) => string {
  const byKey = new Map(items.map((i) => [i.key, i]));
  return (key: string) => {
    let k = key;
    let guard = 0;
    while (byKey.get(k)?.mergeIntoKey && guard++ < 20) {
      k = byKey.get(k)!.mergeIntoKey as string;
    }
    return k;
  };
}

/** Insert rows in batches; on a batch error, retry that batch row-by-row so a
 *  single bad/duplicate row can't sink the whole import. Best-effort: failures
 *  are swallowed (used for non-critical aliases). */
async function bestEffortInsert(supabase: Supa, table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  for (const batch of chunk(rows, CHUNK)) {
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      for (const row of batch) {
        await supabase.from(table).insert(row);
      }
    }
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (!profile || !["admin", "user"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: CampaignImportApplyRequest;
  try {
    body = (await req.json()) as CampaignImportApplyRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const errors: string[] = [];
  const stats = {
    employersCreated: 0,
    worksitesCreated: 0,
    workersCreated: 0,
    workersUpdated: 0,
    workersSkipped: 0,
    groupsCreated: 0,
    unitsCreated: 0,
    assignmentsCreated: 0,
    listItemsCreated: 0,
  };
  let campaignId = body.campaignId ?? null;
  let listId: number | null = null;

  try {
  // ── 1. Resolve / create campaign ────────────────────────────────────────
  if (!campaignId) {
    if (!body.newCampaign?.name?.trim()) {
      return NextResponse.json({ error: "A campaign name is required to create a new campaign" }, { status: 400 });
    }
    const { data: created, error } = await supabase
      .from("campaigns")
      .insert({
        name: body.newCampaign.name.trim(),
        campaign_type: body.newCampaign.campaign_type || "organising",
        status: body.newCampaign.status || "planning",
        organiser_id: body.newCampaign.organiser_id ?? null,
      })
      .select("campaign_id")
      .single();
    if (error || !created) {
      return NextResponse.json({ error: `Failed to create campaign: ${error?.message}` }, { status: 500 });
    }
    campaignId = created.campaign_id;
  }

  // ── 2. Resolve / create employers (batched) ─────────────────────────────
  const resolveEmployerKey = buildKeyResolver(body.employers);
  const empBySurvivorKey = new Map(body.employers.filter((e) => !e.mergeIntoKey).map((e) => [e.key, e] as const));
  const employerIdBySurvivorKey = new Map<string, number>();
  const employerCreateKeys = [...empBySurvivorKey.values()].filter((e) => e.action === "create");
  for (const e of empBySurvivorKey.values()) {
    if (e.action !== "create" && e.matchedEmployerId) employerIdBySurvivorKey.set(e.key, e.matchedEmployerId);
  }
  // Find-or-create by exact name — employer_name is UNIQUE, so a name that
  // already exists (a prior run, or a duplicate within this file) is reused
  // instead of throwing a duplicate-key error.
  {
    const createNames = [...new Set(employerCreateKeys.map((e) => e.canonicalName.trim()))];
    const idByName = new Map<string, number>();
    if (createNames.length > 0) {
      const { data: existing } = await supabase
        .from("employers")
        .select("employer_id, employer_name")
        .in("employer_name", createNames);
      for (const e of existing ?? []) idByName.set(e.employer_name.toLowerCase(), e.employer_id);
      const toCreate = createNames.filter((n) => !idByName.has(n.toLowerCase()));
      for (const batch of chunk(toCreate, CHUNK)) {
        const rows = batch.map((name) => ({
          employer_name: name,
          employer_category: employerCreateKeys.find((e) => e.canonicalName.trim() === name)?.newCategory || null,
        }));
        const { data, error } = await supabase.from("employers").insert(rows).select("employer_id, employer_name");
        if (!error && data) {
          for (const e of data) {
            idByName.set(e.employer_name.toLowerCase(), e.employer_id);
            stats.employersCreated++;
          }
        } else {
          for (const r of rows) {
            const { data: d, error: er } = await supabase
              .from("employers")
              .insert(r)
              .select("employer_id, employer_name")
              .single();
            if (er) errors.push(`Employer "${r.employer_name}": ${er.message}`);
            else {
              idByName.set(d.employer_name.toLowerCase(), d.employer_id);
              stats.employersCreated++;
            }
          }
        }
      }
    }
    for (const e of employerCreateKeys) {
      const id = idByName.get(e.canonicalName.trim().toLowerCase());
      if (id != null) employerIdBySurvivorKey.set(e.key, id);
    }
  }
  const employerIdForKey = (key: string): number | null =>
    employerIdBySurvivorKey.get(resolveEmployerKey(key)) ?? null;

  // Employer aliases (best-effort, source must be 'merge'|'manual').
  {
    const aliasRows: Record<string, unknown>[] = [];
    for (const e of empBySurvivorKey.values()) {
      const empId = employerIdBySurvivorKey.get(e.key);
      if (!empId) continue;
      const canon = e.canonicalName.toLowerCase().trim();
      for (const v of e.variants) {
        const vl = v.toLowerCase().trim();
        if (!vl || vl === canon) continue;
        aliasRows.push({ employer_id: empId, alias_name: v.trim(), source: "manual", created_by: user.id });
      }
    }
    await bestEffortInsert(supabase, "employer_name_aliases", aliasRows);
  }

  // ── 3. Resolve / create worksites (batched) ─────────────────────────────
  const resolveVesselKey = buildKeyResolver(body.vessels as ApplyVessel[]);
  const vesselByKey = new Map(body.vessels.map((v) => [v.key, v] as const));
  const vesselBySurvivorKey = new Map(body.vessels.filter((v) => !v.mergeIntoKey).map((v) => [v.key, v] as const));
  const worksiteIdBySurvivorKey = new Map<string, number | null>();
  const worksiteCreateKeys: ApplyVessel[] = [];
  for (const v of vesselBySurvivorKey.values()) {
    if (v.action === "unspecified" || v.canonicalName === "Unspecified vessel") {
      worksiteIdBySurvivorKey.set(v.key, null);
    } else if (v.action === "create") {
      worksiteCreateKeys.push(v);
    } else {
      worksiteIdBySurvivorKey.set(v.key, v.matchedWorksiteId ?? null);
    }
  }
  // Find-or-create by exact name — worksite_name is UNIQUE, so reuse an existing
  // worksite (or one already created earlier this run) instead of duplicating it.
  {
    const createNames = [...new Set(worksiteCreateKeys.map((v) => v.canonicalName.trim()))];
    const idByName = new Map<string, number>();
    if (createNames.length > 0) {
      const { data: existing } = await supabase
        .from("worksites")
        .select("worksite_id, worksite_name")
        .in("worksite_name", createNames);
      for (const w of existing ?? []) idByName.set(w.worksite_name.toLowerCase(), w.worksite_id);
      const toCreate = createNames.filter((n) => !idByName.has(n.toLowerCase()));
      for (const batch of chunk(toCreate, CHUNK)) {
        const rows = batch.map((name) => {
          const v = worksiteCreateKeys.find((x) => x.canonicalName.trim() === name);
          const employerId = v ? employerIdForKey(v.employerKey) : null;
          // Keys identical across the batch — PostgREST rejects mixed columns.
          return {
            worksite_name: name,
            worksite_type: v?.newWorksiteType || "Other",
            principal_employer_id: employerId ?? null,
          };
        });
        const { data, error } = await supabase.from("worksites").insert(rows).select("worksite_id, worksite_name");
        if (!error && data) {
          for (const w of data) {
            idByName.set(w.worksite_name.toLowerCase(), w.worksite_id);
            stats.worksitesCreated++;
          }
        } else {
          for (const r of rows) {
            const { data: d, error: er } = await supabase
              .from("worksites")
              .insert(r)
              .select("worksite_id, worksite_name")
              .single();
            if (er) errors.push(`Vessel "${r.worksite_name}": ${er.message}`);
            else {
              idByName.set(d.worksite_name.toLowerCase(), d.worksite_id);
              stats.worksitesCreated++;
            }
          }
        }
      }
    }
    for (const v of worksiteCreateKeys) {
      const id = idByName.get(v.canonicalName.trim().toLowerCase());
      if (id != null) worksiteIdBySurvivorKey.set(v.key, id);
    }
  }
  const worksiteIdForKey = (key: string): number | null =>
    worksiteIdBySurvivorKey.get(resolveVesselKey(key)) ?? null;

  // Worksite aliases (best-effort) for newly created worksites.
  {
    const aliasRows: Record<string, unknown>[] = [];
    for (const v of worksiteCreateKeys) {
      const wsId = worksiteIdBySurvivorKey.get(v.key);
      if (!wsId) continue;
      const canon = v.canonicalName.toLowerCase().trim();
      for (const variant of v.variants) {
        const vl = variant.toLowerCase().trim();
        if (!vl || vl === canon) continue;
        aliasRows.push({ worksite_id: wsId, alias_name: variant.trim(), source: "import", created_by: user.id });
      }
    }
    await bestEffortInsert(supabase, "worksite_name_aliases", aliasRows);
  }

  // Link every vessel's employer to its (possibly shared) worksite — one row per
  // operator, so a vessel under multiple employers records a role for each.
  {
    const seen = new Set<string>();
    const roleRows: Record<string, unknown>[] = [];
    for (const vessel of body.vessels) {
      const wsId = worksiteIdForKey(vessel.key);
      const empId = employerIdForKey(vessel.employerKey);
      if (!wsId || !empId) continue;
      const k = `${empId}:${wsId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      roleRows.push({ employer_id: empId, worksite_id: wsId, role_type: "Operator", is_current: true });
    }
    for (const batch of chunk(roleRows, CHUNK)) {
      await supabase
        .from("employer_worksite_roles")
        .upsert(batch, { onConflict: "employer_id,worksite_id,role_type", ignoreDuplicates: true });
    }
  }

  // ── 4. campaign_employers + campaign_worksites junctions (batched) ──────
  const employerIds = [...new Set(employerIdBySurvivorKey.values())];
  for (const batch of chunk(employerIds.map((employer_id) => ({ campaign_id: campaignId, employer_id })), CHUNK)) {
    await supabase.from("campaign_employers").upsert(batch, { onConflict: "campaign_id,employer_id", ignoreDuplicates: true });
  }
  const worksiteIds = [...new Set([...worksiteIdBySurvivorKey.values()].filter((w): w is number => w != null))];
  if (worksiteIds.length > 0) {
    const { data: existingCw } = await supabase
      .from("campaign_worksites")
      .select("worksite_id")
      .eq("campaign_id", campaignId)
      .in("worksite_id", worksiteIds);
    const have = new Set((existingCw ?? []).map((r: { worksite_id: number }) => r.worksite_id));
    const toAdd = worksiteIds.filter((w) => !have.has(w)).map((worksite_id) => ({ campaign_id: campaignId, worksite_id }));
    for (const batch of chunk(toAdd, CHUNK)) {
      await supabase.from("campaign_worksites").insert(batch);
    }
  }

  // ── 5. Occupation + status lookups (batched) ────────────────────────────
  const occupationIdByRaw = new Map<string, number | null>();
  {
    const createNames = [
      ...new Set(
        body.occupations.filter((o) => o.action === "create" && o.createName?.trim()).map((o) => o.createName!.trim())
      ),
    ];
    const occIdByName = new Map<string, number>();
    if (createNames.length > 0) {
      const { data: existing } = await supabase
        .from("occupations")
        .select("occupation_id, canonical_name")
        .in("canonical_name", createNames);
      for (const o of existing ?? []) occIdByName.set(o.canonical_name.toLowerCase(), o.occupation_id);
      const toCreate = createNames.filter((n) => !occIdByName.has(n.toLowerCase()));
      for (const batch of chunk(toCreate, CHUNK)) {
        const { data, error } = await supabase
          .from("occupations")
          .insert(batch.map((canonical_name) => ({ canonical_name, is_active: true })))
          .select("occupation_id, canonical_name");
        if (!error && data) {
          for (const o of data) occIdByName.set(o.canonical_name.toLowerCase(), o.occupation_id);
        } else {
          errors.push(`Occupations: ${error?.message ?? "batch insert failed"}`);
        }
      }
    }
    const aliasRows: Record<string, unknown>[] = [];
    for (const occ of body.occupations) {
      if (occ.action === "skip") {
        occupationIdByRaw.set(occ.rawValue.toLowerCase(), null);
        continue;
      }
      const occId =
        occ.action === "create" && occ.createName?.trim()
          ? occIdByName.get(occ.createName.trim().toLowerCase()) ?? null
          : occ.matchedOccupationId ?? null;
      occupationIdByRaw.set(occ.rawValue.toLowerCase(), occId);
      if (occId && occ.rawValue.trim() && occ.rawValue.trim().toLowerCase() !== (occ.createName ?? "").trim().toLowerCase()) {
        aliasRows.push({ occupation_id: occId, alias_name: occ.rawValue.trim(), source: "import", created_by: user.id });
      }
    }
    await bestEffortInsert(supabase, "occupation_aliases", aliasRows);
  }

  const membershipIdByRaw = new Map<string, number | null>();
  for (const s of body.statuses) membershipIdByRaw.set(s.rawValue.toLowerCase(), s.membershipTypeId);

  const { data: unionTypes } = await supabase
    .from("union_membership_types")
    .select("union_membership_type_id, type_name");
  const resignedMembershipId =
    (unionTypes ?? []).find((t: { type_name: string }) => t.type_name === "resigned_member")?.union_membership_type_id ??
    null;

  // ── 6. Plan + batch worker upserts ──────────────────────────────────────
  function workerDataFor(row: CampaignImportApplyRequest["rows"][number]): Record<string, unknown> {
    const occupationId = row.rawOccupation ? occupationIdByRaw.get(row.rawOccupation.toLowerCase()) ?? null : null;
    const membershipTypeId = row.rawStatus ? membershipIdByRaw.get(row.rawStatus.toLowerCase()) ?? null : null;
    const isResigned = resignedMembershipId != null && membershipTypeId === resignedMembershipId;
    const noteParts: string[] = [];
    if (row.notes?.trim()) noteParts.push(row.notes.trim());
    if (row.rawStatus?.trim()) noteParts.push(`Account status: ${row.rawStatus.trim()}`);
    return {
      first_name: row.firstName.trim(),
      last_name: row.lastName.trim(),
      preferred_name: row.preferredName || null,
      reference_id: row.referenceId || null,
      email: row.email || null,
      phone: row.phone || null,
      union_membership_type_id: membershipTypeId,
      employer_id: employerIdForKey(row.employerKey),
      worksite_id: worksiteIdForKey(row.vesselKey),
      canonical_occupation_id: occupationId,
      notes: noteParts.length > 0 ? noteParts.join(" — ") : null,
      is_active: !isResigned,
      updated_at: new Date().toISOString(),
    };
  }

  const rowWorkerId = new Map<number, number>(); // rowIndex -> worker_id
  const createList: { rowIndex: number; data: Record<string, unknown> }[] = [];
  const createIdxByRef = new Map<string, number>(); // reference -> createList index
  const rowCreateIdx = new Map<number, number>(); // rowIndex -> createList index

  for (const row of body.rows) {
    if (row.action === "skip") {
      stats.workersSkipped++;
      continue;
    }
    const data = workerDataFor(row);
    if (row.action === "update" && row.existingWorkerId) {
      const { error } = await supabase.from("workers").update(data).eq("worker_id", row.existingWorkerId);
      if (error) errors.push(`Worker ${row.firstName} ${row.lastName}: ${error.message}`);
      else {
        rowWorkerId.set(row.rowIndex, row.existingWorkerId);
        stats.workersUpdated++;
      }
      continue;
    }
    // create — collapse within-batch duplicates that share a reference id.
    if (row.referenceId && createIdxByRef.has(row.referenceId)) {
      rowCreateIdx.set(row.rowIndex, createIdxByRef.get(row.referenceId)!);
      continue;
    }
    const idx = createList.length;
    createList.push({ rowIndex: row.rowIndex, data });
    rowCreateIdx.set(row.rowIndex, idx);
    if (row.referenceId) createIdxByRef.set(row.referenceId, idx);
  }

  const createdIds: (number | null)[] = new Array(createList.length).fill(null);
  for (let start = 0; start < createList.length; start += CHUNK) {
    const slice = createList.slice(start, start + CHUNK);
    const { data, error } = await supabase.from("workers").insert(slice.map((s) => s.data)).select("worker_id");
    if (!error && data && data.length === slice.length) {
      data.forEach((d: { worker_id: number }, i: number) => {
        createdIds[start + i] = d.worker_id;
        stats.workersCreated++;
      });
    } else {
      for (let i = 0; i < slice.length; i++) {
        const { data: d, error: er } = await supabase.from("workers").insert(slice[i].data).select("worker_id").single();
        if (er) errors.push(`Worker insert failed (row ${slice[i].rowIndex}): ${er.message}`);
        else {
          createdIds[start + i] = d.worker_id;
          stats.workersCreated++;
        }
      }
    }
  }
  for (const [rowIndex, idx] of rowCreateIdx) {
    const id = createdIds[idx];
    if (id != null) rowWorkerId.set(rowIndex, id);
  }

  // assigned: every non-skip row that resolved to a worker.
  const assigned = body.rows
    .filter((row) => row.action !== "skip" && rowWorkerId.has(row.rowIndex))
    .map((row) => ({
      workerId: rowWorkerId.get(row.rowIndex)!,
      employerKey: resolveEmployerKey(row.employerKey),
      vesselKey: row.vesselKey, // original; root resolved per-employer in OU step
    }));

  // Campaign membership (batched, deduped).
  {
    const workerIds = [...new Set(assigned.map((a) => a.workerId))];
    for (const batch of chunk(workerIds.map((worker_id) => ({ campaign_id: campaignId, worker_id })), CHUNK)) {
      await supabase.from("campaign_worker_membership").upsert(batch, { onConflict: "campaign_id,worker_id", ignoreDuplicates: true });
    }
  }

  // ── 7. Build two-tier OU structure + assignments (batched) ──────────────
  // unitKey `${employerKey}::${rootVesselKey}` -> ou_id. Keyed by employer so a
  // vessel shared across employers gets one unit per employer (each pointing at
  // the same shared worksite), preserving the employer → worksite grouping.
  const unitOuIdByUnitKey = new Map<string, number>();
  const workerOuId = new Map<number, number>(); // worker_id -> their unit ou_id (for list source_ou_id)
  if (body.buildOus && assigned.length > 0) {
    // Containers: reuse existing employer group containers, create the rest.
    const containerIdByEmployerKey = new Map<string, number>();
    const employerKeys = [...new Set(assigned.map((a) => a.employerKey))];
    const { data: existingContainers } = await supabase
      .from("campaign_organising_units")
      .select("ou_id, name")
      .eq("campaign_id", campaignId)
      .eq("ou_type", "employer")
      .eq("is_group_container", true);
    const containerByName = new Map<string, number>();
    for (const c of existingContainers ?? []) containerByName.set(String(c.name).toLowerCase(), c.ou_id);
    const containersToCreate: { employerKey: string; name: string; row: Record<string, unknown> }[] = [];
    for (const ek of employerKeys) {
      const name = empBySurvivorKey.get(ek)?.canonicalName ?? ek;
      const existing = containerByName.get(name.toLowerCase());
      if (existing) {
        containerIdByEmployerKey.set(ek, existing);
      } else {
        const employerId = employerIdForKey(ek);
        containersToCreate.push({
          employerKey: ek,
          name,
          row: {
            campaign_id: campaignId,
            ou_type: "employer",
            name,
            is_group_container: true,
            source: "manual",
            unit_basis: employerId ? { employer_id: employerId } : null,
          },
        });
      }
    }
    for (let start = 0; start < containersToCreate.length; start += CHUNK) {
      const slice = containersToCreate.slice(start, start + CHUNK);
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .insert(slice.map((s) => s.row))
        .select("ou_id");
      if (!error && data && data.length === slice.length) {
        data.forEach((d: { ou_id: number }, i: number) => {
          containerIdByEmployerKey.set(slice[i].employerKey, d.ou_id);
          stats.groupsCreated++;
        });
      } else {
        errors.push(`OU groups: ${error?.message ?? "batch insert failed"}`);
      }
    }

    // Units: one per (employer, shared-worksite).
    const unitDefs: { unitKey: string; row: Record<string, unknown> }[] = [];
    const unitKeySeen = new Set<string>();
    for (const a of assigned) {
      const rootKey = resolveVesselKey(a.vesselKey);
      const unitKey = `${a.employerKey}::${rootKey}`;
      if (unitKeySeen.has(unitKey)) continue;
      const containerId = containerIdByEmployerKey.get(a.employerKey);
      if (!containerId) continue;
      unitKeySeen.add(unitKey);
      const isUnspecified = rootKey.endsWith(`||${UNSPECIFIED_VESSEL_KEY}`);
      const name =
        vesselByKey.get(a.vesselKey)?.canonicalName ??
        (isUnspecified ? "Unspecified vessel" : rootKey.split("||").pop() ?? "Unit");
      const worksiteId = worksiteIdForKey(rootKey);
      const employerId = employerIdForKey(a.employerKey);
      unitDefs.push({
        unitKey,
        row: {
          campaign_id: campaignId,
          ou_type: "worksite",
          name,
          parent_ou_id: containerId,
          ou_group_id: containerId,
          is_group_container: false,
          source: "manual",
          unit_basis: { ...(worksiteId ? { worksite_id: worksiteId } : {}), ...(employerId ? { employer_id: employerId } : {}) },
        },
      });
    }
    // Reuse existing sub-units (by container + name) so re-importing into the
    // same campaign updates the structure in place instead of duplicating it.
    const containerIds = [...new Set(unitDefs.map((u) => u.row.parent_ou_id as number))];
    const existingUnitByKey = new Map<string, number>();
    if (containerIds.length > 0) {
      const { data: existingUnits } = await supabase
        .from("campaign_organising_units")
        .select("ou_id, parent_ou_id, name")
        .eq("campaign_id", campaignId)
        .in("parent_ou_id", containerIds);
      for (const u of existingUnits ?? []) {
        existingUnitByKey.set(`${u.parent_ou_id}::${String(u.name).toLowerCase()}`, u.ou_id);
      }
    }
    const unitsToInsert = unitDefs.filter((u) => {
      const existing = existingUnitByKey.get(`${u.row.parent_ou_id}::${String(u.row.name).toLowerCase()}`);
      if (existing != null) {
        unitOuIdByUnitKey.set(u.unitKey, existing);
        return false;
      }
      return true;
    });
    for (let start = 0; start < unitsToInsert.length; start += CHUNK) {
      const slice = unitsToInsert.slice(start, start + CHUNK);
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .insert(slice.map((s) => s.row))
        .select("ou_id");
      if (!error && data && data.length === slice.length) {
        data.forEach((d: { ou_id: number }, i: number) => {
          unitOuIdByUnitKey.set(slice[i].unitKey, d.ou_id);
          stats.unitsCreated++;
        });
      } else {
        errors.push(`OU units: ${error?.message ?? "batch insert failed"}`);
      }
    }

    // Assignments: one worksite unit per worker (a campaign enforces that a worker
    // belongs to only one worksite group). Batched, with a row-by-row fallback so a
    // single trigger rejection (e.g. on re-import) can't drop a whole batch.
    const assignRows: Record<string, unknown>[] = [];
    for (const a of assigned) {
      if (workerOuId.has(a.workerId)) continue;
      const ouId = unitOuIdByUnitKey.get(`${a.employerKey}::${resolveVesselKey(a.vesselKey)}`);
      if (!ouId) continue;
      workerOuId.set(a.workerId, ouId);
      assignRows.push({ ou_id: ouId, worker_id: a.workerId, is_primary: true, assignment_source: "manual" });
    }
    for (const batch of chunk(assignRows, CHUNK)) {
      const { error } = await supabase
        .from("campaign_worker_ou")
        .upsert(batch, { onConflict: "ou_id,worker_id", ignoreDuplicates: true });
      if (!error) {
        stats.assignmentsCreated += batch.length;
      } else {
        for (const r of batch) {
          const { error: e } = await supabase
            .from("campaign_worker_ou")
            .upsert(r, { onConflict: "ou_id,worker_id", ignoreDuplicates: true });
          if (e) errors.push(`OU assignment (worker ${r.worker_id as number}): ${e.message}`);
          else stats.assignmentsCreated++;
        }
      }
    }
  }

  // ── 8. Campaign worker list + items (batched) ───────────────────────────
  if (assigned.length > 0) {
    const { data: list, error: listError } = await supabase
      .from("campaign_worker_lists")
      .insert({
        campaign_id: campaignId,
        name: body.listName?.trim() || body.fileName || "Imported list",
        source: "import",
        status: "draft",
        created_by: user.id,
      })
      .select("list_id")
      .single();
    if (listError) {
      errors.push(`Failed to create worker list: ${listError.message}`);
    } else {
      listId = list.list_id;
      const seen = new Set<number>();
      const items = assigned
        .filter((a) => {
          if (seen.has(a.workerId)) return false;
          seen.add(a.workerId);
          return true;
        })
        .map((a, i) => ({
          list_id: listId,
          worker_id: a.workerId,
          sort_order: i,
          source_ou_id: workerOuId.get(a.workerId) ?? null,
        }));
      for (const batch of chunk(items, CHUNK)) {
        const { error: itemsError } = await supabase
          .from("campaign_worker_list_items")
          .upsert(batch, { onConflict: "list_id,worker_id", ignoreDuplicates: true });
        if (itemsError) errors.push(`Failed to add list items: ${itemsError.message}`);
        else stats.listItemsCreated += batch.length;
      }
    }
  }

  // ── 9. Import log ───────────────────────────────────────────────────────
  await supabase.from("import_logs").insert({
    file_name: body.fileName,
    import_type: "campaign_lists",
    records_created: stats.workersCreated,
    records_updated: stats.workersUpdated,
    errors: errors.length > 0 ? errors.join("\n") : null,
    imported_by: user.id,
  });
  } catch (e) {
    // Never let an unexpected error become an empty 500 — the client renders the
    // returned stats/errors, so surface the failure as a normal result instead.
    errors.push(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const result: CampaignImportApplyResponse = {
    success: errors.length === 0,
    campaignId,
    listId,
    stats,
    errors,
  };
  return NextResponse.json(result);
}
