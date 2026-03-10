/**
 * Seed script to load the existing OA_EBA_Consolidated_Analysis_1.xlsx
 * spreadsheet data into the Supabase database.
 *
 * Usage: npx tsx scripts/seed-from-spreadsheet.ts
 *
 * Prerequisites:
 * - Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 * - Run the SQL migrations first (00001-00004)
 */

import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const SPREADSHEET_PATH = path.join(__dirname, "..", "Public", "OA_EBA_Consolidated_Analysis_1.xlsx");

interface RawAgreement {
  "Decision No": string;
  Sector: string;
  "Short Name": string;
  "Agreement Name": string;
  "Industry Classification": string;
  "Date of Decision": string | number;
  "Commencement Date": string | number;
  "Expiry Date": string | number;
  "OA/AWU Covered": string;
  "Dues Increase 1": string;
  "Dues Increase 2": string;
  "Dues Increase 3": string;
  "Dues Increase 4": string;
  "FWC Link": string;
  "OA Organiser": string;
  "Source Sheet": string;
  Comments: string;
  Status: string;
}

function parseExcelDate(val: string | number | undefined): string | null {
  if (!val) return null;
  if (typeof val === "number") {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
  }
  if (typeof val === "string") {
    const match = val.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) return match[0];
  }
  return null;
}

function extractEmployerName(agreementName: string): string {
  const patterns = [
    /^([\w\s&\-.'()]+?)\s+(?:ENTERPRISE|AGREEMENT|OFFSHORE|MARITIME|GREENFIELD|WESTERN|NORTH|DRILLING|CATERING|ROV|DECOMMISSIONING|ONSHORE|MAINTENANCE)/i,
    /^([\w\s&\-.'()]+?)\s+(?:PTY|LTD)/i,
  ];

  for (const pattern of patterns) {
    const match = agreementName.match(pattern);
    if (match) {
      let name = match[1].trim();
      if (agreementName.includes("PTY LTD")) {
        const pMatch = agreementName.match(/^([\w\s&\-.'()]+?PTY\s+LTD)/i);
        if (pMatch) name = pMatch[1].trim();
      }
      return name;
    }
  }
  return agreementName.split(" ").slice(0, 3).join(" ");
}

function parseUnionCoverage(coverage: string): string[] {
  if (!coverage) return [];
  const unions: string[] = [];
  const upper = coverage.toUpperCase();
  if (upper.includes("AWU")) unions.push("AWU");
  if (upper.includes("MUA") || upper.includes("CFMEU")) unions.push("CFMEU");
  if (upper.includes("AMOU")) unions.push("AMOU");
  if (upper.includes("AIMPE")) unions.push("AIMPE");
  if (upper.includes("AMWU")) unions.push("AMWU");
  if (unions.length === 0 && (upper.includes("YES") || upper === "YES")) unions.push("AWU");
  return unions;
}

async function seed() {
  console.log("Reading spreadsheet...");
  const buffer = fs.readFileSync(SPREADSHEET_PATH);
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const masterSheet = workbook.Sheets["Consolidated Master"];
  const masterData = XLSX.utils.sheet_to_json<RawAgreement>(masterSheet);

  console.log(`Found ${masterData.length} agreement records`);

  // Fetch existing reference data
  const { data: sectors } = await supabase.from("sectors").select("*");
  const { data: unions } = await supabase.from("unions").select("*");
  const { data: organisers } = await supabase.from("organisers").select("*");

  const sectorMap = new Map(sectors?.map((s) => [s.sector_name, s.sector_id]) || []);
  const unionMap = new Map(unions?.map((u) => [u.union_code, u.union_id]) || []);
  const organiserMap = new Map(organisers?.map((o) => [o.organiser_name, o.organiser_id]) || []);

  // Extract unique employers
  const employerNames = new Set<string>();
  for (const row of masterData) {
    if (row["Agreement Name"]) {
      employerNames.add(extractEmployerName(row["Agreement Name"]));
    }
  }

  console.log(`Inserting ${employerNames.size} employers...`);
  const employerMap = new Map<string, number>();
  for (const name of employerNames) {
    // Two-step: upsert (create if missing), then always select to get the ID
    const { error: upsertError } = await supabase
      .from("employers")
      .upsert({ employer_name: name }, { onConflict: "employer_name", ignoreDuplicates: true });
    if (upsertError) {
      console.warn(`Failed to upsert employer "${name}": ${upsertError.message}`);
      continue;
    }
    const { data } = await supabase
      .from("employers")
      .select("employer_id")
      .eq("employer_name", name)
      .single();
    if (data) employerMap.set(name, data.employer_id);
  }

  // Insert agreements
  console.log("Inserting agreements...");
  let inserted = 0;
  let skipped = 0;

  for (const row of masterData) {
    const decisionNo = row["Decision No"]?.toString().replace(/\n[\s\S]*/g, "").trim().slice(0, 20);
    if (!decisionNo) { skipped++; continue; }

    const sectorName = (row.Sector || row["Source Sheet"] || "").trim();
    let sectorId = sectorMap.get(sectorName);
    if (!sectorId) {
      for (const [name, id] of sectorMap) {
        if (sectorName.toLowerCase().includes(name.toLowerCase().replace(/ - /g, "-").replace(/ /g, "-"))) {
          sectorId = id;
          break;
        }
      }
    }

    const employerName = extractEmployerName(row["Agreement Name"] || "");
    const employerId = employerMap.get(employerName);

    const status = (row.Status || "Current").trim();

    const agreement = {
      decision_no: decisionNo,
      agreement_name: (row["Agreement Name"] || "").trim().replace(/\n/g, " "),
      short_name: row["Short Name"]?.trim() || null,
      sector_id: sectorId || null,
      employer_id: employerId || null,
      industry_classification: row["Industry Classification"]?.trim() || null,
      date_of_decision: parseExcelDate(row["Date of Decision"]),
      commencement_date: parseExcelDate(row["Commencement Date"]),
      expiry_date: parseExcelDate(row["Expiry Date"]),
      status: status === "Current" ? "Current" : status === "Expired" ? "Expired" : "Current",
      is_greenfield: (row["Agreement Name"] || "").toUpperCase().includes("GREENFIELD"),
      is_variation: (row.Comments || "").toUpperCase().includes("VARIATION"),
      fwc_link: row["FWC Link"]?.trim() || null,
      notes: row.Comments?.trim() || null,
      source_sheet: row["Source Sheet"]?.trim() || null,
    };

    const { data, error } = await supabase
      .from("agreements")
      .upsert(agreement, { onConflict: "decision_no", ignoreDuplicates: false })
      .select("agreement_id")
      .single();

    if (error) {
      console.warn(`Failed to insert ${decisionNo}: ${error.message}`);
      skipped++;
      continue;
    }

    inserted++;
    const agreementId = data.agreement_id;

    // Insert union coverage
    const unionCodes = parseUnionCoverage(row["OA/AWU Covered"] || "");
    for (const code of unionCodes) {
      const unionId = unionMap.get(code);
      if (unionId) {
        await supabase
          .from("agreement_unions")
          .upsert(
            { agreement_id: agreementId, union_id: unionId, is_primary: code === "AWU" },
            { onConflict: "agreement_id,union_id", ignoreDuplicates: true }
          );
      }
    }

    // Insert organiser assignment
    if (row["OA Organiser"]?.trim()) {
      const organiserId = organiserMap.get(row["OA Organiser"].trim());
      if (organiserId) {
        await supabase
          .from("agreement_organisers")
          .upsert(
            { agreement_id: agreementId, organiser_id: organiserId },
            { onConflict: "agreement_id,organiser_id", ignoreDuplicates: true }
          );
      }
    }

    // Insert dues increases
    for (let i = 1; i <= 4; i++) {
      const raw = row[`Dues Increase ${i}` as keyof RawAgreement] as string;
      if (!raw?.trim()) continue;

      const duesIncrease = {
        agreement_id: agreementId,
        increase_number: i,
        raw_description: raw.replace(/\n/g, " ").trim(),
        increase_type: raw.toUpperCase().includes("WPI")
          ? "WPI"
          : raw.toUpperCase().includes("CPI")
          ? "CPI"
          : raw.includes("%")
          ? "Fixed"
          : "Other",
        percentage: (() => {
          const pctMatch = raw.match(/(\d+\.?\d*)%/);
          return pctMatch ? parseFloat(pctMatch[1]) : null;
        })(),
        minimum_pct: (() => {
          const minMatch = raw.match(/(\d+\.?\d*)%\s*min/i);
          return minMatch ? parseFloat(minMatch[1]) : null;
        })(),
        maximum_pct: (() => {
          const maxMatch = raw.match(/(\d+\.?\d*)%\s*max/i) || raw.match(/cap\s*(?:at\s*)?(\d+\.?\d*)%/i);
          return maxMatch ? parseFloat(maxMatch[1]) : null;
        })(),
      };

      await supabase.from("dues_increases").upsert(duesIncrease, {
        onConflict: "agreement_id,increase_number",
        ignoreDuplicates: false,
      });
    }
  }

  console.log(`\nAgreements: ${inserted} inserted, ${skipped} skipped`);

  // Insert worksites from Worksite Analysis sheet
  const wsSheet = workbook.Sheets["Worksite Analysis"];
  if (wsSheet) {
    const wsData = XLSX.utils.sheet_to_json<Record<string, string>>(wsSheet, { range: 1 });
    console.log(`\nInserting worksites from Worksite Analysis (${wsData.length} rows)...`);

    // Collect unique operator names that are real companies (not category labels)
    const categoryLabels = new Set([
      "Aircraft Maintenance", "Catering", "Chemists", "Hydrographics",
      "Maintenance", "Multiple", "Offshore Construction", "Production",
      "Sector", "Supply", "NOPTA (decommissioning)",
    ]);

    const operatorNames = new Set<string>();
    for (const row of wsData) {
      const op = row["Operator"]?.trim();
      if (op && !categoryLabels.has(op)) operatorNames.add(op);
    }

    // Upsert operator companies into employers, then build an operator → employer_id map
    console.log(`  Upserting ${operatorNames.size} operators into employers...`);
    const operatorIdMap = new Map<string, number>();
    for (const opName of operatorNames) {
      // Try to find existing employer whose name contains the operator short name
      const { data: existing } = await supabase
        .from("employers")
        .select("employer_id, employer_name")
        .ilike("employer_name", `%${opName.split(" ")[0]}%`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        operatorIdMap.set(opName, existing.employer_id);
      } else {
        // Insert a clean operator record
        const { data: inserted } = await supabase
          .from("employers")
          .insert({ employer_name: opName })
          .select("employer_id")
          .single();
        if (inserted) operatorIdMap.set(opName, inserted.employer_id);
      }
    }

    const typeMap: Record<string, string> = {
      "Onshore LNG / Platform": "Onshore_LNG",
      "Onshore LNG Processing": "Onshore_LNG",
      "Offshore Platform": "Platform",
      FLNG: "FLNG",
      "LNG Facility / FPSO": "FPSO",
      "Drill Centre": "Drill_Centre",
      "Gas Platforms": "Platform",
      "Gas Plant": "Gas_Plant",
      FPSO: "FPSO",
      "Onshore Facilities": "Onshore_Facilities",
      "Gas Hub": "Hub",
      CPF: "CPF",
      "Onshore Town/Industrial": "Other",
      Heliport: "Heliport",
      Airfield: "Airfield",
      Pipeline: "Pipeline",
      "Gas Field / Subsea": "Gas_Field",
      "Multi-site / Regional": "Region",
    };

    let wsInserted = 0;
    let wsUpdated = 0;
    for (const row of wsData) {
      const name = row["Worksite Name"]?.trim();
      const hasType = !!row["Type"]?.trim();
      // Skip blanks, title/legend rows, rows without a Type (legend entries have no type),
      // and any row that looks like an agreement decision number
      if (
        !name ||
        !hasType ||
        name === "PROPOSED WORKSITE REFERENCE DATA" ||
        name === "LEGEND:" ||
        name === "Decision No" ||
        name.includes("MAPPING") ||
        /^AG\d{4}\/\d+/.test(name)
      ) continue;

      const rawType = row["Type"]?.trim() || "Other";
      const wsType = typeMap[rawType] || "Other";
      const isOffshore = row["Offshore?"]?.trim();
      const isActive = row["Active?"]?.trim();
      const opName = row["Operator"]?.trim();
      const operatorId = opName && !categoryLabels.has(opName) ? (operatorIdMap.get(opName) ?? null) : null;

      const payload = {
        worksite_name: name,
        worksite_type: wsType,
        operator_id: operatorId,
        location_description: row["Location"]?.trim() || null,
        basin: row["Basin"]?.trim() || null,
        is_offshore: isOffshore === "Yes" || isOffshore === "Mixed",
        is_active: isActive !== "Decommissioning",
        notes: isActive === "Under Development" ? "Under Development" : null,
      };

      // Check if already exists so we can update operator_id too
      const { data: existing } = await supabase
        .from("worksites")
        .select("worksite_id")
        .eq("worksite_name", name)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("worksites")
          .update({ operator_id: operatorId })
          .eq("worksite_id", existing.worksite_id);
        if (!error) wsUpdated++;
      } else {
        const { error } = await supabase.from("worksites").insert(payload);
        if (!error) wsInserted++;
        else console.warn(`  Failed to insert worksite "${name}": ${error.message}`);
      }
    }

    console.log(`Worksites: ${wsInserted} inserted, ${wsUpdated} updated with operator`);
  }

  // Import Agreement → Worksite mapping (second table in Worksite Analysis, rows 32–80)
  console.log("\nImporting agreement → worksite mapping...");

  const wsRaw = workbook.Sheets["Worksite Analysis"];
  const wsRawRows = XLSX.utils.sheet_to_json<(string | null)[]>(wsRaw, {
    header: 1,
    defval: null,
  }) as (string | null)[][];

  // Row 31 (0-indexed) is the header row for the mapping table.
  // Data starts at row 32 and runs until the LEGEND: row.
  const mappingRows = wsRawRows.slice(32).filter(
    (row) => row[0] && typeof row[0] === "string" && row[0].startsWith("AG")
  );

  // Normalise worksite name abbreviations used in the mapping table
  const wsNameNormalise: Record<string, string> = {
    "NWS Platforms": "North West Shelf (NWS) Platforms",
  };

  // Build lookup maps: decision_no → agreement_id, worksite_name → worksite_id
  const { data: allAgreements } = await supabase
    .from("agreements")
    .select("agreement_id, decision_no");
  const { data: allWorksites } = await supabase
    .from("worksites")
    .select("worksite_id, worksite_name");

  const agreementByDecisionNo = new Map(
    (allAgreements || []).map((a) => [a.decision_no, a.agreement_id])
  );
  const worksiteByName = new Map(
    (allWorksites || []).map((w) => [w.worksite_name, w.worksite_id])
  );

  let mappingInserted = 0;
  let mappingSkipped = 0;

  for (const row of mappingRows) {
    const decisionNo = (row[0] as string).trim();
    const rawWorksites = (row[3] as string | null)?.trim() || "";
    const confidence = (row[4] as string | null)?.trim() || null;
    const notes = (row[5] as string | null)?.trim() || null;

    const agreementId = agreementByDecisionNo.get(decisionNo);
    if (!agreementId) {
      console.warn(`  Mapping skipped: no agreement found for ${decisionNo}`);
      mappingSkipped++;
      continue;
    }

    // Some rows map to multiple worksites separated by "; "
    const worksiteNames = rawWorksites.split(";").map((n) => n.trim()).filter(Boolean);

    for (const rawName of worksiteNames) {
      const normalisedName = wsNameNormalise[rawName] || rawName;
      const worksiteId = worksiteByName.get(normalisedName);
      if (!worksiteId) {
        console.warn(`  Mapping skipped: no worksite found for "${normalisedName}" (from "${rawName}")`);
        mappingSkipped++;
        continue;
      }

      const { error } = await supabase
        .from("agreement_worksites")
        .upsert(
          {
            agreement_id: agreementId,
            worksite_id: worksiteId,
            mapping_confidence: confidence,
            mapping_notes: notes,
          },
          { onConflict: "agreement_id,worksite_id", ignoreDuplicates: false }
        );

      if (error) {
        console.warn(`  Failed to insert mapping ${decisionNo} → "${normalisedName}": ${error.message}`);
        mappingSkipped++;
      } else {
        mappingInserted++;
      }
    }
  }

  console.log(`Agreement → worksite mappings: ${mappingInserted} inserted/updated, ${mappingSkipped} skipped`);

  console.log("\nSeed complete!");
}

seed().catch(console.error);
