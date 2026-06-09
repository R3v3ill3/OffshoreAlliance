import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type {
  CampaignImportApplyRequest,
  CampaignImportApplyResponse,
  ApplyEmployer,
  ApplyVessel,
} from "@/lib/import/campaign-import-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

const UNSPECIFIED_VESSEL_KEY = "__unspecified__";

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

async function ensureOccupation(supabase: Supa, name: string): Promise<number> {
  const trimmed = name.trim();
  const { data: existing } = await supabase
    .from("occupations")
    .select("occupation_id")
    .ilike("canonical_name", trimmed)
    .limit(1)
    .maybeSingle();
  if (existing?.occupation_id) return existing.occupation_id;
  const { data, error } = await supabase
    .from("occupations")
    .insert({ canonical_name: trimmed, is_active: true })
    .select("occupation_id")
    .single();
  if (error) throw error;
  return data.occupation_id;
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

  // ── 1. Resolve / create campaign ────────────────────────────────────────
  let campaignId = body.campaignId ?? null;
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

  // ── 2. Resolve / create employers ───────────────────────────────────────
  const resolveEmployerKey = buildKeyResolver(body.employers as ApplyEmployer[]);
  const empBySurvivorKey = new Map<string, ApplyEmployer>();
  for (const e of body.employers) {
    if (!e.mergeIntoKey) empBySurvivorKey.set(e.key, e);
  }
  const employerIdBySurvivorKey = new Map<string, number>();
  for (const [key, emp] of empBySurvivorKey) {
    try {
      let employerId = emp.matchedEmployerId ?? null;
      if (emp.action === "create") {
        const { data, error } = await supabase
          .from("employers")
          .insert({ employer_name: emp.canonicalName, employer_category: emp.newCategory || null })
          .select("employer_id")
          .single();
        if (error) throw error;
        employerId = data.employer_id;
        stats.employersCreated++;
      }
      if (employerId) {
        employerIdBySurvivorKey.set(key, employerId);
        // Persist spelling variants as aliases (source must be 'merge'|'manual').
        const canonLower = emp.canonicalName.toLowerCase().trim();
        for (const variant of emp.variants) {
          const vLower = variant.toLowerCase().trim();
          if (!vLower || vLower === canonLower) continue;
          await supabase
            .from("employer_name_aliases")
            .insert({ employer_id: employerId, alias_name: variant.trim(), source: "manual", created_by: user.id });
        }
      }
    } catch (err) {
      errors.push(`Employer "${emp.canonicalName}": ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }
  const employerIdForKey = (key: string): number | null =>
    employerIdBySurvivorKey.get(resolveEmployerKey(key)) ?? null;

  // ── 3. Resolve / create vessels (worksites) ─────────────────────────────
  const resolveVesselKey = buildKeyResolver(body.vessels as ApplyVessel[]);
  const vesselBySurvivorKey = new Map<string, ApplyVessel>();
  for (const v of body.vessels) {
    if (!v.mergeIntoKey) vesselBySurvivorKey.set(v.key, v);
  }
  const worksiteIdBySurvivorKey = new Map<string, number | null>();
  for (const [key, vessel] of vesselBySurvivorKey) {
    try {
      const employerId = employerIdForKey(vessel.employerKey);
      if (vessel.action === "unspecified" || vessel.canonicalName === "Unspecified vessel") {
        worksiteIdBySurvivorKey.set(key, null);
        continue;
      }
      let worksiteId = vessel.matchedWorksiteId ?? null;
      if (vessel.action === "create") {
        const { data, error } = await supabase
          .from("worksites")
          .insert({
            worksite_name: vessel.canonicalName,
            worksite_type: vessel.newWorksiteType || "Other",
            ...(employerId ? { principal_employer_id: employerId } : {}),
          })
          .select("worksite_id")
          .single();
        if (error) throw error;
        worksiteId = data.worksite_id;
        stats.worksitesCreated++;
        const canonLower = vessel.canonicalName.toLowerCase().trim();
        for (const variant of vessel.variants) {
          const vLower = variant.toLowerCase().trim();
          if (!vLower || vLower === canonLower) continue;
          await supabase
            .from("worksite_name_aliases")
            .insert({ worksite_id: worksiteId, alias_name: variant.trim(), source: "import", created_by: user.id });
        }
      }
      worksiteIdBySurvivorKey.set(key, worksiteId);
      // Link worksite to its employer when we have both.
      if (worksiteId && employerId) {
        await supabase
          .from("employer_worksite_roles")
          .upsert(
            { employer_id: employerId, worksite_id: worksiteId, role_type: "Operator", is_current: true },
            { onConflict: "employer_id,worksite_id,role_type", ignoreDuplicates: true }
          );
      }
    } catch (err) {
      errors.push(`Vessel "${vessel.canonicalName}": ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }
  const worksiteIdForKey = (key: string): number | null =>
    worksiteIdBySurvivorKey.get(resolveVesselKey(key)) ?? null;

  // ── 4. campaign_employers + campaign_worksites junctions ────────────────
  for (const employerId of new Set(employerIdBySurvivorKey.values())) {
    await supabase
      .from("campaign_employers")
      .upsert({ campaign_id: campaignId, employer_id: employerId }, { onConflict: "campaign_id,employer_id", ignoreDuplicates: true });
  }
  for (const worksiteId of new Set([...worksiteIdBySurvivorKey.values()].filter((w): w is number => w != null))) {
    const { data: existing } = await supabase
      .from("campaign_worksites")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("worksite_id", worksiteId)
      .limit(1);
    if (!existing || existing.length === 0) {
      await supabase.from("campaign_worksites").insert({ campaign_id: campaignId, worksite_id: worksiteId });
    }
  }

  // ── 5. Occupation + status lookups ──────────────────────────────────────
  const occupationIdByRaw = new Map<string, number | null>();
  for (const occ of body.occupations) {
    try {
      if (occ.action === "skip") {
        occupationIdByRaw.set(occ.rawValue.toLowerCase(), null);
        continue;
      }
      let occupationId = occ.matchedOccupationId ?? null;
      if (occ.action === "create" && occ.createName?.trim()) {
        occupationId = await ensureOccupation(supabase, occ.createName);
      }
      occupationIdByRaw.set(occ.rawValue.toLowerCase(), occupationId);
      // Record the raw job title as an alias for future matching.
      if (occupationId) {
        const { data: canon } = await supabase
          .from("occupations")
          .select("canonical_name")
          .eq("occupation_id", occupationId)
          .single();
        if (canon && canon.canonical_name.toLowerCase().trim() !== occ.rawValue.toLowerCase().trim()) {
          await supabase
            .from("occupation_aliases")
            .insert({ occupation_id: occupationId, alias_name: occ.rawValue.trim(), source: "import", created_by: user.id });
        }
      }
    } catch (err) {
      errors.push(`Occupation "${occ.rawValue}": ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }
  const membershipIdByRaw = new Map<string, number | null>();
  for (const s of body.statuses) membershipIdByRaw.set(s.rawValue.toLowerCase(), s.membershipTypeId);

  const { data: unionTypes } = await supabase
    .from("union_membership_types")
    .select("union_membership_type_id, type_name");
  const resignedMembershipId =
    (unionTypes ?? []).find((t: { type_name: string }) => t.type_name === "resigned_member")?.union_membership_type_id ??
    null;

  // ── 6. Upsert workers ───────────────────────────────────────────────────
  interface Assigned {
    workerId: number;
    employerKey: string;
    vesselKey: string;
  }
  const assigned: Assigned[] = [];
  const workerIdByReference = new Map<string, number>();

  for (const row of body.rows) {
    if (row.action === "skip") {
      stats.workersSkipped++;
      continue;
    }
    try {
      const employerId = employerIdForKey(row.employerKey);
      const worksiteId = worksiteIdForKey(row.vesselKey);
      const occupationId = row.rawOccupation
        ? occupationIdByRaw.get(row.rawOccupation.toLowerCase()) ?? null
        : null;
      const membershipTypeId = row.rawStatus
        ? membershipIdByRaw.get(row.rawStatus.toLowerCase()) ?? null
        : null;
      const isResigned = resignedMembershipId != null && membershipTypeId === resignedMembershipId;

      const noteParts: string[] = [];
      if (row.notes?.trim()) noteParts.push(row.notes.trim());
      if (row.rawStatus?.trim()) noteParts.push(`Account status: ${row.rawStatus.trim()}`);
      const notes = noteParts.length > 0 ? noteParts.join(" — ") : null;

      const workerData: Record<string, unknown> = {
        first_name: row.firstName.trim(),
        last_name: row.lastName.trim(),
        preferred_name: row.preferredName || null,
        reference_id: row.referenceId || null,
        email: row.email || null,
        phone: row.phone || null,
        union_membership_type_id: membershipTypeId,
        employer_id: employerId,
        worksite_id: worksiteId,
        canonical_occupation_id: occupationId,
        notes,
        is_active: !isResigned,
        updated_at: new Date().toISOString(),
      };

      // Guard against double-creating the same member from multiple files.
      let action = row.action;
      let existingWorkerId = row.existingWorkerId;
      if (action === "create" && row.referenceId) {
        const seen = workerIdByReference.get(row.referenceId);
        if (seen) {
          action = "update";
          existingWorkerId = seen;
        }
      }

      let workerId: number | null = null;
      if (action === "update" && existingWorkerId) {
        const { error } = await supabase.from("workers").update(workerData).eq("worker_id", existingWorkerId);
        if (error) throw error;
        workerId = existingWorkerId;
        stats.workersUpdated++;
      } else {
        const { data, error } = await supabase.from("workers").insert(workerData).select("worker_id").single();
        if (error) throw error;
        workerId = data.worker_id;
        stats.workersCreated++;
      }

      if (workerId) {
        if (row.referenceId) workerIdByReference.set(row.referenceId, workerId);
        await supabase
          .from("campaign_worker_membership")
          .upsert({ campaign_id: campaignId, worker_id: workerId }, { onConflict: "campaign_id,worker_id", ignoreDuplicates: true });
        assigned.push({
          workerId,
          employerKey: resolveEmployerKey(row.employerKey),
          vesselKey: resolveVesselKey(row.vesselKey),
        });
      }
    } catch (err) {
      errors.push(`Worker ${row.firstName} ${row.lastName}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  // ── 7. Build two-tier OU structure + assignments ────────────────────────
  // vesselKey -> leaf unit ou_id (built lazily). Records workers per unit too.
  const unitOuIdByVesselKey = new Map<string, number>();
  if (body.buildOus) {
    const containerOuIdByEmployerKey = new Map<string, number>();

    async function ensureContainer(employerKey: string): Promise<number | null> {
      if (containerOuIdByEmployerKey.has(employerKey)) return containerOuIdByEmployerKey.get(employerKey)!;
      const emp = empBySurvivorKey.get(employerKey);
      const name = emp?.canonicalName ?? employerKey;
      const employerId = employerIdForKey(employerKey);
      // Reuse an existing employer container of the same name if present.
      const { data: existing } = await supabase
        .from("campaign_organising_units")
        .select("ou_id")
        .eq("campaign_id", campaignId)
        .eq("ou_type", "employer")
        .eq("is_group_container", true)
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      let containerId = existing?.ou_id ?? null;
      if (!containerId) {
        const { data, error } = await supabase
          .from("campaign_organising_units")
          .insert({
            campaign_id: campaignId,
            ou_type: "employer",
            name,
            is_group_container: true,
            source: "manual",
            unit_basis: employerId ? { employer_id: employerId } : null,
          })
          .select("ou_id")
          .single();
        if (error) throw error;
        containerId = data.ou_id;
        stats.groupsCreated++;
      }
      containerOuIdByEmployerKey.set(employerKey, containerId);
      return containerId;
    }

    async function ensureUnit(employerKey: string, vesselKey: string): Promise<number | null> {
      if (unitOuIdByVesselKey.has(vesselKey)) return unitOuIdByVesselKey.get(vesselKey)!;
      const containerId = await ensureContainer(employerKey);
      if (!containerId) return null;
      const vessel = vesselBySurvivorKey.get(vesselKey);
      const isUnspecified = vesselKey.endsWith(`||${UNSPECIFIED_VESSEL_KEY}`);
      const name = vessel?.canonicalName ?? (isUnspecified ? "Unspecified vessel" : vesselKey.split("||").pop() ?? "Unit");
      const worksiteId = worksiteIdForKey(vesselKey);
      const employerId = employerIdForKey(employerKey);
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .insert({
          campaign_id: campaignId,
          ou_type: "worksite",
          name,
          parent_ou_id: containerId,
          ou_group_id: containerId,
          is_group_container: false,
          source: "manual",
          unit_basis: { ...(worksiteId ? { worksite_id: worksiteId } : {}), ...(employerId ? { employer_id: employerId } : {}) },
        })
        .select("ou_id")
        .single();
      if (error) throw error;
      unitOuIdByVesselKey.set(vesselKey, data.ou_id);
      stats.unitsCreated++;
      return data.ou_id;
    }

    for (const a of assigned) {
      try {
        const ouId = await ensureUnit(a.employerKey, a.vesselKey);
        if (!ouId) continue;
        const { error } = await supabase
          .from("campaign_worker_ou")
          .upsert(
            { ou_id: ouId, worker_id: a.workerId, is_primary: true, assignment_source: "manual" },
            { onConflict: "ou_id,worker_id", ignoreDuplicates: true }
          );
        if (error) throw error;
        stats.assignmentsCreated++;
      } catch (err) {
        errors.push(`OU assignment for worker ${a.workerId}: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }
  }

  // ── 8. Campaign worker list + items ─────────────────────────────────────
  let listId: number | null = null;
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
          source_ou_id: unitOuIdByVesselKey.get(a.vesselKey) ?? null,
        }));
      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from("campaign_worker_list_items")
          .upsert(items, { onConflict: "list_id,worker_id", ignoreDuplicates: true });
        if (itemsError) errors.push(`Failed to add list items: ${itemsError.message}`);
        else stats.listItemsCreated = items.length;
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

  const result: CampaignImportApplyResponse = {
    success: errors.length === 0,
    campaignId,
    listId,
    stats,
    errors,
  };
  return NextResponse.json(result);
}
