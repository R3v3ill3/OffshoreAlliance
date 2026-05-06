// NOPSEMA region codes that map onto our two jurisdictions of interest.
// GS = Great Southern, MW = Mid West, NW = North West, PIL = Pilbara,
// SW = South West (all Western Australia). NT = Northern Territory.
const WA_CODES = new Set(["GS", "MW", "NW", "PIL", "SW"]);
const NT_CODES = new Set(["NT"]);

export type Jurisdiction = "WA" | "NT";

export function jurisdictionFromRegion(regionCode: string | null | undefined): Jurisdiction | null {
  if (!regionCode) return null;
  const code = regionCode.trim().toUpperCase();
  if (WA_CODES.has(code)) return "WA";
  if (NT_CODES.has(code)) return "NT";
  return null;
}

// Heuristic backup when the region code is missing — match the location
// or location text against known WA/NT keywords.
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
