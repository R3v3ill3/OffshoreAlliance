import type { VesselRelevance, VesselType } from "./types";

export interface SeedVessel {
  name: string;
  owner: string;
  type: VesselType;
  imo: string | null;
  relevance: VesselRelevance;
  notes: string | null;
}

/** OA Universe → Offshore key clients. IMO is resolved on ingest except where confirmed. */
export const SEED_VESSELS: SeedVessel[] = [
  { name: "Castorone", owner: "Saipem", type: "pipelay", imo: null, relevance: "nw", notes: null },
  { name: "Saipem Endeavour", owner: "Saipem", type: "pipelay", imo: null, relevance: "nw", notes: null },
  { name: "Saipem Constellation", owner: "Saipem", type: "construction", imo: null, relevance: "nw", notes: null },
  { name: "Audacia", owner: "Allseas", type: "pipelay", imo: null, relevance: "nw", notes: null },
  { name: "Sandpiper", owner: "Allseas", type: "pipelay", imo: null, relevance: "nw", notes: null },
  { name: "Fortitude", owner: "Allseas", type: "pipelay", imo: null, relevance: "nw", notes: null },
  {
    name: "Solitaire",
    owner: "Allseas",
    type: "pipelay",
    imo: null,
    relevance: "global",
    notes: "Usually detected elsewhere, including Bass Strait. Kept for global awareness.",
  },
  {
    name: "Lorelay",
    owner: "Allseas",
    type: "pipelay",
    imo: null,
    relevance: "global",
    notes: "Usually detected elsewhere, including Bass Strait. Kept for global awareness.",
  },
  {
    name: "Pioneering Spirit",
    owner: "Allseas",
    type: "heavy_lift",
    imo: null,
    relevance: "global",
    notes: "Usually detected elsewhere, including Bass Strait. Kept for global awareness.",
  },
  { name: "Seven Oceans", owner: "Subsea7", type: "pipelay", imo: null, relevance: "nw", notes: null },
  { name: "Seven Oceanic", owner: "Subsea7", type: "pipelay", imo: null, relevance: "nw", notes: null },
  { name: "DLV 2000", owner: "McDermott", type: "pipelay", imo: null, relevance: "nw", notes: null },
  { name: "Fugro Etive", owner: "Fugro", type: "survey", imo: "9379686", relevance: "nw", notes: "IMO confirmed." },
  { name: "Fugro Equator", owner: "Fugro", type: "survey", imo: null, relevance: "nw", notes: null },
  {
    name: "Blue Essence",
    owner: "Fugro",
    type: "usv",
    imo: null,
    relevance: "nw",
    notes: "Blue Essence USV fleet. Not a single hull; add individual IMOs when known.",
  },
  { name: "Southern Star", owner: "DeepOcean", type: "dsv", imo: null, relevance: "nw", notes: "Shelf Subsea / DeepOcean APAC." },
  { name: "Southern Nova", owner: "DeepOcean", type: "dsv", imo: null, relevance: "nw", notes: null },
  { name: "Oriental Dragon", owner: "DeepOcean", type: "dsv", imo: null, relevance: "nw", notes: null },
  { name: "Bravenes", owner: "Van Oord", type: "rock_install", imo: null, relevance: "nw", notes: "Subsea rock-installation." },
  { name: "Stornes", owner: "Van Oord", type: "rock_install", imo: null, relevance: "nw", notes: "Subsea rock-installation." },
  { name: "Nordnes", owner: "Van Oord", type: "rock_install", imo: null, relevance: "nw", notes: "Subsea rock-installation." },
  {
    name: "Van Oord dredger spread",
    owner: "Van Oord",
    type: "dredger",
    imo: null,
    relevance: "nw",
    notes: "Placeholder for the dredger spread. Replace with named hulls and IMOs.",
  },
  { name: "Sapura Constructor", owner: "Vantris", type: "construction", imo: null, relevance: "nw", notes: "Vantris, formerly Sapura." },
  {
    name: "Sapura 3500",
    owner: "Vantris",
    type: "pipelay",
    imo: null,
    relevance: "low",
    notes: "Sapura PLSV. The six Sapura PLSVs are Brazil-committed; low NW relevance.",
  },
  {
    name: "Sapura 1200",
    owner: "Vantris",
    type: "pipelay",
    imo: null,
    relevance: "low",
    notes: "Sapura PLSV. The six Sapura PLSVs are Brazil-committed; low NW relevance.",
  },
];

export const SEED_CONTRACTORS: {
  name: string;
  aliases: string[];
  tier: "core" | "adjacent";
  active: boolean;
}[] = [
  { name: "Saipem", aliases: [], tier: "core", active: true },
  { name: "Allseas", aliases: [], tier: "core", active: true },
  { name: "Subsea7", aliases: ["Subsea 7"], tier: "core", active: true },
  { name: "McDermott", aliases: [], tier: "core", active: true },
  { name: "Fugro", aliases: [], tier: "core", active: true },
  { name: "DeepOcean", aliases: ["Shelf Subsea"], tier: "core", active: true },
  { name: "Van Oord", aliases: [], tier: "core", active: true },
  { name: "Vantris", aliases: ["Sapura"], tier: "core", active: true },
  { name: "DOF", aliases: [], tier: "adjacent", active: false },
  { name: "TechnipFMC", aliases: ["Technip"], tier: "adjacent", active: false },
  { name: "Heerema", aliases: [], tier: "adjacent", active: false },
  { name: "Boskalis", aliases: [], tier: "adjacent", active: false },
  { name: "DEME", aliases: [], tier: "adjacent", active: false },
  { name: "Petrofac", aliases: [], tier: "adjacent", active: false },
];

export const TRADE_FEEDS: { name: string; url: string }[] = [
  { name: "Offshore Energy", url: "https://www.offshore-energy.biz/feed/" },
  { name: "gCaptain", url: "https://gcaptain.com/feed/" },
  { name: "Splash247", url: "https://splash247.com/feed/" },
  { name: "Baird Maritime", url: "https://www.bairdmaritime.com/feed/" },
  { name: "Offshore Magazine", url: "https://www.offshore-mag.com/rss" },
  { name: "Riviera Maritime", url: "https://www.rivieramm.com/rss" },
];

export const NOPSEMA_LISTINGS: { key: string; label: string; url: string }[] = [
  {
    key: "under_assessment",
    label: "NOPSEMA EP under assessment",
    url: "https://info.nopsema.gov.au/home/under_assessment_petroleum",
  },
  {
    key: "approved",
    label: "NOPSEMA approved activities",
    url: "https://info.nopsema.gov.au/home/approved_projects_and_activities",
  },
];
