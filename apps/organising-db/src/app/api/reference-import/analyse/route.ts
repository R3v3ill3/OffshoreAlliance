import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  normaliseForMerge,
  similarityRatio,
} from "@/lib/utils/employer-merge-helpers";
import {
  matchWorksiteCandidates,
  type WorksiteAlias,
} from "@/lib/utils/worksite-fuzzy";
import {
  matchOccupationCandidates,
  type Occupation,
  type OccupationAlias,
} from "@/lib/utils/occupation-fuzzy";

// ─── Types ──────────────────────────────────────────────────────────────────

export type Confidence = "high" | "medium" | "low";

export interface ClusterInput {
  canonicalName: string;
  variants: string[];
  suggestedCategory?: string | null;
}

export interface EmployerProposal {
  canonicalName: string;
  variants: string[];
  matchedEmployerId: number | null;
  matchedEmployerName: string | null;
  confidence: Confidence;
  isNew: boolean;
  score: number;
}

export interface WorksiteProposal {
  canonicalName: string;
  variants: string[];
  matchedWorksiteId: number | null;
  matchedWorksiteName: string | null;
  confidence: Confidence;
  isNew: boolean;
  isPrincipalEmployerName: boolean;
  score: number;
}

export interface OccupationProposal {
  canonicalName: string;
  variants: string[];
  suggestedCategory: string | null;
  matchedOccupationId: number | null;
  matchedOccupationName: string | null;
  confidence: Confidence;
  isNew: boolean;
  score: number;
}

export interface EmployerWorksiteConnection {
  employerName: string;
  worksiteName: string;
  occurrences: number;
}

export interface AnalyseResult {
  success: true;
  employers: EmployerProposal[];
  worksites: WorksiteProposal[];
  occupations: OccupationProposal[];
  connections: EmployerWorksiteConnection[];
}

// ─── Employer matching ──────────────────────────────────────────────────────

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
  cluster: ClusterInput,
  dbEmployers: DbEmployer[],
  aliases: DbEmployerAlias[]
): EmployerProposal {
  const namesToTry = [cluster.canonicalName, ...cluster.variants];
  let bestScore = 0;
  let bestMatch: DbEmployer | null = null;

  for (const name of namesToTry) {
    const normRaw = normaliseForMerge(name);
    for (const emp of dbEmployers) {
      const score = similarityRatio(normRaw, normaliseForMerge(emp.employer_name));
      if (score > bestScore) {
        bestScore = score;
        bestMatch = emp;
      }
    }
    for (const alias of aliases) {
      const score = similarityRatio(normRaw, normaliseForMerge(alias.alias_name));
      if (score > bestScore) {
        bestScore = score;
        bestMatch =
          dbEmployers.find((e) => e.employer_id === alias.employer_id) ?? null;
      }
    }
  }

  const confidence: Confidence =
    bestScore >= 0.85 ? "high" : bestScore >= 0.6 ? "medium" : "low";

  if (bestScore >= 0.6 && bestMatch) {
    return {
      canonicalName: cluster.canonicalName,
      variants: cluster.variants,
      matchedEmployerId: bestMatch.employer_id,
      matchedEmployerName: bestMatch.employer_name,
      confidence,
      isNew: false,
      score: bestScore,
    };
  }

  return {
    canonicalName: cluster.canonicalName,
    variants: cluster.variants,
    matchedEmployerId: null,
    matchedEmployerName: null,
    confidence: "low",
    isNew: true,
    score: bestScore,
  };
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

    const body = await req.json();
    const {
      employerClusters,
      worksiteClusters,
      occupationClusters,
      rows,
    } = body as {
      employerClusters: ClusterInput[];
      worksiteClusters: ClusterInput[];
      occupationClusters: ClusterInput[];
      rows: { employer: string; worksite: string; occupation: string }[];
    };

    // Fetch existing data
    const [
      { data: dbEmployers },
      { data: dbEmpAliases },
      { data: dbWorksites },
      { data: dbWsAliases },
      { data: dbOccupations },
      { data: dbOccAliases },
    ] = await Promise.all([
      supabase
        .from("employers")
        .select("employer_id, employer_name, employer_category"),
      supabase
        .from("employer_name_aliases")
        .select("employer_id, alias_name"),
      supabase.from("worksites").select("*"),
      supabase
        .from("worksite_name_aliases")
        .select("worksite_id, alias_name"),
      supabase
        .from("occupations")
        .select("occupation_id, canonical_name, category"),
      supabase
        .from("occupation_aliases")
        .select("occupation_id, alias_name"),
    ]);

    const employers = (dbEmployers ?? []) as DbEmployer[];
    const empAliases = (dbEmpAliases ?? []) as DbEmployerAlias[];
    const worksites = dbWorksites ?? [];
    const wsAliases = (dbWsAliases ?? []) as WorksiteAlias[];
    const occupations = (dbOccupations ?? []) as Occupation[];
    const occAliases = (dbOccAliases ?? []) as OccupationAlias[];

    const principalEmployerNames = new Set(
      employers
        .filter((e) => e.employer_category === "Principal_Employer")
        .map((e) => e.employer_name.toLowerCase())
    );

    // 1. Employer proposals (one per cluster)
    const employerProposals = employerClusters.map((c) =>
      matchEmployer(c, employers, empAliases)
    );

    // 2. Worksite proposals (one per cluster)
    const worksiteProposals: WorksiteProposal[] = worksiteClusters.map((c) => {
      const isPe = principalEmployerNames.has(c.canonicalName.toLowerCase());
      const candidates = matchWorksiteCandidates(
        c.canonicalName,
        worksites,
        3,
        wsAliases
      );
      const top = candidates[0];
      const matched = top && top.confidence !== "low";

      return {
        canonicalName: c.canonicalName,
        variants: c.variants,
        matchedWorksiteId: matched ? top.worksite.worksite_id : null,
        matchedWorksiteName: matched ? top.worksite.worksite_name : null,
        confidence: matched ? top.confidence : ("low" as Confidence),
        isNew: !matched,
        isPrincipalEmployerName: isPe,
        score: top?.score ?? 0,
      };
    });

    // 3. Occupation proposals (one per cluster)
    const occupationProposals: OccupationProposal[] = occupationClusters.map(
      (c) => {
        const candidates = matchOccupationCandidates(
          c.canonicalName,
          occupations,
          occAliases,
          3
        );
        const top = candidates[0];
        const matched = top && top.confidence !== "low";

        return {
          canonicalName: c.canonicalName,
          variants: c.variants,
          suggestedCategory: matched
            ? top.occupation.category
            : (c.suggestedCategory ?? null),
          matchedOccupationId: matched ? top.occupation.occupation_id : null,
          matchedOccupationName: matched
            ? top.occupation.canonical_name
            : null,
          confidence: matched ? top.confidence : ("low" as Confidence),
          isNew: !matched,
          score: top?.score ?? 0,
        };
      }
    );

    // 4. Employer-worksite connections
    const connectionCounts = new Map<string, number>();
    for (const row of rows) {
      if (row.employer && row.worksite) {
        const key = `${row.employer}|||${row.worksite}`;
        connectionCounts.set(key, (connectionCounts.get(key) ?? 0) + 1);
      }
    }

    const connections: EmployerWorksiteConnection[] = [];
    for (const [key, count] of connectionCounts) {
      const [employerName, worksiteName] = key.split("|||");
      connections.push({ employerName, worksiteName, occurrences: count });
    }
    connections.sort((a, b) => b.occurrences - a.occurrences);

    const result: AnalyseResult = {
      success: true,
      employers: employerProposals,
      worksites: worksiteProposals,
      occupations: occupationProposals,
      connections,
    };

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
