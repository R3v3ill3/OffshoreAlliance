import type {
  Employer,
  Worksite,
  EmployerGroupProposal,
  CategoryProposal,
  WorksitePeProposal,
} from "@/types/database";

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(pty\.?\s*ltd\.?|ltd\.?|pty\.?|inc\.?|corp\.?|llc\.?|llp\.?)\b/gi,
      ""
    )
    .replace(
      /\b(australia|australian|aus|international|intl|services|service|group|holdings|solutions)\b/gi,
      ""
    )
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rootTokens(normalised: string): string[] {
  const stopWords = new Set(["the", "and", "of", "for", "in", "at", "by"]);
  return normalised
    .split(" ")
    .filter((w) => w.length >= 2 && !stopWords.has(w))
    .slice(0, 2);
}

export function detectEmployerGroups(
  employers: Employer[]
): EmployerGroupProposal[] {
  const candidates = employers.filter(
    (e) => e.employer_category !== "Principal_Employer"
  );

  const groups = new Map<string, Employer[]>();
  for (const emp of candidates) {
    const tokens = rootTokens(normaliseName(emp.employer_name));
    if (tokens.length === 0) continue;
    const key = tokens[0];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(emp);
  }

  const proposals: EmployerGroupProposal[] = [];
  for (const [, members] of groups) {
    if (members.length < 2) continue;

    const sorted = [...members].sort(
      (a, b) => a.employer_name.length - b.employer_name.length
    );
    const proposedParentName = sorted[0].employer_name;

    const cleanParent = members.find(
      (e) =>
        normaliseName(e.employer_name).split(" ").length <= 2 &&
        e.employer_name === e.employer_name.trim()
    );

    proposals.push({
      proposedParentName: cleanParent?.employer_name ?? proposedParentName,
      existingParentId: cleanParent?.employer_id ?? null,
      isNewParent: !cleanParent,
      memberEmployerIds: members
        .filter((e) => e.employer_id !== cleanParent?.employer_id)
        .map((e) => e.employer_id),
      confidence: members.length >= 3 ? "high" : "medium",
      source: "fuzzy",
      accepted: false,
    });
  }

  return proposals;
}

const CATEGORY_RULES: { patterns: RegExp[]; category: string }[] = [
  {
    patterns: [
      /labour\s*hire/i,
      /workforce/i,
      /staffing/i,
      /recruitment/i,
      /manpower/i,
    ],
    category: "Labour_Hire",
  },
  {
    patterns: [
      /origin\s*energy/i,
      /santos/i,
      /beach\s*energy/i,
      /buru/i,
      /karoon/i,
    ],
    category: "Producer",
  },
  {
    patterns: [
      /\bess\b/i,
      /sodexo/i,
      /compass/i,
      /eurest/i,
      /spotless/i,
      /broadspectrum/i,
      /downer/i,
    ],
    category: "Major_Contractor",
  },
  {
    patterns: [
      /subsea\s*7/i,
      /technip/i,
      /mcdermott/i,
      /sapura/i,
      /allseas/i,
      /fugro/i,
      /petrofac/i,
      /worley/i,
      /clough/i,
    ],
    category: "Major_Contractor",
  },
  {
    patterns: [
      /transocean/i,
      /ensco/i,
      /rowan/i,
      /valaris/i,
      /seadrill/i,
      /noble\s*corp/i,
      /odfjell/i,
      /borr\s*drilling/i,
    ],
    category: "Major_Contractor",
  },
  {
    patterns: [
      /bureau\s*veritas/i,
      /lloyd/i,
      /rina/i,
      /applus/i,
      /mistras/i,
    ],
    category: "Specialist",
  },
  {
    patterns: [
      /scaffolding/i,
      /painting/i,
      /insulation/i,
      /electrical/i,
      /instrumentation/i,
    ],
    category: "Subcontractor",
  },
];

export function proposeCategories(employers: Employer[]): CategoryProposal[] {
  const results: CategoryProposal[] = [];

  for (const emp of employers) {
    if (emp.employer_category === "Principal_Employer") continue;

    let matched = false;
    for (const rule of CATEGORY_RULES) {
      if (
        rule.patterns.some(
          (p) => p.test(emp.employer_name) || p.test(emp.trading_name ?? "")
        )
      ) {
        if (emp.employer_category !== rule.category) {
          results.push({
            employerId: emp.employer_id,
            employerName: emp.employer_name,
            currentCategory: emp.employer_category,
            proposedCategory: rule.category,
            confidence: "high",
            reasoning: `Name matches known ${rule.category} pattern`,
            source: "fuzzy",
            accepted: false,
            overridden: false,
          });
        }
        matched = true;
        break;
      }
    }

    if (!matched && !emp.employer_category) {
      results.push({
        employerId: emp.employer_id,
        employerName: emp.employer_name,
        currentCategory: null,
        proposedCategory: "Subcontractor",
        confidence: "low",
        reasoning: "No keyword match; defaulting to Subcontractor",
        source: "fuzzy",
        accepted: false,
        overridden: false,
      });
    }
  }

  return results;
}

// Prelude FLNG is a Shell facility; Darwin LNG is associated with
// the Ichthys project (Inpex). Patterns ordered so more-specific
// multi-word patterns are checked before single-word fallbacks.
// \bchevron\b / \bwoodside\b / \bsantos\b / \bshell\b act as
// catch-alls for general-purpose worksites named after the PE.
const PE_WORKSITE_SIGNALS: { pattern: RegExp; peName: string }[] = [
  {
    pattern: /gorgon|wheatstone|barrow\s*island|jansz|\bchevron\b/i,
    peName: "Chevron",
  },
  {
    pattern:
      /pluto|north\s*west\s*shelf|\bnws\b|nganhurra|ngujima|ohka|vincent|stybarrow|enfield|pyrenees|macedon|browse\s*fpso|\bwoodside\b/i,
    peName: "Woodside",
  },
  {
    pattern: /ichthys|inpex|darwin\s*lng/i,
    peName: "Inpex",
  },
  {
    pattern: /prelude|\bshell\b|\bcrux\b/i,
    peName: "Shell",
  },
  {
    pattern: /ningaloo|varanus|\bsantos\b/i,
    peName: "Santos",
  },
  {
    pattern: /jadestone|stag\s*cpf|montara/i,
    peName: "Jadestone",
  },
];

export function proposeWorksitePeAssignments(
  worksites: Worksite[],
  principalEmployers: Employer[],
  operatorMap: Map<number, Employer>
): WorksitePeProposal[] {
  const proposals: WorksitePeProposal[] = [];

  for (const ws of worksites) {
    const signals: { peName: string; source: string }[] = [];

    if (ws.operator_id) {
      const op = operatorMap.get(ws.operator_id);
      if (op?.employer_category === "Principal_Employer") {
        signals.push({ peName: op.employer_name, source: "operator" });
      }
    }

    for (const rule of PE_WORKSITE_SIGNALS) {
      if (rule.pattern.test(ws.worksite_name)) {
        signals.push({ peName: rule.peName, source: "name_match" });
        break;
      }
    }

    if (signals.length === 0) continue;

    const peName = signals[0].peName;
    const pe = principalEmployers.find((p) => p.employer_name === peName);
    if (!pe) continue;

    if (ws.principal_employer_id === pe.employer_id) continue;

    proposals.push({
      worksiteId: ws.worksite_id,
      worksiteName: ws.worksite_name,
      worksiteType: ws.worksite_type,
      currentPrincipalEmployerId: ws.principal_employer_id,
      currentPrincipalEmployerName: ws.principal_employer_id
        ? (principalEmployers.find(
            (p) => p.employer_id === ws.principal_employer_id
          )?.employer_name ?? null)
        : null,
      proposedPrincipalEmployerId: pe.employer_id,
      proposedPrincipalEmployerName: pe.employer_name,
      confidence:
        signals.length >= 2
          ? "high"
          : signals[0].source === "operator"
            ? "high"
            : "medium",
      reasoning: signals.map((s) => s.source).join(" + "),
      source: "fuzzy",
      accepted: false,
      overridden: false,
    });
  }

  return proposals;
}
