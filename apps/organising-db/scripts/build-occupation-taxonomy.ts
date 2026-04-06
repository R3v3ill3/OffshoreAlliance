/**
 * One-time script to parse occupations.xlsx, clean / normalise raw occupation
 * strings, and produce:
 *   1. occupation-taxonomy-review.json  – human-reviewable taxonomy
 *   2. seed_occupations.sql             – ready-to-apply migration
 *
 * Usage:  npx tsx scripts/build-occupation-taxonomy.ts
 */

import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

// ─── Taxonomy definition (approved interactively) ───────────────────────────

interface CanonicalOccupation {
  name: string;
  aliases: string[];
}

interface OccupationGroup {
  name: string;
  displayOrder: number;
  occupations: CanonicalOccupation[];
}

const GROUPS: OccupationGroup[] = [
  {
    name: "Welding and Fabrication",
    displayOrder: 1,
    occupations: [
      { name: "Boilermaker", aliases: [] },
      { name: "Welder", aliases: [] },
      { name: "Coded Welder", aliases: [] },
      { name: "Special Class Welder", aliases: [] },
      { name: "Pipe Welder", aliases: [] },
      { name: "Mainline Welder", aliases: [] },
      { name: "Welder Helper", aliases: [] },
      { name: "Fabricator", aliases: [] },
      { name: "Welding Inspector", aliases: [] },
      { name: "Welding Technician", aliases: [] },
    ],
  },
  {
    name: "Mechanical",
    displayOrder: 2,
    occupations: [
      { name: "Mechanical Fitter", aliases: [] },
      { name: "Mechanical Technician", aliases: [] },
      { name: "Fitter and Turner", aliases: [] },
      { name: "Fitter Machinist", aliases: [] },
      { name: "Pipefitter", aliases: [] },
      { name: "Tube Fitter", aliases: [] },
      { name: "Bevel Machine Operator", aliases: [] },
      { name: "Mechanic", aliases: [] },
      { name: "Diesel Mechanic", aliases: [] },
      { name: "Hydraulic Mechanic", aliases: [] },
      { name: "Deck Mechanic", aliases: [] },
      { name: "HVAC Technician", aliases: [] },
      { name: "Plumber", aliases: [] },
      { name: "Valve Technician", aliases: [] },
      { name: "Turbine Technician", aliases: [] },
      { name: "Instrument Fitter", aliases: [] },
      { name: "Flange Technician", aliases: [] },
    ],
  },
  {
    name: "Rigging and Scaffolding",
    displayOrder: 3,
    occupations: [
      { name: "Rigger", aliases: [] },
      { name: "Advanced Rigger", aliases: [] },
      { name: "Scaffolder", aliases: [] },
      { name: "Advanced Scaffolder", aliases: [] },
      { name: "Dogman", aliases: [] },
      { name: "Rope Access Technician", aliases: [] },
    ],
  },
  {
    name: "Electrical and Instrumentation",
    displayOrder: 4,
    occupations: [
      { name: "Electrician", aliases: [] },
      { name: "INLEC Technician", aliases: [] },
      { name: "Electrical Technician", aliases: [] },
      { name: "Electrical Trade Assistant", aliases: [] },
      { name: "HV Specialist", aliases: [] },
      { name: "Telecommunications Technician", aliases: [] },
      { name: "EEHA Inspector", aliases: [] },
      { name: "Electronics Technician", aliases: [] },
    ],
  },
  {
    name: "Painting and Coatings",
    displayOrder: 5,
    occupations: [
      { name: "Painter", aliases: [] },
      { name: "Blaster", aliases: [] },
      { name: "Painter/Blaster", aliases: [] },
      { name: "Field Joint Coater", aliases: [] },
      { name: "Coatings Technician", aliases: [] },
      { name: "UHP Operator", aliases: [] },
    ],
  },
  {
    name: "Insulation and Cladding",
    displayOrder: 6,
    occupations: [
      { name: "Sheet Metal Worker", aliases: [] },
      { name: "Insulator", aliases: [] },
      { name: "Lagger/Cladder", aliases: [] },
      { name: "Fireproofer", aliases: [] },
    ],
  },
  {
    name: "Operations and Process",
    displayOrder: 7,
    occupations: [
      { name: "Production Technician", aliases: [] },
      { name: "Production Operator", aliases: [] },
      { name: "Production Specialist", aliases: [] },
      { name: "Operations Technician", aliases: [] },
      { name: "Process Technician", aliases: [] },
      { name: "Process Operator", aliases: [] },
      { name: "Control Room Technician", aliases: [] },
      { name: "Control Room Operator", aliases: [] },
      { name: "Field Operator", aliases: [] },
      { name: "Plant Operator", aliases: [] },
      { name: "Pipeline Controller", aliases: [] },
      { name: "Gas Systems Operator", aliases: [] },
      { name: "Service Technician", aliases: [] },
      { name: "General Service Operator", aliases: [] },
      { name: "Production Maintenance Technician", aliases: [] },
      { name: "Line Up Operator", aliases: [] },
      { name: "Radio Operator", aliases: [] },
      { name: "Commissioning Technician", aliases: [] },
      { name: "Trade Assistant", aliases: [] },
      { name: "Technician", aliases: [] },
    ],
  },
  {
    name: "Marine",
    displayOrder: 8,
    occupations: [
      { name: "Master", aliases: [] },
      { name: "Chief Officer", aliases: [] },
      { name: "Deck Officer", aliases: [] },
      { name: "Second Officer", aliases: [] },
      { name: "Second Mate", aliases: [] },
      { name: "Dynamic Positioning Officer", aliases: [] },
      { name: "Marine Engineer", aliases: [] },
      { name: "Electro-Technical Officer", aliases: [] },
      { name: "Bosun", aliases: [] },
      { name: "Integrated Rating", aliases: [] },
      { name: "Deck Crew", aliases: [] },
      { name: "Motorman", aliases: [] },
      { name: "Seafarer", aliases: [] },
      { name: "Hydrographic Surveyor", aliases: [] },
      { name: "Marine Technician", aliases: [] },
    ],
  },
  {
    name: "Lifting and Cranes",
    displayOrder: 9,
    occupations: [
      { name: "Crane Operator", aliases: [] },
      { name: "Crane Technician", aliases: [] },
    ],
  },
  {
    name: "Inspection and NDT",
    displayOrder: 10,
    occupations: [
      { name: "AICIP Inspector", aliases: [] },
      { name: "API Inspector", aliases: [] },
      { name: "Plant Inspector", aliases: [] },
      { name: "NDT Technician", aliases: [] },
      { name: "Hull Tank Inspector", aliases: [] },
      { name: "Corrosion Technician", aliases: [] },
      { name: "NACE Inspector", aliases: [] },
      { name: "Inspection Supervisor", aliases: [] },
      { name: "Quality Inspector", aliases: [] },
      { name: "Topside Inspector", aliases: [] },
      { name: "Marine Inspector", aliases: [] },
    ],
  },
  {
    name: "ROV and Subsea",
    displayOrder: 11,
    occupations: [
      { name: "ROV Pilot Technician", aliases: [] },
      { name: "ROV Pilot", aliases: [] },
      { name: "ROV Supervisor", aliases: [] },
      { name: "ROV Technician", aliases: [] },
      { name: "ROV Submersible Engineer", aliases: [] },
      { name: "ROV Superintendent", aliases: [] },
      { name: "ROV Trainee", aliases: [] },
      { name: "Subsea Engineer", aliases: [] },
      { name: "Subsea Supervisor", aliases: [] },
      { name: "Diver", aliases: [] },
    ],
  },
  {
    name: "Drilling",
    displayOrder: 12,
    occupations: [
      { name: "Driller", aliases: [] },
      { name: "Assistant Driller", aliases: [] },
      { name: "Derrickman", aliases: [] },
      { name: "Floorhand", aliases: [] },
      { name: "Roughneck", aliases: [] },
      { name: "Roustabout", aliases: [] },
      { name: "Toolpusher", aliases: [] },
      { name: "Casing Hand", aliases: [] },
    ],
  },
  {
    name: "Catering and Hospitality",
    displayOrder: 13,
    occupations: [
      { name: "Chef", aliases: [] },
      { name: "Cook", aliases: [] },
      { name: "Baker", aliases: [] },
      { name: "Steward", aliases: [] },
      { name: "Utility", aliases: [] },
      { name: "Service Attendant", aliases: [] },
      { name: "Camp Boss", aliases: [] },
      { name: "Galley Hand", aliases: [] },
      { name: "Chief Caterer", aliases: [] },
      { name: "Cleaner", aliases: [] },
    ],
  },
  {
    name: "Engineering and Technical",
    displayOrder: 14,
    occupations: [
      { name: "Engineer", aliases: [] },
      { name: "Field Service Engineer", aliases: [] },
      { name: "Laboratory Analyst", aliases: [] },
      { name: "Chemist", aliases: [] },
      { name: "Survey Engineer", aliases: [] },
    ],
  },
  {
    name: "Aviation",
    displayOrder: 15,
    occupations: [
      {
        name: "Licensed Aircraft Maintenance Engineer",
        aliases: [],
      },
      { name: "Aircraft Engineer", aliases: [] },
      { name: "Avionics Technician", aliases: [] },
      { name: "Pilot", aliases: [] },
      { name: "Helicopter Landing Officer", aliases: [] },
    ],
  },
  {
    name: "Construction Trades",
    displayOrder: 16,
    occupations: [
      { name: "Carpenter", aliases: [] },
      { name: "Concreter", aliases: [] },
      { name: "Spacer", aliases: [] },
      { name: "Refractory Installer", aliases: [] },
      { name: "Buffer/Grinder", aliases: [] },
    ],
  },
  {
    name: "Administration and Logistics",
    displayOrder: 17,
    occupations: [
      { name: "Storeperson", aliases: [] },
      { name: "Warehouse Officer", aliases: [] },
      { name: "Logistics Coordinator", aliases: [] },
      { name: "Materials Controller", aliases: [] },
      { name: "Scheduler/Planner", aliases: [] },
      { name: "Driver", aliases: [] },
      { name: "Admin", aliases: [] },
    ],
  },
  {
    name: "Safety and Emergency",
    displayOrder: 18,
    occupations: [
      { name: "Emergency Services Officer", aliases: [] },
      { name: "Paramedic", aliases: [] },
      { name: "HSE Advisor", aliases: [] },
      { name: "ERT Member", aliases: [] },
      { name: "Security Officer", aliases: [] },
    ],
  },
  {
    name: "Management and Supervision",
    displayOrder: 19,
    occupations: [
      { name: "Supervisor", aliases: [] },
      { name: "Coordinator", aliases: [] },
      { name: "Leading Hand", aliases: [] },
      { name: "Manager", aliases: [] },
      { name: "OIM", aliases: [] },
      { name: "Deck Foreman", aliases: [] },
      { name: "Lead Technician", aliases: [] },
    ],
  },
];

const SPECIALISATIONS = [
  { name: "Rope Access", description: "IRATA/ARAA rope access qualification" },
  { name: "Subsea", description: "Subsea-specific work qualification" },
  { name: "HV", description: "High Voltage electrical qualification" },
  { name: "EEHA", description: "Electrical Equipment in Hazardous Areas" },
  { name: "Cryogenic", description: "LNG/cryogenic systems specialisation" },
  { name: "UHP", description: "Ultra High Pressure water blasting" },
  { name: "Composite", description: "Composite materials repair" },
];

// ─── Matching rules: raw string -> canonical occupation ─────────────────────

interface MatchRule {
  canonical: string;
  group: string;
  patterns: RegExp[];
  priority: number; // higher = checked first
}

const MATCH_RULES: MatchRule[] = [
  // --- Welding and Fabrication ---
  { canonical: "Welding Inspector", group: "Welding and Fabrication", priority: 90, patterns: [/welding\s*inspector/i, /weld.*inspect/i, /api.*welding/i, /qa.*qc.*weld/i, /qc.*weld.*inspect/i] },
  { canonical: "Welding Technician", group: "Welding and Fabrication", priority: 85, patterns: [/welding\s*techni/i] },
  { canonical: "Special Class Welder", group: "Welding and Fabrication", priority: 80, patterns: [/special\s*class/i, /pressure\s*welder/i] },
  { canonical: "Coded Welder", group: "Welding and Fabrication", priority: 75, patterns: [/coded\s*(?:welder|pipe)/i, /coded\s*welding/i] },
  { canonical: "Mainline Welder", group: "Welding and Fabrication", priority: 70, patterns: [/mainline\s*welder/i] },
  { canonical: "Pipe Welder", group: "Welding and Fabrication", priority: 65, patterns: [/pipe\s*(?:welder|lay\s*welder)/i, /pipeline\s*welder/i] },
  { canonical: "Welder Helper", group: "Welding and Fabrication", priority: 60, patterns: [/welder(?:'s)?\s*(?:helper|assist|ta\b)/i, /welder\s*\/\s*ta/i, /welder\s*,\s*helper/i, /weld(?:er)?\s*hand/i, /\bta\s+welder/i, /welders?\s+ta/i] },
  { canonical: "Fabricator", group: "Welding and Fabrication", priority: 55, patterns: [/\bfabricat/i] },
  { canonical: "Boilermaker", group: "Welding and Fabrication", priority: 50, patterns: [/\bboiler\s*maker/i, /\bboilermaker/i, /\bboulermaker/i] },
  { canonical: "Welder", group: "Welding and Fabrication", priority: 40, patterns: [/\bweld(?:er|ing|r)?\b/i] },

  // --- Mechanical ---
  { canonical: "HVAC Technician", group: "Mechanical", priority: 90, patterns: [/\bhvac/i, /refrigerat/i] },
  { canonical: "Valve Technician", group: "Mechanical", priority: 88, patterns: [/\bvalve\s*tech/i] },
  { canonical: "Turbine Technician", group: "Mechanical", priority: 86, patterns: [/\bturbine/i, /\bturbomach/i] },
  { canonical: "Flange Technician", group: "Mechanical", priority: 84, patterns: [/\bflange/i] },
  { canonical: "Instrument Fitter", group: "Mechanical", priority: 82, patterns: [/\binstrument\s*fitt/i] },
  { canonical: "Tube Fitter", group: "Mechanical", priority: 80, patterns: [/\btube\s*fitt/i] },
  { canonical: "Fitter and Turner", group: "Mechanical", priority: 78, patterns: [/fitter\s*(?:and|&|\/)\s*turner/i] },
  { canonical: "Fitter Machinist", group: "Mechanical", priority: 76, patterns: [/fitter\s*(?:and\s*)?machinist/i, /fitter\s*\/\s*machinist/i, /\bmachinist/i] },
  { canonical: "Pipefitter", group: "Mechanical", priority: 74, patterns: [/\bpipe\s*fitt/i, /\bpipefitt/i, /\bpipe\s*fitting/i] },
  { canonical: "Bevel Machine Operator", group: "Mechanical", priority: 72, patterns: [/\bbevel/i, /\bbmo\b/i, /\bbmw\b/i] },
  { canonical: "Diesel Mechanic", group: "Mechanical", priority: 70, patterns: [/diesel\s*mechanic/i, /heavy\s*diesel/i, /\bhd\s*(?:mechanic|fitter)/i] },
  { canonical: "Hydraulic Mechanic", group: "Mechanical", priority: 68, patterns: [/hydraulic/i] },
  { canonical: "Deck Mechanic", group: "Mechanical", priority: 66, patterns: [/deck\s*mech/i] },
  { canonical: "Plumber", group: "Mechanical", priority: 64, patterns: [/\bplumber/i] },
  { canonical: "Mechanical Technician", group: "Mechanical", priority: 50, patterns: [/mechani.*techni/i, /mechani.*tech\b/i, /mech\s*tech/i, /\bmechanic(?:al)?\s*(?:specialist|maintenance|maintainer|operations|lead|commissioning|frontline|front-line|tradesman|tradesperson)/i] },
  { canonical: "Mechanical Fitter", group: "Mechanical", priority: 45, patterns: [/mechani.*fitt/i, /mech\s*fitt/i, /\bfitter\b/i, /mechanical\s*fiter/i] },
  { canonical: "Mechanic", group: "Mechanical", priority: 40, patterns: [/\bmechanic\b/i, /\bmechanical\b/i, /\bmech\b/i] },

  // --- Rigging and Scaffolding ---
  { canonical: "Advanced Rigger", group: "Rigging and Scaffolding", priority: 80, patterns: [/adv(?:ance(?:d)?)\s*rigg/i] },
  { canonical: "Advanced Scaffolder", group: "Rigging and Scaffolding", priority: 78, patterns: [/adv(?:ance(?:d)?)\s*scaff/i] },
  { canonical: "Dogman", group: "Rigging and Scaffolding", priority: 76, patterns: [/\bdogman/i] },
  { canonical: "Rope Access Technician", group: "Rigging and Scaffolding", priority: 30, patterns: [/^rope\s*(?:access|acces|accrss)\s*(?:tech|level|l[123]|lvl|\-|$)/i, /^rope\s*access$/i, /^rope\s*(?:access\s*)?technician/i, /^ropey$/i, /^rope\s*technician/i, /^(?:l[123]|level\s*[123])\s*(?:rope|irata|ra)\b/i, /^irata\s*level/i, /^sa[\/-]ra/i, /^ra\b/i] },
  { canonical: "Rigger", group: "Rigging and Scaffolding", priority: 50, patterns: [/\brigg/i] },
  { canonical: "Scaffolder", group: "Rigging and Scaffolding", priority: 45, patterns: [/\bscaff/i] },

  // --- Electrical and Instrumentation ---
  { canonical: "Electronics Technician", group: "Electrical and Instrumentation", priority: 92, patterns: [/\belectronics?\s*tech/i] },
  { canonical: "EEHA Inspector", group: "Electrical and Instrumentation", priority: 90, patterns: [/\beeha/i] },
  { canonical: "HV Specialist", group: "Electrical and Instrumentation", priority: 88, patterns: [/\bhv\b.*(?:specialist|rep|inlec|lng|elect)/i, /electrical.*\bhv\b/i] },
  { canonical: "Telecommunications Technician", group: "Electrical and Instrumentation", priority: 86, patterns: [/\btelecom/i, /\bcomms?\s*tech/i, /\bcommunication/i] },
  { canonical: "Electrical Trade Assistant", group: "Electrical and Instrumentation", priority: 84, patterns: [/electri.*(?:trade\s*assist|ta\b)/i] },
  // ETO handled in Marine group (user decision)
  { canonical: "Electrical Technician", group: "Electrical and Instrumentation", priority: 60, patterns: [/electri.*(?:specialist|techni)/i] },
  { canonical: "INLEC Technician", group: "Electrical and Instrumentation", priority: 55, patterns: [/\binlec/i, /\be\s*[&+@]\s*i\b/i, /\be\s*\/\s*i\b/i, /\be\s*and\s*i\b/i, /electrical.*instrument/i, /instrument.*electri/i, /instrument.*(?:&|and)\s*control/i, /\binstrument(?:ation)?\s*(?:techni|electri)/i] },
  { canonical: "Electrician", group: "Electrical and Instrumentation", priority: 40, patterns: [/\belectrici/i, /\belectrical\b/i] },

  // --- Painting and Coatings ---
  { canonical: "UHP Operator", group: "Painting and Coatings", priority: 90, patterns: [/\buhp\b/i] },
  { canonical: "Field Joint Coater", group: "Painting and Coatings", priority: 88, patterns: [/field\s*(?:joint|coat|join)/i, /\bfjc\b/i, /\bwrapper/i, /\btechnowrap/i] },
  { canonical: "Coatings Technician", group: "Painting and Coatings", priority: 86, patterns: [/\bcoat(?:ing|er|s)\b/i, /surface\s*prep/i] },
  { canonical: "Painter/Blaster", group: "Painting and Coatings", priority: 70, patterns: [/paint.*blast/i, /blast.*paint/i, /blaster.*painter/i, /painter.*blaster/i, /sandblast.*spray/i] },
  { canonical: "Blaster", group: "Painting and Coatings", priority: 55, patterns: [/\bblast/i, /\bsand\s*blast/i, /\bwater\s*blast/i] },
  { canonical: "Painter", group: "Painting and Coatings", priority: 50, patterns: [/\bpaint/i, /\bchartek/i, /\bspray\s*paint/i] },

  // --- Insulation and Cladding ---
  { canonical: "Fireproofer", group: "Insulation and Cladding", priority: 90, patterns: [/\bfire\s*proof/i] },
  { canonical: "Lagger/Cladder", group: "Insulation and Cladding", priority: 80, patterns: [/\blagg/i, /\bcladd/i] },
  { canonical: "Insulator", group: "Insulation and Cladding", priority: 70, patterns: [/\binsulat/i, /\bcryogenic/i] },
  { canonical: "Sheet Metal Worker", group: "Insulation and Cladding", priority: 60, patterns: [/\bsheet\s*metal/i, /\bsheetmetal/i, /\bsmw\b/i] },

  // --- Operations and Process ---
  { canonical: "Commissioning Technician", group: "Operations and Process", priority: 92, patterns: [/\bcommission/i] },
  { canonical: "Radio Operator", group: "Operations and Process", priority: 90, patterns: [/\bradio\s*op/i] },
  { canonical: "Line Up Operator", group: "Operations and Process", priority: 88, patterns: [/line[\s-]*up/i, /\blineup/i] },
  { canonical: "Gas Systems Operator", group: "Operations and Process", priority: 86, patterns: [/\bgas\s*(?:sys|pipeline)/i] },
  { canonical: "Pipeline Controller", group: "Operations and Process", priority: 84, patterns: [/\bpipeline\s*con/i] },
  { canonical: "Control Room Technician", group: "Operations and Process", priority: 82, patterns: [/control\s*room\s*tech/i, /\bccr\s*tech/i, /\bccr\b/i, /\blng\s*ccr/i, /\bcontrol\s*room\b/i] },
  { canonical: "Control Room Operator", group: "Operations and Process", priority: 80, patterns: [/control\s*room\s*op/i, /\bccr\s*op/i, /\bballast\s*control/i, /remote.*control.*room/i] },
  { canonical: "Production Specialist", group: "Operations and Process", priority: 78, patterns: [/production\s*specialist/i] },
  { canonical: "Production Maintenance Technician", group: "Operations and Process", priority: 76, patterns: [/production\s*maint/i, /\bmaintenance\s*(?:specialist|techni)/i] },
  { canonical: "Field Operator", group: "Operations and Process", priority: 74, patterns: [/\bfield\s*op/i, /\bfeild\s*op/i] },
  { canonical: "Plant Operator", group: "Operations and Process", priority: 72, patterns: [/\bplant\s*op/i, /\bbatch\s*plant/i] },
  { canonical: "Process Technician", group: "Operations and Process", priority: 70, patterns: [/\bprocess\s*tech/i] },
  { canonical: "Process Operator", group: "Operations and Process", priority: 68, patterns: [/\bprocess\s*op/i] },
  { canonical: "Operations Technician", group: "Operations and Process", priority: 66, patterns: [/\boperation(?:s)?\s*tech/i, /\bops?\s*tech/i] },
  { canonical: "General Service Operator", group: "Operations and Process", priority: 64, patterns: [/\bgso\b/i, /\bgeneral\s*servi/i, /\bgs\s*tech/i] },
  { canonical: "Service Technician", group: "Operations and Process", priority: 62, patterns: [/\bservice\s*tech/i, /\bservice\s*provid/i, /\bplatform\s*service/i, /\bindustrial\s*servi/i] },
  { canonical: "Production Technician", group: "Operations and Process", priority: 55, patterns: [/\bprod(?:uction)?\s*tech/i, /\bproduction\b/i] },
  { canonical: "Production Operator", group: "Operations and Process", priority: 50, patterns: [/\boperator\b/i, /\boperat(?:or|er|ion|e)/i] },

  // --- Marine ---
  { canonical: "Hydrographic Surveyor", group: "Marine", priority: 95, patterns: [/\bhydrograph/i, /\bsurvey\s*eng/i, /\bsurvey(?:or)?\b/i] },
  { canonical: "Marine Technician", group: "Marine", priority: 92, patterns: [/marine\s*(?:tech|service|lead|ops|support)/i, /storage.*loading.*(?:tech|marine)/i] },
  { canonical: "Electro-Technical Officer", group: "Marine", priority: 90, patterns: [/\beto\b/i, /electro[\s-]*tech.*offic/i] },
  { canonical: "Dynamic Positioning Officer", group: "Marine", priority: 88, patterns: [/\b[st]?dpo\b/i, /dynamic\s*position/i] },
  { canonical: "Marine Engineer", group: "Marine", priority: 85, patterns: [/marine\s*eng/i, /\b(?:1st|2nd|first|second|chief)\s*eng/i, /\bengineering\s*officer/i, /marine\s*engine\b/i] },
  { canonical: "Master", group: "Marine", priority: 82, patterns: [/\bmaster\b/i, /\bcaptain\b/i, /\bshipmaster/i, /\bvessel\s*master/i] },
  { canonical: "Chief Officer", group: "Marine", priority: 80, patterns: [/\bchief\s*(?:officer|mate)/i, /\bc\/o\b/i] },
  { canonical: "Deck Officer", group: "Marine", priority: 78, patterns: [/\bdeck\s*offic/i, /\b1st\s*offic/i, /\bbridge\s*offic/i, /\bship(?:'s)?\s*offic/i, /\bnavigation\s*offic/i, /\bmarine\s*(?:deck|offic|navig)/i, /\bshore\s*offic/i] },
  { canonical: "Second Officer", group: "Marine", priority: 76, patterns: [/\b(?:2nd|second)\s*offic/i, /\b2\/o\b/i, /\bcasual\s*second/i] },
  { canonical: "Second Mate", group: "Marine", priority: 74, patterns: [/\b(?:2nd|second)\s*mate/i, /\boow\b/i] },
  { canonical: "Bosun", group: "Marine", priority: 72, patterns: [/\bbosun/i] },
  { canonical: "Integrated Rating", group: "Marine", priority: 70, patterns: [/\bintegrated\s*rat/i, /\bseaman\b/i, /\bmerchant\s*seaman/i, /\bab\b/i] },
  { canonical: "Deck Crew", group: "Marine", priority: 68, patterns: [/\bdeck\s*(?:crew|hand|cadet|watch)/i, /\bdeckhand/i, /\bwatch\s*keep/i] },
  { canonical: "Motorman", group: "Marine", priority: 66, patterns: [/\bmotorman/i, /\boiler\b/i] },
  { canonical: "Seafarer", group: "Marine", priority: 50, patterns: [/\bseafar/i, /\bmarine\b/i, /\bmariner\b/i, /\bships?\s*offic/i] },

  // --- Lifting and Cranes ---
  { canonical: "Crane Technician", group: "Lifting and Cranes", priority: 80, patterns: [/crane\s*tech/i] },
  { canonical: "Crane Operator", group: "Lifting and Cranes", priority: 70, patterns: [/\bcrane/i, /\blifting\b/i] },

  // --- Inspection and NDT ---
  { canonical: "Topside Inspector", group: "Inspection and NDT", priority: 92, patterns: [/topside\s*inspect/i, /top\s*side\s*inspect/i] },
  { canonical: "Quality Inspector", group: "Inspection and NDT", priority: 90, patterns: [/quality\s*inspect/i, /qa.*qc.*inspect/i, /te\s*&\s*qa/i] },
  { canonical: "Hull Tank Inspector", group: "Inspection and NDT", priority: 88, patterns: [/hull\s*tank/i] },
  { canonical: "NACE Inspector", group: "Inspection and NDT", priority: 86, patterns: [/\bnace\b/i] },
  { canonical: "Corrosion Technician", group: "Inspection and NDT", priority: 84, patterns: [/\bcorrosion/i] },
  { canonical: "Inspection Supervisor", group: "Inspection and NDT", priority: 82, patterns: [/inspect.*(?:supervis|lead|coord)/i] },
  { canonical: "AICIP Inspector", group: "Inspection and NDT", priority: 80, patterns: [/\baicip/i] },
  { canonical: "API Inspector", group: "Inspection and NDT", priority: 78, patterns: [/\bapi[\s-]*(?:510|570|inspect)/i] },
  { canonical: "Plant Inspector", group: "Inspection and NDT", priority: 76, patterns: [/plant\s*inspect/i, /onboard\s*inspect/i, /multi\s*skilled\s*plant/i] },
  { canonical: "NDT Technician", group: "Inspection and NDT", priority: 60, patterns: [/\bndt\b/i, /\bcswip/i, /\baut\s*scan/i, /non[\s-]*destruct/i, /\binspect/i] },

  // --- ROV and Subsea ---
  { canonical: "ROV Superintendent", group: "ROV and Subsea", priority: 95, patterns: [/rov\s*superintendent/i] },
  { canonical: "ROV Supervisor", group: "ROV and Subsea", priority: 90, patterns: [/rov\s*(?:super(?:visor)?|supv|superior|senior\s*super)/i] },
  { canonical: "ROV Submersible Engineer", group: "ROV and Subsea", priority: 88, patterns: [/rov\s*sub/i, /submersible/i, /sub\s*(?:sea\s*)?eng/i, /senior\s*tech\s*\/\s*sub/i] },
  { canonical: "ROV Pilot Technician", group: "ROV and Subsea", priority: 85, patterns: [/rov\s*(?:pilot\s*tech|pt\b|spt\b|senior\s*pilot)/i, /rov\s*pilot\s*\/\s*tech/i, /senior\s*pilot\s*tech/i, /remotely\s*operated\s*vehicle\s*pilot/i, /sub\s*engineer\s*\/\s*pilot/i] },
  { canonical: "ROV Pilot", group: "ROV and Subsea", priority: 80, patterns: [/rov\s*pilot/i, /remote\s*vehicle\s*op/i] },
  { canonical: "ROV Technician", group: "ROV and Subsea", priority: 75, patterns: [/rov\s*(?:tech|senior\s*tech)/i] },
  { canonical: "ROV Trainee", group: "ROV and Subsea", priority: 73, patterns: [/rov\s*trainee/i] },
  { canonical: "Subsea Supervisor", group: "ROV and Subsea", priority: 70, patterns: [/subsea\s*(?:supervis|field\s*spec)/i] },
  { canonical: "Subsea Engineer", group: "ROV and Subsea", priority: 68, patterns: [/subsea/i] },
  { canonical: "Diver", group: "ROV and Subsea", priority: 60, patterns: [/\bdiver\b/i] },
  { canonical: "ROV Pilot", group: "ROV and Subsea", priority: 50, patterns: [/\brov\b/i] },

  // --- Drilling ---
  { canonical: "Toolpusher", group: "Drilling", priority: 90, patterns: [/\btoolpush/i] },
  { canonical: "Assistant Driller", group: "Drilling", priority: 85, patterns: [/assist.*drill/i] },
  { canonical: "Directional Driller", group: "Drilling", priority: 83, patterns: [/direction.*drill/i] },
  { canonical: "Driller", group: "Drilling", priority: 80, patterns: [/\bdrill/i] },
  { canonical: "Derrickman", group: "Drilling", priority: 78, patterns: [/\bderrick/i] },
  { canonical: "Floorhand", group: "Drilling", priority: 76, patterns: [/\bfloor\s*(?:hand|man)/i] },
  { canonical: "Roughneck", group: "Drilling", priority: 74, patterns: [/\broughneck/i] },
  { canonical: "Roustabout", group: "Drilling", priority: 72, patterns: [/\broustabout/i, /\brousty/i] },
  { canonical: "Casing Hand", group: "Drilling", priority: 70, patterns: [/\bcasing/i] },

  // --- Catering and Hospitality ---
  { canonical: "Camp Boss", group: "Catering and Hospitality", priority: 90, patterns: [/\bcamp\s*boss/i] },
  { canonical: "Chief Caterer", group: "Catering and Hospitality", priority: 88, patterns: [/chief\s*caterer/i, /\bcatering\b/i] },
  { canonical: "Galley Hand", group: "Catering and Hospitality", priority: 86, patterns: [/\bgalley/i] },
  { canonical: "Baker", group: "Catering and Hospitality", priority: 84, patterns: [/\bbaker\b/i] },
  { canonical: "Steward", group: "Catering and Hospitality", priority: 82, patterns: [/\bsteward/i, /\bstewart\b/i] },
  { canonical: "Service Attendant", group: "Catering and Hospitality", priority: 80, patterns: [/\bservice\s*attend/i] },
  { canonical: "Cleaner", group: "Catering and Hospitality", priority: 78, patterns: [/\bclean/i, /\bjanitor/i] },
  { canonical: "Utility", group: "Catering and Hospitality", priority: 70, patterns: [/\butility/i, /\butlitly/i, /\butes?\b/i, /\blaundry/i, /\bpeggy\b/i] },
  { canonical: "Cook", group: "Catering and Hospitality", priority: 60, patterns: [/\bcook\b/i] },
  { canonical: "Chef", group: "Catering and Hospitality", priority: 50, patterns: [/\bchef\b/i, /\bwellness\s*coach/i, /\bhospitality/i] },

  // --- Aviation ---
  { canonical: "Helicopter Landing Officer", group: "Aviation", priority: 90, patterns: [/helicopter\s*(?:land|refuel|admin)/i, /\bheli[\s-]*admin/i, /\bramp\s*(?:offic|assist|attend)/i] },
  { canonical: "Avionics Technician", group: "Aviation", priority: 88, patterns: [/\bavionics/i] },
  { canonical: "Licensed Aircraft Maintenance Engineer", group: "Aviation", priority: 80, patterns: [/\blame\b/i, /licen[cs]ed?\s*(?:aircraft|helicopter|maintenance)/i, /aircraft\s*maint/i, /aviation\s*maint/i, /\bb[12](?:\.[13])?\s*(?:lame|licen)/i, /\bb[12]\b/i, /helicopter\s*(?:l\.a\.m\.e|lame|engineer|maint)/i, /lead\s*engineer.*lame/i] },
  { canonical: "Pilot", group: "Aviation", priority: 70, patterns: [/\bpilot\b(?!.*(?:rov|tech))/i] },
  { canonical: "Aircraft Engineer", group: "Aviation", priority: 60, patterns: [/\baircraft/i, /\baviation/i, /\bhelicopter/i] },

  // --- Construction Trades ---
  { canonical: "Refractory Installer", group: "Construction Trades", priority: 90, patterns: [/\brefractor/i] },
  { canonical: "Concreter", group: "Construction Trades", priority: 80, patterns: [/\bconcre/i] },
  { canonical: "Spacer", group: "Construction Trades", priority: 70, patterns: [/\bspacer\b/i] },
  { canonical: "Carpenter", group: "Construction Trades", priority: 60, patterns: [/\bcarpenter/i] },

  // --- Administration and Logistics ---
  { canonical: "Scheduler/Planner", group: "Administration and Logistics", priority: 90, patterns: [/\bschedul/i, /\bplanner/i, /\bplanning/i] },
  { canonical: "Admin", group: "Administration and Logistics", priority: 88, patterns: [/\badmin\b/i] },
  { canonical: "Driver", group: "Administration and Logistics", priority: 86, patterns: [/\bdriver\b/i, /\btruck\b/i, /\btransport\b/i] },
  { canonical: "Materials Controller", group: "Administration and Logistics", priority: 84, patterns: [/\bmaterial(?:s)?\s*(?:controll|lead|coord|comtrol)/i] },
  { canonical: "Logistics Coordinator", group: "Administration and Logistics", priority: 82, patterns: [/\blogist/i] },
  { canonical: "Warehouse Officer", group: "Administration and Logistics", priority: 70, patterns: [/\bwarehou/i] },
  { canonical: "Storeperson", group: "Administration and Logistics", priority: 60, patterns: [/\bstore/i, /\bstorman/i] },

  // --- Safety and Emergency ---
  { canonical: "ERT Member", group: "Safety and Emergency", priority: 90, patterns: [/\bert\b/i] },
  { canonical: "HSE Advisor", group: "Safety and Emergency", priority: 85, patterns: [/\bhse\b/i, /\bsheq\b/i, /\bsafety\b/i, /\bhsec\b/i, /occupational\s*health/i] },
  { canonical: "Paramedic", group: "Safety and Emergency", priority: 80, patterns: [/\bparamedic/i, /\bmedic\b/i] },
  { canonical: "Emergency Services Officer", group: "Safety and Emergency", priority: 70, patterns: [/\bemergenc/i, /\beso\b/i, /\bfire(?:\s|&)/i, /\bfirefight/i] },

  // --- Management and Supervision ---
  { canonical: "OIM", group: "Management and Supervision", priority: 90, patterns: [/\boim\b/i] },
  { canonical: "Deck Foreman", group: "Management and Supervision", priority: 88, patterns: [/deck\s*(?:foreman|forman|supervis)/i] },
  { canonical: "Lead Technician", group: "Management and Supervision", priority: 86, patterns: [/lead\s*(?:tech|service|prod|inlec|marine|mech|crane|e\s*and)/i] },
  { canonical: "Coordinator", group: "Management and Supervision", priority: 80, patterns: [/\bcoordinator/i, /\bco[\s-]*ordinator/i] },
  { canonical: "Leading Hand", group: "Management and Supervision", priority: 78, patterns: [/\bleading\s*hand/i, /\bl\/h\b/i, /\blh\b/i] },
  { canonical: "Manager", group: "Management and Supervision", priority: 76, patterns: [/\bmanager\b/i] },
  { canonical: "Supervisor", group: "Management and Supervision", priority: 50, patterns: [/\bsupervis/i, /\bsuperintend/i, /\bforeman\b/i, /\bforman\b/i] },

  // --- Engineering and Technical ---
  { canonical: "Laboratory Analyst", group: "Engineering and Technical", priority: 90, patterns: [/\blab(?:oratory)?\s*(?:analyst|tech)/i] },
  { canonical: "Chemist", group: "Engineering and Technical", priority: 85, patterns: [/\bchemist\b/i] },
  { canonical: "Survey Engineer", group: "Engineering and Technical", priority: 83, patterns: [/\bsurvey/i] },
  { canonical: "Field Service Engineer", group: "Engineering and Technical", priority: 80, patterns: [/field\s*service\s*eng/i, /\bfse\b/i] },
  { canonical: "Engineer", group: "Engineering and Technical", priority: 50, patterns: [/\bengineer\b/i, /\btechni(?:cal)?\s*(?:support\s*)?engineer/i] },

  // --- Operations catch-alls (low priority) ---
  { canonical: "Trade Assistant", group: "Operations and Process", priority: 30, patterns: [/\btrade\s*assist/i, /\btrades?\s*assist/i, /\btrade\s*person/i, /\btrades\s*person/i, /\bt\s*[.\/]\s*a\b/i, /^ta$/i, /^t\.a$/i, /\btried\s*assist/i, /\bhelper\b/i, /\blabourer\b/i, /\blabour/i, /\border\s*helper/i, /\byard\s*(?:labour|person)/i, /\bstructural.*ata/i] },
  { canonical: "Technician", group: "Operations and Process", priority: 20, patterns: [/^tech(?:nician)?$/i, /^mech$/i, /^spec$/i, /^specialist$/i, /^maintenance$/i, /\bmaintenance\s*(?:fotter|specialist)/i, /\bmaintenence/i, /\bindustrial\s*techni/i, /\bfield\s*tech/i, /\bproject\s*tech/i, /\blng\s*tech/i, /\bcatalyst\s*tech/i, /\bqmi\b/i, /\bcontrol\s*specialist/i, /\binlet\b/i, /\btwr\b/i, /\bi\s*&\s*c\b/i] },
  { canonical: "Production Operator", group: "Operations and Process", priority: 15, patterns: [/^operator$/i, /^operater$/i, /^operrater/i, /^operations$/i, /^utilities$/i, /^deck$/i] },

  // --- Additional catch-alls ---
  { canonical: "Buffer/Grinder", group: "Construction Trades", priority: 70, patterns: [/\bbuffer/i, /\bgrinder/i] },
  { canonical: "Security Officer", group: "Safety and Emergency", priority: 70, patterns: [/\bsecurity\b/i] },
  { canonical: "Marine Inspector", group: "Inspection and NDT", priority: 75, patterns: [/\bmarine\s*inspect/i, /\bpressure\s*vessel\s*inspect/i] },
  { canonical: "Diver", group: "ROV and Subsea", priority: 55, patterns: [/\bpumphand/i] },

  // --- Additional specific matches ---
  { canonical: "Deck Foreman", group: "Management and Supervision", priority: 75, patterns: [/\bdfo\b/i] },
  { canonical: "ROV Pilot Technician", group: "ROV and Subsea", priority: 60, patterns: [/^pilot\s*tech/i] },
  { canonical: "Coatings Technician", group: "Painting and Coatings", priority: 60, patterns: [/\bcoatings?\s*(?:remediation|techni)/i] },
  { canonical: "Field Service Engineer", group: "Engineering and Technical", priority: 60, patterns: [/\bfield\s*service/i, /\bfield\s*specialist/i] },
  { canonical: "Storeperson", group: "Administration and Logistics", priority: 30, patterns: [/\bwaste\s*manage/i] },

  // Catch remaining edge cases
  { canonical: "Rope Access Technician", group: "Rigging and Scaffolding", priority: 28, patterns: [/rope\s*access\s*(?:tehn|lead|team)/i, /\baccess\s*(?:lead|tech)/i, /\blevel\s*3$/i, /^level\s*3$/i] },
  { canonical: "Scaffolder", group: "Rigging and Scaffolding", priority: 27, patterns: [/sacff/i] },
  { canonical: "Second Officer", group: "Marine", priority: 25, patterns: [/\bdeck\s*mate/i] },
  { canonical: "Production Maintenance Technician", group: "Operations and Process", priority: 25, patterns: [/\bfabric\s*maint/i, /\bhabitat/i, /\bcore\s*maint/i] },
  { canonical: "HSE Advisor", group: "Safety and Emergency", priority: 25, patterns: [/\bradiation\s*advis/i, /\bnotification\s*offic/i] },

  // --- Very generic fallbacks ---
  { canonical: "Seafarer", group: "Marine", priority: 10, patterns: [/^officer$/i, /^ships?\s*officer$/i, /^nautical\s*cadet$/i] },
  { canonical: "Utility", group: "Catering and Hospitality", priority: 10, patterns: [/^full\s*time$/i, /^varied$/i, /^offshore$/i, /^offshore\s*worker$/i, /^oil\s*and\s*gas$/i, /^contractor$/i, /^all\s*rounder$/i, /^utilities$/i] },
  { canonical: "INLEC Technician", group: "Electrical and Instrumentation", priority: 8, patterns: [/\bi\s*[&+]\s*e\b/i, /\bi\s*&\s*e\b/i] },
  { canonical: "Technician", group: "Operations and Process", priority: 5, patterns: [/\btechni/i, /\bspecialist/i, /\bpmt\b/i, /\bpst\b/i, /\bpot\b/i, /\bmlc?\b/i, /\bmlo\b/i, /\brms\b/i, /\bcrew\s*chief/i, /\bmac\s*lead/i, /\bskilled\s*serv/i, /\bcat\s*tech/i, /\bcomposite\s*tech/i, /\bcrayonic/i, /\btrainee$/i] },
  { canonical: "Trade Assistant", group: "Operations and Process", priority: 3, patterns: [/\borganiser\b/i, /\brunner\b/i, /\bplug\b/i, /\bpool\b/i, /^pr$/i] },
  { canonical: "Lead Technician", group: "Management and Supervision", priority: 3, patterns: [/\bteam\s*lead/i, /\barea\s*team/i] },
  { canonical: "Driller", group: "Drilling", priority: 3, patterns: [/\bdual\s*dd/i, /\blwd\b/i] },
];

// Sort by priority descending within each group, then overall
const sortedRules = [...MATCH_RULES].sort((a, b) => b.priority - a.priority);

// ─── Employer/project prefixes to strip ─────────────────────────────────────

const EMPLOYER_PREFIXES = [
  /\bchevron\b/i, /\bwoodside\b/i, /\btechnip\b/i, /\bsmp\b/i,
  /\bcrux\b/i, /\beni\b/i, /\bsiem\b/i, /\btastelife\b/i,
  /\bs&l\b/i, /\bupstream\b/i, /\bcsu\b/i,
  /\bflexilay\b/i, /\btrs\b/i, /\bcampaign\b/i,
];

// ─── Specialisation extraction ──────────────────────────────────────────────

const SPEC_PATTERNS: { pattern: RegExp; spec: string }[] = [
  { pattern: /\brope\s*(?:access|acces|accrss|tech(?:nician)?)\b/i, spec: "Rope Access" },
  { pattern: /\b(?:ra|ropey|irata)\b/i, spec: "Rope Access" },
  { pattern: /\bsubsea\b/i, spec: "Subsea" },
  { pattern: /\bhv\b/i, spec: "HV" },
  { pattern: /\beeha\b/i, spec: "EEHA" },
  { pattern: /\bcryogenic\b/i, spec: "Cryogenic" },
  { pattern: /\buhp\b/i, spec: "UHP" },
  { pattern: /\bcomposite\b/i, spec: "Composite" },
];

// ─── Processing ─────────────────────────────────────────────────────────────

interface ProcessedEntry {
  raw: string;
  count: number;
  canonical: string;
  group: string;
  specialisations: string[];
  secondaryOccupations: string[];
  unmatchedParts: string[];
}

function stripEmployerPrefixes(s: string): string {
  let result = s;
  for (const prefix of EMPLOYER_PREFIXES) {
    result = result.replace(prefix, "").trim();
  }
  return result.replace(/\s+/g, " ").trim();
}

function extractSpecialisations(s: string): { cleaned: string; specs: string[] } {
  const specs: string[] = [];
  let cleaned = s;
  for (const { pattern, spec } of SPEC_PATTERNS) {
    if (pattern.test(cleaned)) {
      if (!specs.includes(spec)) specs.push(spec);
    }
  }
  return { cleaned, specs };
}

function matchCanonical(raw: string): { canonical: string; group: string } | null {
  for (const rule of sortedRules) {
    for (const pattern of rule.patterns) {
      if (pattern.test(raw)) {
        return { canonical: rule.canonical, group: rule.group };
      }
    }
  }
  return null;
}

function splitDualOccupations(raw: string): string[] {
  const preservedCombinations = [
    /fitter\s*(?:and|&)\s*turner/i,
    /painter\s*[\/&]\s*blaster/i,
    /blaster\s*[\/&]\s*painter/i,
    /lagger\s*[\/&]\s*cladder/i,
    /cladder\s*[\/&]\s*lagger/i,
    /field\s*joint/i,
    /rope\s*access/i,
    /e\s*[&+]\s*i/i,
    /e\s*\/\s*i/i,
    /fire\s*&\s*emergency/i,
    /qa\s*\/?\s*qc/i,
  ];

  for (const p of preservedCombinations) {
    if (p.test(raw)) return [raw];
  }

  const parts = raw.split(/\s*[\/,]\s*/).filter((p) => p.trim().length > 1);
  if (parts.length > 1) return parts;
  return [raw];
}

function processAll(rawEntries: string[]): {
  entries: ProcessedEntry[];
  unmatched: { raw: string; count: number }[];
} {
  const counts = new Map<string, number>();
  for (const r of rawEntries) {
    counts.set(r, (counts.get(r) || 0) + 1);
  }

  const unique = [...counts.keys()];
  const entries: ProcessedEntry[] = [];
  const unmatched: { raw: string; count: number }[] = [];

  for (const raw of unique) {
    const count = counts.get(raw)!;
    const stripped = stripEmployerPrefixes(raw);
    const { specs } = extractSpecialisations(stripped);

    const parts = splitDualOccupations(stripped);
    const primaryPart = parts[0];
    const secondaryParts = parts.slice(1);

    const match = matchCanonical(primaryPart);
    if (!match) {
      const fullMatch = matchCanonical(stripped);
      if (fullMatch) {
        entries.push({
          raw,
          count,
          canonical: fullMatch.canonical,
          group: fullMatch.group,
          specialisations: specs,
          secondaryOccupations: [],
          unmatchedParts: [],
        });
      } else {
        unmatched.push({ raw, count });
      }
      continue;
    }

    const secondaryOccupations: string[] = [];
    const unmatchedParts: string[] = [];
    for (const part of secondaryParts) {
      const secMatch = matchCanonical(part.trim());
      if (secMatch) {
        secondaryOccupations.push(secMatch.canonical);
      } else if (part.trim().length > 2) {
        unmatchedParts.push(part.trim());
      }
    }

    entries.push({
      raw,
      count,
      canonical: match.canonical,
      group: match.group,
      specialisations: specs,
      secondaryOccupations,
      unmatchedParts,
    });
  }

  return { entries, unmatched };
}

// ─── SQL generation ─────────────────────────────────────────────────────────

function escapeSQL(s: string): string {
  return s.replace(/'/g, "''");
}

function generateSQL(entries: ProcessedEntry[]): string {
  const lines: string[] = [];
  lines.push("-- ============================================================");
  lines.push("-- Seed: occupation groups, specialisations, canonical occupations, aliases");
  lines.push("-- Generated by build-occupation-taxonomy.ts");
  lines.push("-- ============================================================");
  lines.push("");

  // Groups
  lines.push("-- 1. Occupation groups");
  for (const g of GROUPS) {
    lines.push(
      `INSERT INTO occupation_groups (name, display_order) VALUES ('${escapeSQL(g.name)}', ${g.displayOrder}) ON CONFLICT (name) DO NOTHING;`
    );
  }
  lines.push("");

  // Specialisations
  lines.push("-- 2. Specialisations");
  for (const s of SPECIALISATIONS) {
    lines.push(
      `INSERT INTO specialisations (name, description) VALUES ('${escapeSQL(s.name)}', '${escapeSQL(s.description)}') ON CONFLICT (name) DO NOTHING;`
    );
  }
  lines.push("");

  // Occupations with group FK
  lines.push("-- 3. Canonical occupations");
  for (const g of GROUPS) {
    lines.push(`-- Group: ${g.name}`);
    for (const occ of g.occupations) {
      lines.push(
        `INSERT INTO occupations (canonical_name, occupation_group_id, category) VALUES ('${escapeSQL(occ.name)}', (SELECT group_id FROM occupation_groups WHERE name = '${escapeSQL(g.name)}'), NULL) ON CONFLICT (canonical_name) DO UPDATE SET occupation_group_id = EXCLUDED.occupation_group_id;`
      );
    }
    lines.push("");
  }

  // Aliases from matched entries
  lines.push("-- 4. Occupation aliases (from raw data)");
  const aliasesByCanonical = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!aliasesByCanonical.has(e.canonical)) {
      aliasesByCanonical.set(e.canonical, new Set());
    }
    const aliasSet = aliasesByCanonical.get(e.canonical)!;
    const lower = e.raw.toLowerCase().trim();
    if (lower !== e.canonical.toLowerCase()) {
      aliasSet.add(e.raw.trim());
    }
  }

  for (const [canonical, aliases] of aliasesByCanonical) {
    if (aliases.size === 0) continue;
    lines.push(`-- Aliases for: ${canonical}`);
    for (const alias of [...aliases].sort()) {
      lines.push(
        `INSERT INTO occupation_aliases (occupation_id, alias_name, source) VALUES ((SELECT occupation_id FROM occupations WHERE canonical_name = '${escapeSQL(canonical)}'), '${escapeSQL(alias)}', 'import') ON CONFLICT DO NOTHING;`
      );
    }
  }

  return lines.join("\n");
}

// ─── Main ───────────────────────────────────────────────────────────────────

const xlsxPath = path.join(__dirname, "..", "public", "occupations.xlsx");
const wb = XLSX.readFile(xlsxPath);
const ws = wb.Sheets[wb.SheetNames[0]];
const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

const rawValues = data
  .slice(1) // skip header
  .flat()
  .filter((v): v is string => v != null && String(v).trim().length > 0)
  .map((v) => String(v).trim());

console.log(`Parsed ${rawValues.length} total entries, ${new Set(rawValues).size} unique`);

const { entries, unmatched } = processAll(rawValues);

// Build review JSON
const groupSummary: Record<string, Record<string, { count: number; aliases: string[] }>> = {};
for (const g of GROUPS) {
  groupSummary[g.name] = {};
  for (const occ of g.occupations) {
    groupSummary[g.name][occ.name] = { count: 0, aliases: [] };
  }
}

for (const e of entries) {
  if (groupSummary[e.group] && groupSummary[e.group][e.canonical]) {
    groupSummary[e.group][e.canonical].count += e.count;
    if (e.raw.toLowerCase().trim() !== e.canonical.toLowerCase()) {
      groupSummary[e.group][e.canonical].aliases.push(e.raw);
    }
  }
}

const review = {
  summary: {
    totalRaw: rawValues.length,
    uniqueRaw: new Set(rawValues).size,
    matched: entries.length,
    matchedTotal: entries.reduce((s, e) => s + e.count, 0),
    unmatched: unmatched.length,
    unmatchedTotal: unmatched.reduce((s, e) => s + e.count, 0),
  },
  groups: groupSummary,
  specialisations: SPECIALISATIONS.map((s) => s.name),
  unmatched: unmatched.sort((a, b) => b.count - a.count),
};

const outDir = path.join(__dirname, "..");
const reviewPath = path.join(outDir, "occupation-taxonomy-review.json");
const sqlPath = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
  "20260407010000_seed_occupations.sql"
);

fs.writeFileSync(reviewPath, JSON.stringify(review, null, 2));
console.log(`Review JSON written to: ${reviewPath}`);

const sql = generateSQL(entries);
fs.writeFileSync(sqlPath, sql);
console.log(`Seed SQL written to: ${sqlPath}`);

// Print summary
console.log("\n=== SUMMARY ===");
console.log(`Matched: ${entries.length} unique (${entries.reduce((s, e) => s + e.count, 0)} total)`);
console.log(`Unmatched: ${unmatched.length} unique (${unmatched.reduce((s, e) => s + e.count, 0)} total)`);
console.log("\nTop unmatched:");
unmatched.slice(0, 30).forEach((u) => console.log(`  ${u.count}x | ${u.raw}`));

console.log("\nGroup breakdown:");
for (const g of GROUPS) {
  const groupEntries = entries.filter((e) => e.group === g.name);
  const total = groupEntries.reduce((s, e) => s + e.count, 0);
  console.log(`  ${g.name}: ${groupEntries.length} unique, ${total} total`);
}
