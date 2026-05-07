// NOPSEMA region codes that map onto our two jurisdictions of interest.
// GS = Great Southern, MW = Mid West, NW = North West, PIL = Pilbara,
// SW = South West (all Western Australia). NT = Northern Territory.
const WA_CODES = new Set(["GS", "MW", "NW", "PIL", "SW"]);
const NT_CODES = new Set(["NT"]);

// Reverse map of NOPSEMA's human-readable region names (as they appear
// on detail pages, e.g. "Locations: North West") to their filter codes.
const REGION_NAME_TO_CODE: Record<string, string> = {
  "great southern": "GS",
  "mid west": "MW",
  "north west": "NW",
  pilbara: "PIL",
  "south west": "SW",
  "northern territory": "NT",
};

export type Jurisdiction = "WA" | "NT";

export function jurisdictionFromRegion(regionCode: string | null | undefined): Jurisdiction | null {
  if (!regionCode) return null;
  const code = regionCode.trim().toUpperCase();
  if (WA_CODES.has(code)) return "WA";
  if (NT_CODES.has(code)) return "NT";
  return null;
}

export function regionCodeFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  // The "Locations" field can list multiple regions separated by commas
  // or "and"; we take the first match for a known region.
  const lower = name.toLowerCase();
  for (const [label, code] of Object.entries(REGION_NAME_TO_CODE)) {
    if (lower.includes(label)) return code;
  }
  return null;
}

// Heuristic backup when neither a region code nor a region name is
// available — match the location or title against known WA/NT keywords.
export function jurisdictionFromText(text: string | null | undefined): Jurisdiction | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (/\b(northern\s*territory|\bnt\b|darwin|bonaparte|browse\s*basin)/.test(lower)) {
    return "NT";
  }
  if (/\b(western\s*australia|\bwa\b|perth|pilbara|carnarvon|broome|dampier|exmouth|bunbury)/.test(lower)) {
    return "WA";
  }
  return null;
}
