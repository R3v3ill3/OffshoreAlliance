import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ─── Payload types ──────────────────────────────────────────────────────────

interface EmployerMapping {
  canonicalName: string;
  variants: string[];
  action: "match" | "create" | "skip";
  matchedEmployerId?: number;
  newCategory?: string;
}

interface WorksiteMapping {
  canonicalName: string;
  variants: string[];
  action: "match" | "create" | "skip";
  matchedWorksiteId?: number;
  newWorksiteType?: string;
}

interface OccupationMapping {
  canonicalName: string;
  variants: string[];
  action: "match" | "create" | "skip";
  matchedOccupationId?: number;
  category?: string;
}

interface ConnectionMapping {
  employerName: string;
  worksiteName: string;
  employerId: number;
  worksiteId: number;
  roleType: string;
  add: boolean;
}

interface ApplyPayload {
  employers: EmployerMapping[];
  worksites: WorksiteMapping[];
  occupations: OccupationMapping[];
  connections: ConnectionMapping[];
  fileName: string;
}

async function insertAliases(
  supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>,
  table: string,
  fkColumn: string,
  fkId: number,
  canonicalName: string,
  variants: string[],
  userId: string
): Promise<number> {
  let count = 0;
  const canonLower = canonicalName.toLowerCase().trim();

  for (const variant of variants) {
    const varLower = variant.toLowerCase().trim();
    if (!varLower || varLower === canonLower) continue;
    try {
      const { error } = await (supabase as any).from(table).insert({
        [fkColumn]: fkId,
        alias_name: variant.trim(),
        source: "import",
        created_by: userId,
      });
      if (!error) count++;
    } catch {
      // unique constraint violations are expected -- skip
    }
  }
  return count;
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
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

    const payload = (await req.json()) as ApplyPayload;

    const stats = {
      employersCreated: 0,
      employerAliasesCreated: 0,
      worksitesCreated: 0,
      worksiteAliasesCreated: 0,
      occupationsCreated: 0,
      occupationAliasesCreated: 0,
      connectionsCreated: 0,
      errors: [] as string[],
    };

    // ── 1. Employers ──────────────────────────────────────────────────────

    for (const emp of payload.employers) {
      try {
        if (emp.action === "skip") continue;

        let employerId: number | undefined = emp.matchedEmployerId;

        if (emp.action === "create") {
          const { data, error } = await supabase
            .from("employers")
            .insert({
              employer_name: emp.canonicalName,
              employer_category: emp.newCategory || null,
            })
            .select("employer_id")
            .single();
          if (error) throw error;
          stats.employersCreated++;
          employerId = data.employer_id;
        }

        if (employerId) {
          const aliasCount = await insertAliases(
            supabase as any,
            "employer_name_aliases",
            "employer_id",
            employerId,
            emp.canonicalName,
            emp.variants,
            user.id
          );
          stats.employerAliasesCreated += aliasCount;
        }
      } catch (err) {
        stats.errors.push(
          `Employer "${emp.canonicalName}": ${err instanceof Error ? err.message : "unknown error"}`
        );
      }
    }

    // ── 2. Worksites ──────────────────────────────────────────────────────

    for (const ws of payload.worksites) {
      try {
        if (ws.action === "skip") continue;

        let worksiteId: number | undefined = ws.matchedWorksiteId;

        if (ws.action === "create") {
          const { data, error } = await supabase
            .from("worksites")
            .insert({
              worksite_name: ws.canonicalName,
              worksite_type: ws.newWorksiteType || "Other",
            })
            .select("worksite_id")
            .single();
          if (error) throw error;
          stats.worksitesCreated++;
          worksiteId = data.worksite_id;
        }

        if (worksiteId) {
          const aliasCount = await insertAliases(
            supabase as any,
            "worksite_name_aliases",
            "worksite_id",
            worksiteId,
            ws.canonicalName,
            ws.variants,
            user.id
          );
          stats.worksiteAliasesCreated += aliasCount;
        }
      } catch (err) {
        stats.errors.push(
          `Worksite "${ws.canonicalName}": ${err instanceof Error ? err.message : "unknown error"}`
        );
      }
    }

    // ── 3. Occupations ────────────────────────────────────────────────────

    for (const occ of payload.occupations) {
      try {
        if (occ.action === "skip") continue;

        let occupationId: number | undefined = occ.matchedOccupationId;

        if (occ.action === "create") {
          const { data, error } = await supabase
            .from("occupations")
            .insert({
              canonical_name: occ.canonicalName,
              category: occ.category || null,
            })
            .select("occupation_id")
            .single();
          if (error) throw error;
          stats.occupationsCreated++;
          occupationId = data.occupation_id;
        }

        if (occupationId) {
          const aliasCount = await insertAliases(
            supabase as any,
            "occupation_aliases",
            "occupation_id",
            occupationId,
            occ.canonicalName,
            occ.variants,
            user.id
          );
          stats.occupationAliasesCreated += aliasCount;
        }
      } catch (err) {
        stats.errors.push(
          `Occupation "${occ.canonicalName}": ${err instanceof Error ? err.message : "unknown error"}`
        );
      }
    }

    // ── 4. Employer-worksite connections ───────────────────────────────────

    for (const conn of payload.connections) {
      if (!conn.add) continue;
      try {
        const { data: existing } = await supabase
          .from("employer_worksite_roles")
          .select("id")
          .eq("employer_id", conn.employerId)
          .eq("worksite_id", conn.worksiteId)
          .eq("role_type", conn.roleType)
          .limit(1);

        if (!existing || existing.length === 0) {
          const { error } = await supabase
            .from("employer_worksite_roles")
            .insert({
              employer_id: conn.employerId,
              worksite_id: conn.worksiteId,
              role_type: conn.roleType,
              is_current: true,
            });
          if (error) throw error;
          stats.connectionsCreated++;
        }
      } catch (err) {
        stats.errors.push(
          `Connection ${conn.employerName} -> ${conn.worksiteName}: ${
            err instanceof Error ? err.message : "unknown error"
          }`
        );
      }
    }

    // ── 5. Import log ─────────────────────────────────────────────────────

    await supabase.from("import_logs").insert({
      file_name: payload.fileName,
      import_type: "reference_data",
      records_created:
        stats.employersCreated +
        stats.worksitesCreated +
        stats.occupationsCreated,
      records_updated:
        stats.employerAliasesCreated +
        stats.worksiteAliasesCreated +
        stats.occupationAliasesCreated +
        stats.connectionsCreated,
      errors:
        stats.errors.length > 0 ? stats.errors.join("\n") : null,
      imported_by: user.id,
    });

    return NextResponse.json({ success: true, stats });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
