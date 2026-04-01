import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ─── Payload types ──────────────────────────────────────────────────────────

interface EmployerMapping {
  rawName: string;
  action: "match" | "create" | "skip";
  matchedEmployerId?: number;
  newCategory?: string;
}

interface WorksiteMapping {
  rawName: string;
  parts: {
    part: string;
    action: "match" | "create" | "skip";
    matchedWorksiteId?: number;
    newWorksiteType?: string;
  }[];
}

interface OccupationMapping {
  rawName: string;
  parts: {
    part: string;
    action: "match" | "create" | "skip";
    matchedOccupationId?: number;
    canonicalName?: string;
    category?: string;
  }[];
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

        if (emp.action === "create") {
          const { data, error } = await supabase
            .from("employers")
            .insert({
              employer_name: emp.rawName,
              employer_category: emp.newCategory || null,
            })
            .select("employer_id")
            .single();
          if (error) throw error;
          stats.employersCreated++;
          // The raw name IS the canonical name, no alias needed
          emp.matchedEmployerId = data.employer_id;
        }

        if (emp.action === "match" && emp.matchedEmployerId) {
          const { data: existing } = await supabase
            .from("employers")
            .select("employer_name")
            .eq("employer_id", emp.matchedEmployerId)
            .single();

          if (
            existing &&
            existing.employer_name.toLowerCase().trim() !==
              emp.rawName.toLowerCase().trim()
          ) {
            const { error } = await supabase
              .from("employer_name_aliases")
              .upsert(
                {
                  employer_id: emp.matchedEmployerId,
                  alias_name: emp.rawName,
                  source: "import" as const,
                  created_by: user.id,
                },
                { onConflict: "employer_id,alias_name", ignoreDuplicates: true }
              );
            if (!error) stats.employerAliasesCreated++;
          }
        }
      } catch (err) {
        stats.errors.push(
          `Employer "${emp.rawName}": ${err instanceof Error ? err.message : "unknown error"}`
        );
      }
    }

    // ── 2. Worksites ──────────────────────────────────────────────────────

    for (const ws of payload.worksites) {
      for (const part of ws.parts) {
        try {
          if (part.action === "skip") continue;

          if (part.action === "create") {
            const { data, error } = await supabase
              .from("worksites")
              .insert({
                worksite_name: part.part,
                worksite_type: part.newWorksiteType || "Other",
              })
              .select("worksite_id")
              .single();
            if (error) throw error;
            stats.worksitesCreated++;
            part.matchedWorksiteId = data.worksite_id;
          }

          if (part.action === "match" && part.matchedWorksiteId) {
            const { data: existing } = await supabase
              .from("worksites")
              .select("worksite_name")
              .eq("worksite_id", part.matchedWorksiteId)
              .single();

            if (
              existing &&
              existing.worksite_name.toLowerCase().trim() !==
                part.part.toLowerCase().trim()
            ) {
              const { error } = await supabase
                .from("worksite_name_aliases")
                .insert({
                  worksite_id: part.matchedWorksiteId,
                  alias_name: part.part,
                  source: "import" as const,
                  created_by: user.id,
                });
              if (!error) stats.worksiteAliasesCreated++;
            }

            // Also add the original compound name as an alias if this was a split
            if (ws.parts.length > 1 && ws.rawName !== part.part) {
              await supabase.from("worksite_name_aliases").insert({
                worksite_id: part.matchedWorksiteId,
                alias_name: ws.rawName,
                source: "import" as const,
                created_by: user.id,
              });
            }
          }
        } catch (err) {
          stats.errors.push(
            `Worksite "${part.part}": ${err instanceof Error ? err.message : "unknown error"}`
          );
        }
      }
    }

    // ── 3. Occupations ────────────────────────────────────────────────────

    for (const occ of payload.occupations) {
      for (const part of occ.parts) {
        try {
          if (part.action === "skip") continue;

          if (part.action === "create") {
            const canonicalName = part.canonicalName || part.part;
            const { data, error } = await supabase
              .from("occupations")
              .insert({
                canonical_name: canonicalName,
                category: part.category || null,
              })
              .select("occupation_id")
              .single();
            if (error) throw error;
            stats.occupationsCreated++;
            part.matchedOccupationId = data.occupation_id;

            // If the raw part differs from canonical, add as alias
            if (
              part.part.toLowerCase().trim() !==
              canonicalName.toLowerCase().trim()
            ) {
              await supabase.from("occupation_aliases").insert({
                occupation_id: data.occupation_id,
                alias_name: part.part,
                source: "import" as const,
                created_by: user.id,
              });
              stats.occupationAliasesCreated++;
            }
          }

          if (part.action === "match" && part.matchedOccupationId) {
            const { data: existing } = await supabase
              .from("occupations")
              .select("canonical_name")
              .eq("occupation_id", part.matchedOccupationId)
              .single();

            if (
              existing &&
              existing.canonical_name.toLowerCase().trim() !==
                part.part.toLowerCase().trim()
            ) {
              const { error } = await supabase
                .from("occupation_aliases")
                .insert({
                  occupation_id: part.matchedOccupationId,
                  alias_name: part.part,
                  source: "import" as const,
                  created_by: user.id,
                });
              if (!error) stats.occupationAliasesCreated++;
            }
          }
        } catch (err) {
          stats.errors.push(
            `Occupation "${part.part}": ${err instanceof Error ? err.message : "unknown error"}`
          );
        }
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
