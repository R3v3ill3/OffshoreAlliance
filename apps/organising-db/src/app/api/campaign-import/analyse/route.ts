import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  normaliseForMerge,
  similarityRatio,
} from "@/lib/utils/employer-merge-helpers";
import {
  clusterByFuzzy,
  normaliseEmployer,
  normaliseGeneric,
} from "@/lib/utils/cluster-utils";
import {
  matchWorksiteCandidates,
  type WorksiteAlias,
} from "@/lib/utils/worksite-fuzzy";
import {
  matchOccupationCandidates,
  type Occupation,
  type OccupationAlias,
} from "@/lib/utils/occupation-fuzzy";
import type { Worksite } from "@/types/database";
import {
  splitCompanyName,
  resolveVesselCandidate,
  isGenericWorksite,
  suggestMembershipKey,
  type CampaignAnalyseRequest,
  type CampaignAnalyseResponse,
  type EmployerProposal,
  type VesselProposal,
  type ImportConfidence,
  type OccupationAnalyseProposal,
  type StatusAnalyseProposal,
} from "@/lib/import/campaign-import-shared";

export const runtime = "nodejs";
export const maxDuration = 120;

const UNKNOWN_EMPLOYER = "Unknown";
const UNSPECIFIED_VESSEL_KEY = "__unspecified__";

interface DbEmployer {
  employer_id: number;
  employer_name: string;
  employer_category: string | null;
}
interface DbEmployerAlias {
  employer_id: number;
  alias_name: string;
}

function matchEmployer(
  names: string[],
  dbEmployers: DbEmployer[],
  aliases: DbEmployerAlias[]
): EmployerProposal["match"] {
  let bestScore = 0;
  let best: DbEmployer | null = null;
  for (const name of names) {
    const norm = normaliseForMerge(name);
    if (!norm) continue;
    for (const emp of dbEmployers) {
      const score = similarityRatio(norm, normaliseForMerge(emp.employer_name));
      if (score > bestScore) {
        bestScore = score;
        best = emp;
      }
    }
    for (const alias of aliases) {
      const score = similarityRatio(norm, normaliseForMerge(alias.alias_name));
      if (score > bestScore) {
        bestScore = score;
        best = dbEmployers.find((e) => e.employer_id === alias.employer_id) ?? null;
      }
    }
  }
  const confidence: ImportConfidence = bestScore >= 0.85 ? "high" : bestScore >= 0.6 ? "medium" : "low";
  if (bestScore >= 0.6 && best) {
    return { matchedId: best.employer_id, matchedName: best.employer_name, confidence, isNew: false, score: bestScore };
  }
  return { matchedId: null, matchedName: null, confidence: "low", isNew: true, score: bestScore };
}

function matchVessel(
  canonical: string,
  worksites: Worksite[],
  wsAliases: WorksiteAlias[]
): VesselProposal["match"] {
  const candidates = matchWorksiteCandidates(canonical, worksites, 3, wsAliases);
  const top = candidates[0];
  const matched = top && top.confidence !== "low";
  return {
    matchedId: matched ? top.worksite.worksite_id : null,
    matchedName: matched ? top.worksite.worksite_name : null,
    confidence: matched ? top.confidence : "low",
    isNew: !matched,
    score: top?.score ?? 0,
  };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as CampaignAnalyseRequest;
    const rows = body.rows ?? [];
    const occupationValues = body.occupationValues ?? [];
    const statusValues = body.statusValues ?? [];

    // ── Load existing reference data ──────────────────────────────────────
    const [
      { data: dbEmployers },
      { data: dbEmpAliases },
      { data: dbWorksites },
      { data: dbWsAliases },
      { data: dbOccupations },
      { data: dbOccAliases },
    ] = await Promise.all([
      supabase.from("employers").select("employer_id, employer_name, employer_category"),
      supabase.from("employer_name_aliases").select("employer_id, alias_name"),
      supabase.from("worksites").select("*"),
      supabase.from("worksite_name_aliases").select("worksite_id, alias_name"),
      supabase.from("occupations").select("occupation_id, canonical_name, category"),
      supabase.from("occupation_aliases").select("occupation_id, alias_name"),
    ]);

    const employers = (dbEmployers ?? []) as DbEmployer[];
    const empAliases = (dbEmpAliases ?? []) as DbEmployerAlias[];
    const worksites = (dbWorksites ?? []) as Worksite[];
    const wsAliases = (dbWsAliases ?? []) as WorksiteAlias[];
    const occupations = (dbOccupations ?? []) as Occupation[];
    const occAliases = (dbOccAliases ?? []) as OccupationAlias[];

    // ── 1. Cluster employers ──────────────────────────────────────────────
    const empCounts = new Map<string, number>();
    for (const row of rows) {
      const { employer } = splitCompanyName(row.companyName);
      const key = employer || UNKNOWN_EMPLOYER;
      empCounts.set(key, (empCounts.get(key) ?? 0) + 1);
    }
    const employerClusters = clusterByFuzzy([...empCounts.keys()], normaliseEmployer, 0.78, empCounts);
    employerClusters.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

    // raw employer string -> cluster canonical (the employerKey)
    const employerKeyByRaw = new Map<string, string>();
    for (const cluster of employerClusters) {
      for (const v of cluster.variants) employerKeyByRaw.set(v, cluster.canonicalName);
    }

    // ── 2. Cluster vessels within each employer ───────────────────────────
    // employerKey -> { rawVessel -> canonicalVessel }
    const vesselCanonicalByEmployer = new Map<string, Map<string, string>>();
    // employerKey -> VesselProposal[]
    const vesselsByEmployer = new Map<string, VesselProposal[]>();

    for (const cluster of employerClusters) {
      const employerKey = cluster.canonicalName;
      const vesselCounts = new Map<string, number>();
      let genericCount = 0;

      for (const row of rows) {
        const { employer } = splitCompanyName(row.companyName);
        const rawEmp = employer || UNKNOWN_EMPLOYER;
        if (employerKeyByRaw.get(rawEmp) !== employerKey) continue;
        const candidate = resolveVesselCandidate(row.companyName, row.worksite);
        if (isGenericWorksite(candidate)) {
          genericCount++;
          continue;
        }
        vesselCounts.set(candidate, (vesselCounts.get(candidate) ?? 0) + 1);
      }

      const vesselClusters = clusterByFuzzy([...vesselCounts.keys()], normaliseGeneric, 0.72, vesselCounts);
      vesselClusters.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

      const rawToCanonical = new Map<string, string>();
      const proposals: VesselProposal[] = [];
      for (const vc of vesselClusters) {
        for (const v of vc.variants) rawToCanonical.set(v, vc.canonicalName);
        proposals.push({
          key: `${employerKey}||${vc.canonicalName}`,
          canonicalName: vc.canonicalName,
          variants: vc.variants,
          count: vc.occurrenceCount,
          isGeneric: false,
          match: matchVessel(vc.canonicalName, worksites, wsAliases),
        });
      }

      // Synthetic "Unspecified vessel" bucket for generic / blank values.
      if (genericCount > 0) {
        proposals.push({
          key: `${employerKey}||${UNSPECIFIED_VESSEL_KEY}`,
          canonicalName: "Unspecified vessel",
          variants: [],
          count: genericCount,
          isGeneric: true,
          match: { matchedId: null, matchedName: null, confidence: "low", isNew: true, score: 0 },
        });
      }

      vesselCanonicalByEmployer.set(employerKey, rawToCanonical);
      vesselsByEmployer.set(employerKey, proposals);
    }

    // ── 3. Employer proposals (with nested vessels) ───────────────────────
    const employerProposals: EmployerProposal[] = employerClusters.map((cluster) => {
      const employerKey = cluster.canonicalName;
      const match = matchEmployer([cluster.canonicalName, ...cluster.variants], employers, empAliases);
      return {
        key: employerKey,
        canonicalName: cluster.canonicalName,
        variants: cluster.variants,
        count: cluster.occurrenceCount,
        match,
        vessels: vesselsByEmployer.get(employerKey) ?? [],
      };
    });

    // ── 4. Occupation proposals ───────────────────────────────────────────
    const occupationProposals: OccupationAnalyseProposal[] = occupationValues.map((ov) => {
      const candidates = matchOccupationCandidates(ov.value, occupations, occAliases, 3);
      const top = candidates[0];
      const matched = top && top.confidence !== "low";
      return {
        rawValue: ov.value,
        count: ov.count,
        matchedOccupationId: matched ? top.occupation.occupation_id : null,
        matchedOccupationName: matched ? top.occupation.canonical_name : null,
        createName: matched ? null : ov.value,
        confidence: matched ? top.confidence : ("low" as ImportConfidence),
      };
    });

    // ── 5. Status proposals ───────────────────────────────────────────────
    const statusProposals: StatusAnalyseProposal[] = statusValues.map((sv) => {
      const { key, confident } = suggestMembershipKey(sv.value);
      return { rawValue: sv.value, count: sv.count, membershipKey: key, confident };
    });

    // ── 6. Row assignments ────────────────────────────────────────────────
    const rowAssignments = rows.map((row) => {
      const { employer } = splitCompanyName(row.companyName);
      const rawEmp = employer || UNKNOWN_EMPLOYER;
      const employerKey = employerKeyByRaw.get(rawEmp) ?? UNKNOWN_EMPLOYER;
      const candidate = resolveVesselCandidate(row.companyName, row.worksite);
      let vesselKey: string;
      if (isGenericWorksite(candidate)) {
        vesselKey = `${employerKey}||${UNSPECIFIED_VESSEL_KEY}`;
      } else {
        const canonical = vesselCanonicalByEmployer.get(employerKey)?.get(candidate) ?? candidate;
        vesselKey = `${employerKey}||${canonical}`;
      }
      return { employerKey, vesselKey };
    });

    const result: CampaignAnalyseResponse = {
      success: true,
      employers: employerProposals,
      occupations: occupationProposals,
      statuses: statusProposals,
      rowAssignments,
    };
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
