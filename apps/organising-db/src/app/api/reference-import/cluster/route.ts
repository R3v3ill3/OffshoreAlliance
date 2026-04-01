import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  clusterByFuzzy,
  normaliseGeneric,
  normaliseEmployer,
  type Cluster,
} from "@/lib/utils/cluster-utils";
import { normaliseOccupation, detectOccupationCategory } from "@/lib/utils/occupation-fuzzy";
import { detectMultiValue } from "@/lib/utils/multi-value-splitter";

export interface ClusterResult {
  success: true;
  employerClusters: Cluster[];
  worksiteClusters: Cluster[];
  occupationClusters: Cluster[];
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { rows } = body as {
      rows: { employer: string; worksite: string; occupation: string }[];
    };

    // Count occurrences for each raw value
    const empCounts = new Map<string, number>();
    const wsCounts = new Map<string, number>();
    const occCounts = new Map<string, number>();

    // Pre-process: split multi-value worksites and occupations into individual parts
    const wsPartsAll: string[] = [];
    const occPartsAll: string[] = [];

    for (const row of rows) {
      if (row.employer) {
        empCounts.set(row.employer, (empCounts.get(row.employer) ?? 0) + 1);
      }

      if (row.worksite) {
        const split = detectMultiValue(row.worksite, "worksite");
        const parts = split.isMultiValue ? split.parts : [row.worksite];
        for (const p of parts) {
          wsCounts.set(p, (wsCounts.get(p) ?? 0) + 1);
          wsPartsAll.push(p);
        }
      }

      if (row.occupation) {
        const split = detectMultiValue(row.occupation, "occupation");
        const parts = split.isMultiValue ? split.parts : [row.occupation];
        for (const p of parts) {
          occCounts.set(p, (occCounts.get(p) ?? 0) + 1);
          occPartsAll.push(p);
        }
      }
    }

    const uniqueEmployers = [...empCounts.keys()];
    const uniqueWsParts = [...new Set(wsPartsAll)];
    const uniqueOccParts = [...new Set(occPartsAll)];

    const employerClusters = clusterByFuzzy(
      uniqueEmployers,
      normaliseEmployer,
      0.75,
      empCounts
    );

    const worksiteClusters = clusterByFuzzy(
      uniqueWsParts,
      normaliseGeneric,
      0.70,
      wsCounts
    );

    const occupationClusters = clusterByFuzzy(
      uniqueOccParts,
      normaliseOccupation,
      0.75,
      occCounts,
      detectOccupationCategory
    );

    // Sort by occurrence count descending so largest clusters appear first
    employerClusters.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
    worksiteClusters.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
    occupationClusters.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

    // Re-assign sequential IDs after sorting
    employerClusters.forEach((c, i) => (c.id = i));
    worksiteClusters.forEach((c, i) => (c.id = i));
    occupationClusters.forEach((c, i) => (c.id = i));

    const result: ClusterResult = {
      success: true,
      employerClusters,
      worksiteClusters,
      occupationClusters,
    };

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
