"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  fetchApi,
  API_FETCH_TIMEOUT_UPLOAD_MS,
  API_FETCH_TIMEOUT_LLM_MS,
} from "@/lib/api/fetch-api";
import { matchWorksiteCandidates } from "@/lib/utils/worksite-fuzzy";
import type { WorksiteCandidate } from "@/lib/utils/worksite-fuzzy";
import type { ParsedWorkerRow, ParsedWorkerGroup } from "@/app/api/worker-import/parse/route";
import { parseMembershipStatus } from "@/lib/workers/worker-import-membership";
import type {
  WorkerImportAssessmentColumn,
  WorkerImportRow,
  WorkerImportRowResult,
} from "@/app/api/worker-import/apply/route";
import type { CampaignOuType, Worksite, WorksiteType } from "@/types/database";
import { WORKSITE_TYPES } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Search,
  X,
  AlertTriangle,
  Users,
  Building2,
  Plus,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type WizardStep =
  | "upload"
  | "column_mapping"
  | "value_mapping"
  | "assessment_mapping"
  | "employer_selection"
  | "worksite_matching"
  | "ou_matching"
  | "occupation_matching"
  | "row_review"
  | "dedup_check"
  | "confirm"
  | "done";

type FileFormat = "group" | "header";

type MappableField =
  | "reference_id"
  | "first_name"
  | "last_name"
  | "full_name"
  | "preferred_name"
  | "email"
  | "phone"
  | "worksite"
  | "organising_unit"
  | "occupation"
  | "assessment"
  | "membership_status"
  | "member_role_type"
  | "join_date"
  | "rejoin_date"
  | "notes"
  | "other_union"
  | "ignore";

interface ColumnMapping {
  header: string;
  field: MappableField;
}

interface WorksiteResolution {
  groupName: string;
  worksiteId: number | null;
  worksiteName: string | null;
  candidates: WorksiteCandidate[];
  confirmed: boolean;
  createdDuringImport?: boolean;
}

interface OuResolution {
  rawValue: string;
  occurrences: number;
  ouId: number | null;
  ouName: string | null;
  candidates: { ou_id: number; name: string; ou_type: string; score: number }[];
  confirmed: boolean;
  createdDuringImport?: boolean;
}

interface ValueResolution {
  columnHeader: string;
  targetField: "membership_status" | "member_role_type";
  rawValue: string;
  occurrences: number;
  resolvedId: number | null;
  resolvedLabel: string | null;
  confirmed: boolean;
}

interface MemberRoleType {
  role_type_id: number;
  role_name: string;
  display_name: string;
}

interface ReviewRow extends ParsedWorkerRow {
  groupName: string;
  resolvedWorksiteId: number | null;
  resolvedWorksiteName: string | null;
  resolvedOuId: number | null;
  resolvedOuName: string | null;
  /** Notes from a mapped column or user-entered */
  notes: string | null;
  /** Join date from mapped column (ISO date string or null) */
  joinDate: string | null;
  /** Re-join date from mapped column (ISO date string or null) */
  rejoinDate: string | null;
  /** Raw occupation / job title string from the import file */
  rawOccupation: string | null;
  /** Resolved FK into occupations table */
  resolvedOccupationId: number | null;
  createOccupationName?: string | null;
  additionalOccupationIds?: number[];
  specialisationIds?: number[];
  createSpecialisationNames?: string[];
  assessmentEvents?: WorkerImportRow["assessmentEvents"];
  overrideFirstName?: string;
  overrideLastName?: string;
  overridePreferredName?: string;
  overrideReferenceId?: string;
  overridePhone?: string;
  overrideEmail?: string;
  overrideNotes?: string;
  overrideJoinDate?: string;
  overrideRejoinDate?: string;
  /** When set (including null), overrides parsed unionMembershipTypeKey → id */
  overrideUnionMembershipTypeId?: number | null;
  /** Role type from value-mapping step */
  resolvedMemberRoleTypeId?: number | null;
}

interface DedupMatch {
  rowIndex: number;
  existingWorkerId: number;
  existingFirstName: string;
  existingLastName: string;
  existingEmail: string | null;
  existingPhone: string | null;
  existingWorksiteName: string | null;
  matchedOn: "reference_id" | "email" | "phone";
  action: "update" | "skip" | "create";
}

interface UnionMembershipTypeRow {
  union_membership_type_id: number;
  type_name: string;
  display_name: string;
}

interface OccupationRow {
  occupation_id: number;
  canonical_name: string;
}

interface SpecialisationRow {
  specialisation_id: number;
  name: string;
}

interface CampaignAssessment {
  activity_id: number;
  title: string;
  is_binary: boolean;
  template_key: string | null;
}

interface RatingLevel {
  value: number;
  label: string;
  short_label: string;
  code: string;
}

interface EmployerWorksiteRole {
  employer_id: number;
  worksite_id: number;
  role_type: string;
  is_current: boolean;
}

interface AssessmentValueResolution {
  rawValue: string;
  occurrences: number;
  rating: number | null;
  binaryValue: string | null;
  skip: boolean;
  confirmed: boolean;
}

interface AssessmentColumnResolution {
  columnHeader: string;
  activityId: number | null;
  title: string;
  isBinary: boolean;
  createNew: boolean;
  values: AssessmentValueResolution[];
}

interface OccupationResolution {
  rawValue: string;
  occurrences: number;
  resolvedOccupationId: number | null;
  resolvedCanonicalName: string | null;
  createOccupationName: string | null;
  additionalOccupationIds: number[];
  specialisationIds: number[];
  createSpecialisationNames: string[];
  newSpecialisationName: string;
  candidates: { occupation_id: number; canonical_name: string; score: number }[];
  confirmed: boolean;
  search: string;
}

interface Employer {
  employer_id: number;
  employer_name: string;
  trading_name: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_STEPS: { id: WizardStep; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "column_mapping", label: "Map Columns" },
  { id: "value_mapping", label: "Map Values" },
  { id: "assessment_mapping", label: "Assessments" },
  { id: "employer_selection", label: "Employer" },
  { id: "worksite_matching", label: "Worksites" },
  { id: "ou_matching", label: "Units" },
  { id: "occupation_matching", label: "Occupations" },
  { id: "row_review", label: "Review Rows" },
  { id: "dedup_check", label: "Dedup" },
  { id: "confirm", label: "Confirm" },
  { id: "done", label: "Done" },
];

const MAPPABLE_FIELDS: { value: MappableField; label: string }[] = [
  { value: "reference_id", label: "Reference ID / Member Number" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "full_name", label: "Full Name (split)" },
  { value: "preferred_name", label: "Preferred / Nickname" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone / Mobile" },
  { value: "worksite", label: "Worksite" },
  { value: "organising_unit", label: "Organising unit / team" },
  { value: "occupation", label: "Occupation / Job Title" },
  { value: "assessment", label: "Assessment Column (map values)" },
  { value: "membership_status", label: "Membership Status (map values)" },
  { value: "other_union", label: "Other union badge (optional initials)" },
  { value: "member_role_type", label: "Role Type (map values)" },
  { value: "join_date", label: "Join Date" },
  { value: "rejoin_date", label: "Re-join Date" },
  { value: "notes", label: "Notes / Comments" },
  { value: "ignore", label: "(Ignore)" },
];

function autoMapHeader(header: string): MappableField {
  const h = header.toLowerCase().replace(/[\s_-]/g, "");
  if (
    [
      "referenceid", "refid", "membernumber", "membernum", "memberno",
      "employeeid", "externalid", "memberid", "refno", "referenceno",
    ].includes(h)
  )
    return "reference_id";
  if (["firstname", "givenname", "forename", "given", "first"].includes(h)) return "first_name";
  if (["lastname", "surname", "familyname", "last"].includes(h)) return "last_name";
  if (["name", "fullname", "workername", "employeename", "employeefullname"].includes(h))
    return "full_name";
  if (
    [
      "preferredname", "preferredfirstname", "preferrednm", "nickname",
      "nicknam", "knownas", "alias", "preferredgivenname",
    ].includes(h)
  )
    return "preferred_name";
  if (["email", "emailaddress", "emailaddr"].includes(h)) return "email";
  if (
    [
      "mobile", "phone", "mobilenumber", "mobileno", "phonenumber", "phoneno",
      "contactnumber", "contactno", "mob", "contact",
    ].includes(h)
  )
    return "phone";
  if (["worksite", "site", "location", "worklocation"].includes(h)) return "worksite";
  if (
    [
      "organisingunit", "ou", "unit", "team", "group", "crew",
      "orgunit", "organicunit", "organisationunit", "organizingunit",
    ].includes(h)
  )
    return "organising_unit";
  if (
    [
      "occupation", "jobtitle", "job", "trade", "position", "role",
      "jobtitlename", "occupationname", "worktitle",
    ].includes(h)
  )
    return "occupation";
  if (
    ["otherunion", "unionbadge", "nonoaunion", "otherunioninitials"].includes(h)
  )
    return "other_union";
  if (["membership", "membershipstatus", "status", "memberstatus", "membertype"].includes(h))
    return "membership_status";
  if (["roletype", "role", "memberroletype"].includes(h)) return "member_role_type";
  if (["joindate", "joiningdate", "memberjoindate", "datejoined", "memberjoindate"].includes(h))
    return "join_date";
  if (
    ["rejoindate", "rejoineddate", "recommencedate", "dateofrejoin", "recomdate"].includes(h)
  )
    return "rejoin_date";
  if (["notes", "note", "comments", "comment", "remarks", "remark"].includes(h)) return "notes";
  return "ignore";
}

// Client-side date parser — handles dd/mm/yyyy, dd-mm-yyyy and ISO formats
function parseIsoDate(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) {
    const [, day, month, year] = dmy;
    const fullYear = year.length === 2 ? `20${year}` : year;
    const d = new Date(`${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  // ISO date-only YYYY-MM-DD — return as-is to avoid timezone re-parsing shift
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Reject bare numeric strings (e.g. Excel serial numbers like "44591")
  if (/^\d+$/.test(s)) return null;
  // Try ISO / other standard formats
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return null;
}

// Client-side name parser — mirrors server parseName in parse/route.ts
function parseName(raw: string): {
  firstName: string;
  lastName: string;
  preferredName: string | null;
  warnings: string[];
} {
  const trimmed = raw.trim();
  const warnings: string[] = [];
  const nicknameMatch = trimmed.match(/\(([^)]+)\)/);
  const preferredName = nicknameMatch ? nicknameMatch[1].trim() : null;
  const cleaned = trimmed.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  if (cleaned.includes(",")) {
    const [lastPart, firstPart] = cleaned.split(",", 2);
    const firstName = (firstPart ?? "").trim();
    const lastName = lastPart.trim();
    if (!firstName) warnings.push("Could not parse first name");
    if (!lastName) warnings.push("Could not parse last name");
    return { firstName, lastName, preferredName, warnings };
  }
  const parts = cleaned.split(/\s+/);
  if (parts.length < 2) {
    warnings.push("Only one name token found");
    return { firstName: cleaned, lastName: "", preferredName, warnings };
  }
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
    preferredName,
    warnings,
  };
}

// Client-side phone normalisation (mirrors server logic)
function normalisePhoneClient(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 9) return `0${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  if (digits.length === 11 && digits.startsWith("61")) return `0${digits.slice(2)}`;
  if (digits.length === 12 && digits.startsWith("610")) return `0${digits.slice(3)}`;
  return raw.trim();
}

function confidenceBadgeVariant(
  confidence: "high" | "medium" | "low"
): "default" | "secondary" | "destructive" | "outline" {
  if (confidence === "high") return "default";
  if (confidence === "medium") return "secondary";
  return "outline";
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface WorkerImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
  campaignId?: string | number | null;
}

export function WorkerImportWizard({
  open,
  onOpenChange,
  onComplete,
  campaignId,
}: WorkerImportWizardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastParsedFileRef = useRef<File | null>(null);
  const queryClient = useQueryClient();
  const numericCampaignId =
    campaignId != null && Number.isFinite(Number(campaignId)) ? Number(campaignId) : null;

  // ── Step / format state ───────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>("upload");
  const [fileFormat, setFileFormat] = useState<FileFormat>("group");
  const [preferredFormat, setPreferredFormat] = useState<"auto" | "header" | "group">("auto");
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // ── Group-format state ────────────────────────────────────────────────────
  const [groups, setGroups] = useState<ParsedWorkerGroup[]>([]);

  // ── Header-format state ───────────────────────────────────────────────────
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [headerRows, setHeaderRows] = useState<Record<string, string>[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);

  // ── Shared state ──────────────────────────────────────────────────────────
  const [worksiteResolutions, setWorksiteResolutions] = useState<WorksiteResolution[]>([]);
  const [valueResolutions, setValueResolutions] = useState<ValueResolution[]>([]);
  const [assessmentResolutions, setAssessmentResolutions] = useState<AssessmentColumnResolution[]>([]);
  const [worksiteSearch, setWorksiteSearch] = useState<Record<string, string>>({}); 
  const [createWorksiteFor, setCreateWorksiteFor] = useState<string | null>(null);
  const [newWorksiteName, setNewWorksiteName] = useState("");
  const [newWorksiteType, setNewWorksiteType] = useState<WorksiteType | "">("");
  const [newWorksiteRoleType, setNewWorksiteRoleType] = useState("Other");
  const [isCreatingWorksite, setIsCreatingWorksite] = useState(false);
  const [createWorksiteError, setCreateWorksiteError] = useState<string | null>(null);
  const [ouResolutions, setOuResolutions] = useState<OuResolution[]>([]);
  const [ouSearch, setOuSearch] = useState<Record<string, string>>({});
  const [createOuFor, setCreateOuFor] = useState<string | null>(null);
  const [newOuName, setNewOuName] = useState("");
  const [newOuType, setNewOuType] = useState<CampaignOuType | "">("");
  const [isCreatingOu, setIsCreatingOu] = useState(false);
  const [createOuError, setCreateOuError] = useState<string | null>(null);
  const [bulkUnionMembershipId, setBulkUnionMembershipId] = useState("");
  const [selectedEmployerId, setSelectedEmployerId] = useState<number | null>(null);
  const [selectedEmployerName, setSelectedEmployerName] = useState<string | null>(null);
  const [employerSearch, setEmployerSearch] = useState("");
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [dedupMatches, setDedupMatches] = useState<DedupMatch[]>([]);
  const [occupationResolutions, setOccupationResolutions] = useState<OccupationResolution[]>([]);
  const [occupationSearch, setOccupationSearch] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
    rowResults: WorkerImportRowResult[];
  } | null>(null);

  // ── Data queries ──────────────────────────────────────────────────────────
  const supabase = createClient();

  const { data: worksites = [], refetch: refetchWorksites } = useQuery<Worksite[]>({
    queryKey: ["worksites-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksites")
        .select("*")
        .order("worksite_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: employerWorksiteRoles = [] } = useQuery<EmployerWorksiteRole[]>({
    queryKey: ["employer-worksite-roles-current"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employer_worksite_roles")
        .select("employer_id, worksite_id, role_type, is_current")
        .eq("is_current", true);
      if (error) throw error;
      return (data ?? []) as EmployerWorksiteRole[];
    },
    enabled: open,
  });

  const { data: unionMembershipTypes = [] } = useQuery<UnionMembershipTypeRow[]>({
    queryKey: ["union-membership-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("union_membership_types")
        .select("union_membership_type_id, type_name, display_name")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const membershipIdByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of unionMembershipTypes) {
      m.set(t.type_name, t.union_membership_type_id);
    }
    return m;
  }, [unionMembershipTypes]);

  function unionMembershipSelectValue(row: ReviewRow): string {
    if (row.overrideUnionMembershipTypeId !== undefined) {
      return row.overrideUnionMembershipTypeId != null
        ? String(row.overrideUnionMembershipTypeId)
        : "__none__";
    }
    const id = row.unionMembershipTypeKey
      ? membershipIdByKey.get(row.unionMembershipTypeKey) ?? null
      : null;
    return id != null ? String(id) : "__none__";
  }

  function resolvedUnionMembershipIdForApply(row: ReviewRow): number | null {
    if (row.overrideUnionMembershipTypeId !== undefined) {
      return row.overrideUnionMembershipTypeId;
    }
    if (!row.unionMembershipTypeKey) return null;
    return membershipIdByKey.get(row.unionMembershipTypeKey) ?? null;
  }

  const { data: employers = [] } = useQuery<Employer[]>({
    queryKey: ["employers-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employers")
        .select("employer_id, employer_name, trading_name")
        .eq("is_active", true)
        .order("employer_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: memberRoleTypes = [] } = useQuery<MemberRoleType[]>({
    queryKey: ["member-role-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_role_types")
        .select("role_type_id, role_name, display_name")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: occupations = [] } = useQuery<OccupationRow[]>({
    queryKey: ["occupations-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("occupations")
        .select("occupation_id, canonical_name")
        .eq("is_active", true)
        .order("canonical_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: specialisations = [] } = useQuery<SpecialisationRow[]>({
    queryKey: ["specialisations-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("specialisations")
        .select("specialisation_id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: campaignOus = [] } = useQuery<{ ou_id: number; name: string; ou_type: string }[]>({
    queryKey: ["import-campaign-ous", numericCampaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_organising_units")
        .select("ou_id, name, ou_type")
        .eq("campaign_id", numericCampaignId!)
        .eq("is_group_container", false)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && numericCampaignId != null,
  });

  const { data: campaignAssessments = [] } = useQuery<CampaignAssessment[]>({
    queryKey: ["worker-import-assessments", numericCampaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_activities")
        .select("activity_id, title, is_binary, template_key")
        .eq("campaign_id", numericCampaignId)
        .eq("activity_kind", "assessment")
        .order("title");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && numericCampaignId != null,
  });

  const { data: ratingLevels = [] } = useQuery<RatingLevel[]>({
    queryKey: ["rating-levels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rating_level")
        .select("value, label, short_label, code")
        .gt("value", 0)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const { data: occupationAliases = [] } = useQuery<{ occupation_id: number; alias_name: string }[]>({
    queryKey: ["occupation-aliases-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("occupation_aliases")
        .select("occupation_id, alias_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function hasOccupationColumn() {
    return columnMappings.some((m) => m.field === "occupation");
  }

  function hasAssessmentColumn() {
    return columnMappings.some((m) => m.field === "assessment");
  }

  function hasOuColumn() {
    return columnMappings.some((m) => m.field === "organising_unit");
  }

  function scoreOu(raw: string, ou: { name: string }): number {
    const tokenize = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
    const a = new Set(tokenize(raw));
    const b = new Set(tokenize(ou.name));
    const intersection = [...a].filter((t) => b.has(t)).length;
    const union = new Set([...a, ...b]).size;
    return union === 0 ? 0 : intersection / union;
  }

  function buildOuResolutions(): OuResolution[] {
    const ouCol = columnMappings.find((m) => m.field === "organising_unit")?.header ?? "";
    if (!ouCol) return [];
    const unique = [
      ...new Set(headerRows.map((r) => String(r[ouCol] ?? "").trim()).filter(Boolean)),
    ];
    return unique.map((val) => {
      const scored = campaignOus
        .map((ou) => ({ ...ou, score: scoreOu(val, ou) }))
        .filter((c) => c.score > 0.15)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      const top = scored[0];
      const autoAccept = top != null && top.score >= 0.8;
      return {
        rawValue: val,
        occurrences: headerRows.filter((r) => String(r[ouCol] ?? "").trim() === val).length,
        ouId: autoAccept ? top.ou_id : null,
        ouName: autoAccept ? top.name : null,
        candidates: scored,
        confirmed: autoAccept,
      };
    });
  }

  function worksitePrincipalEmployerId(worksite: Worksite): number | null {
    return (worksite as Worksite & { principal_employer_id?: number | null }).principal_employer_id ?? null;
  }

  function worksiteEmployerContext(worksite: Worksite): "linked" | "principal" | "other" {
    if (!selectedEmployerId) return "other";
    if (
      employerWorksiteRoles.some(
        (role) =>
          role.worksite_id === worksite.worksite_id &&
          role.employer_id === selectedEmployerId &&
          role.is_current
      )
    ) {
      return "linked";
    }
    if (worksitePrincipalEmployerId(worksite) === selectedEmployerId) return "principal";
    return "other";
  }

  function worksiteContextLabel(worksite: Worksite) {
    const context = worksiteEmployerContext(worksite);
    if (context === "linked") return "Employer linked";
    if (context === "principal") return "Principal employer";
    return selectedEmployerId ? "Other employer" : worksite.worksite_type;
  }

  function sortWorksiteCandidatesForEmployer(candidates: WorksiteCandidate[]) {
    const order = { linked: 0, principal: 1, other: 2 };
    return [...candidates].sort((a, b) => {
      const contextDelta =
        order[worksiteEmployerContext(a.worksite)] - order[worksiteEmployerContext(b.worksite)];
      if (contextDelta !== 0) return contextDelta;
      return b.score - a.score;
    });
  }

  function assessmentValueForRaw(raw: string, isBinary: boolean): AssessmentValueResolution {
    const lower = raw.trim().toLowerCase();
    const truthy = new Set(["yes", "y", "true", "t", "1", "support", "supporter"]);
    const falsy = new Set(["no", "n", "false", "f", "0", "oppose", "opposed"]);
    const numeric = Number(lower);

    if (isBinary) {
      if (truthy.has(lower)) {
        return { rawValue: raw, occurrences: 0, rating: null, binaryValue: "yes", skip: false, confirmed: true };
      }
      if (falsy.has(lower)) {
        return { rawValue: raw, occurrences: 0, rating: null, binaryValue: "no", skip: false, confirmed: true };
      }
    } else if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 5) {
      return { rawValue: raw, occurrences: 0, rating: numeric, binaryValue: null, skip: false, confirmed: true };
    } else {
      const rating = ratingLevels.find(
        (level) =>
          level.label.toLowerCase() === lower ||
          level.short_label.toLowerCase() === lower ||
          level.code.toLowerCase() === lower
      );
      if (rating) {
        return { rawValue: raw, occurrences: 0, rating: rating.value, binaryValue: null, skip: false, confirmed: true };
      }
    }

    return { rawValue: raw, occurrences: 0, rating: null, binaryValue: null, skip: false, confirmed: false };
  }

  function scoreOccupation(query: string, occs: OccupationRow[]) {
    function normStr(s: string) {
      return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    }
    function tokenSet(s: string): Set<string> {
      const stop = new Set(["the", "and", "of", "for", "in", "at", "by", "a", "an", "to"]);
      return new Set(s.split(" ").filter((w) => w.length >= 2 && !stop.has(w)));
    }
    function jaccard(a: Set<string>, b: Set<string>): number {
      if (a.size === 0 && b.size === 0) return 1;
      const inter = new Set([...a].filter((x) => b.has(x)));
      return inter.size / new Set([...a, ...b]).size;
    }
    const qNorm = normStr(query);
    const qTokens = tokenSet(qNorm);
    return occs
      .map((o) => {
        const cNorm = normStr(o.canonical_name);
        const score = jaccard(qTokens, tokenSet(cNorm));
        return { occupation_id: o.occupation_id, canonical_name: o.canonical_name, score };
      })
      .filter((c) => c.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  function buildOccupationResolutions(): OccupationResolution[] {
    const occCol = columnMappings.find((m) => m.field === "occupation")?.header ?? "";
    if (!occCol) return [];
    const unique = [
      ...new Set(
        headerRows.map((r) => String(r[occCol] ?? "").trim()).filter(Boolean)
      ),
    ];
    return unique.map((raw): OccupationResolution => {
      const lc = raw.toLowerCase().trim();
      const exactCanonical = occupations.find(
        (o) => o.canonical_name.toLowerCase() === lc
      );
      const exactAlias = occupationAliases.find(
        (a) => a.alias_name.toLowerCase() === lc
      );
      const exactOcc =
        exactCanonical ??
        (exactAlias
          ? occupations.find((o) => o.occupation_id === exactAlias.occupation_id) ?? null
          : null);
      const candidates = exactOcc ? [] : scoreOccupation(raw, occupations);
      const top = candidates[0];
      const autoAccept = !!exactOcc || (top && top.score >= 0.7);
      const resolved =
        exactOcc ??
        (autoAccept && top
          ? occupations.find((o) => o.occupation_id === top.occupation_id) ?? null
          : null);
      return {
        rawValue: raw,
        occurrences: headerRows.filter((r) => String(r[occCol] ?? "").trim() === raw).length,
        resolvedOccupationId: resolved?.occupation_id ?? null,
        resolvedCanonicalName: resolved?.canonical_name ?? null,
        createOccupationName: null,
        additionalOccupationIds: [],
        specialisationIds: [],
        createSpecialisationNames: [],
        newSpecialisationName: "",
        candidates,
        confirmed: !!autoAccept,
        search: "",
      };
    });
  }

  function buildAssessmentResolutions(): AssessmentColumnResolution[] {
    const assessmentColumns = columnMappings.filter((m) => m.field === "assessment");
    return assessmentColumns.map((mapping) => {
      const rawValues = headerRows
        .map((r) => String(r[mapping.header] ?? "").trim())
        .filter(Boolean);
      const uniqueValues = [...new Set(rawValues)];
      const binaryTokens = new Set(["yes", "y", "true", "t", "1", "no", "n", "false", "f", "0"]);
      const isBinary =
        uniqueValues.length > 0 &&
        uniqueValues.every((value) => binaryTokens.has(value.toLowerCase()));
      const exactAssessment = campaignAssessments.find(
        (assessment) => assessment.title.toLowerCase() === mapping.header.toLowerCase()
      );
      return {
        columnHeader: mapping.header,
        activityId: exactAssessment?.activity_id ?? null,
        title: exactAssessment?.title ?? mapping.header,
        isBinary: exactAssessment?.is_binary ?? isBinary,
        createNew: !exactAssessment,
        values: uniqueValues.map((raw) => {
          const auto = assessmentValueForRaw(raw, exactAssessment?.is_binary ?? isBinary);
          return {
            ...auto,
            occurrences: rawValues.filter((value) => value === raw).length,
          };
        }),
      };
    });
  }

  function getVisibleSteps() {
    const steps = fileFormat === "group"
      ? ALL_STEPS.filter(
          (s) =>
            s.id !== "column_mapping" &&
            s.id !== "occupation_matching" &&
            s.id !== "assessment_mapping" &&
            s.id !== "ou_matching"
        )
      : ALL_STEPS.filter(
          (s) =>
            (s.id !== "occupation_matching" || hasOccupationColumn()) &&
            (s.id !== "assessment_mapping" || hasAssessmentColumn()) &&
            (s.id !== "ou_matching" || (hasOuColumn() && numericCampaignId != null))
        );
    return steps.filter(
      (s) =>
        (s.id !== "value_mapping" || valueResolutions.length > 0) &&
        (s.id !== "assessment_mapping" || assessmentResolutions.length > 0)
    );
  }

  function buildGroupWorksiteResolutions(parsedGroups: ParsedWorkerGroup[]): WorksiteResolution[] {
    return parsedGroups.map((g) => {
      const candidates = matchWorksiteCandidates(g.groupName, worksites);
      const top = candidates[0];
      const autoAccept = top?.confidence === "high";
      return {
        groupName: g.groupName,
        worksiteId: autoAccept ? top.worksite.worksite_id : null,
        worksiteName: autoAccept ? top.worksite.worksite_name : null,
        candidates,
        confirmed: autoAccept,
      };
    });
  }

  function buildHeaderWorksiteResolutions(
    rawRows: Record<string, string>[],
    worksiteHeader: string
  ): WorksiteResolution[] {
    const unique = [
      ...new Set(rawRows.map((r) => String(r[worksiteHeader] ?? "").trim()).filter(Boolean)),
    ];
    return unique.map((val) => {
      const candidates = matchWorksiteCandidates(val, worksites);
      const top = candidates[0];
      const autoAccept = top?.confidence === "high";
      return {
        groupName: val,
        worksiteId: autoAccept ? top.worksite.worksite_id : null,
        worksiteName: autoAccept ? top.worksite.worksite_name : null,
        candidates,
        confirmed: autoAccept,
      };
    });
  }

  // ─── State reset ──────────────────────────────────────────────────────────

  function reset() {
    setStep("upload");
    setFileFormat("group");
    setPreferredFormat("auto");
    setIsLoading(false);
    setFileName("");
    setDragOver(false);
    setParseError(null);
    setGroups([]);
    setDetectedHeaders([]);
    setHeaderRows([]);
    setColumnMappings([]);
    setWorksiteResolutions([]);
    setValueResolutions([]);
    setAssessmentResolutions([]);
    setWorksiteSearch({});
    setNewWorksiteRoleType("Other");
    setOuResolutions([]);
    setOuSearch({});
    setCreateOuFor(null);
    setNewOuName("");
    setNewOuType("");
    setIsCreatingOu(false);
    setCreateOuError(null);
    setOccupationResolutions([]);
    setOccupationSearch({});
    setSelectedEmployerId(null);
    setSelectedEmployerName(null);
    setEmployerSearch("");
    setReviewRows([]);
    setDedupMatches([]);
    setResult(null);
  }

  // ─── File handling ────────────────────────────────────────────────────────

  const handleFile = useCallback(
    async (file: File, forceFormat?: "header" | "group") => {
      if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".xls")) {
        setParseError("Only .xlsx and .xls files are supported.");
        return;
      }
      setParseError(null);
      setIsLoading(true);
      lastParsedFileRef.current = file;

      try {
        const formData = new FormData();
        formData.append("file", file);
        // preferredFormat (set before upload) takes precedence; forceFormat is used for
        // the "Switch to column mapping" re-parse button on the employer step.
        const effectiveFormat =
          forceFormat ?? (preferredFormat !== "auto" ? preferredFormat : undefined);
        const url = effectiveFormat
          ? `/api/worker-import/parse?forceFormat=${effectiveFormat}`
          : "/api/worker-import/parse";
        const res = await fetchApi(url, {
          method: "POST",
          body: formData,
          timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
        });
        const json = await res.json();
        if (!json.success) {
          setParseError(json.error ?? "Parse failed");
          return;
        }

        setFileName(json.fileName);

        if (json.format === "header") {
          setFileFormat("header");
          setDetectedHeaders(json.headers);
          setHeaderRows(json.rows);
          const mappings: ColumnMapping[] = json.headers.map((h: string) => ({
            header: h,
            field: autoMapHeader(h),
          }));
          setColumnMappings(mappings);
          setStep("column_mapping");
        } else {
          setFileFormat("group");
          setGroups(json.groups);
          setWorksiteResolutions(buildGroupWorksiteResolutions(json.groups));
          setStep("employer_selection");
        }
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [worksites]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // ─── Navigation handlers ──────────────────────────────────────────────────

  function buildValueResolutions(): ValueResolution[] {
    const resolutions: ValueResolution[] = [];

    for (const mapping of columnMappings) {
      if (mapping.field !== "membership_status" && mapping.field !== "member_role_type") continue;

      const uniqueValues = [
        ...new Set(
          headerRows.map((r) => String(r[mapping.header] ?? "").trim()).filter(Boolean)
        ),
      ];

      for (const raw of uniqueValues) {
        const occurrences = headerRows.filter(
          (r) => String(r[mapping.header] ?? "").trim() === raw
        ).length;

        let resolvedId: number | null = null;
        let resolvedLabel: string | null = null;
        let confirmed = false;

        if (mapping.field === "membership_status") {
          const parsed = parseMembershipStatus(raw);
          if (parsed.membershipKey) {
            const found = unionMembershipTypes.find((t) => t.type_name === parsed.membershipKey);
            if (found) {
              resolvedId = found.union_membership_type_id;
              resolvedLabel = found.display_name;
              confirmed = true;
            }
          }
        } else {
          // member_role_type: exact case-insensitive match on display_name or role_name
          const lower = raw.toLowerCase();
          const found = memberRoleTypes.find(
            (rt) =>
              rt.display_name.toLowerCase() === lower ||
              rt.role_name.toLowerCase() === lower
          );
          if (found) {
            resolvedId = found.role_type_id;
            resolvedLabel = found.display_name;
            confirmed = true;
          }
        }

        resolutions.push({
          columnHeader: mapping.header,
          targetField: mapping.field,
          rawValue: raw,
          occurrences,
          resolvedId,
          resolvedLabel,
          confirmed,
        });
      }
    }
    return resolutions;
  }

  function proceedFromColumnMapping() {
    const worksiteCol = columnMappings.find((m) => m.field === "worksite")?.header;
    if (worksiteCol) {
      setWorksiteResolutions(buildHeaderWorksiteResolutions(headerRows, worksiteCol));
    } else {
      setWorksiteResolutions([]);
    }

    // Eagerly build OU resolutions so the step is ready when reached
    setOuResolutions(buildOuResolutions());
    setOuSearch({});

    // Eagerly build occupation resolutions so the step is ready when reached
    setOccupationResolutions(buildOccupationResolutions());
    setOccupationSearch({});

    const vr = buildValueResolutions();
    setValueResolutions(vr);
    const ar = buildAssessmentResolutions();
    setAssessmentResolutions(ar);

    if (vr.length > 0) {
      setStep("value_mapping");
    } else if (ar.length > 0) {
      setStep("assessment_mapping");
    } else {
      setStep("employer_selection");
    }
  }

  function proceedFromValueMapping() {
    if (assessmentResolutions.length > 0) {
      setStep("assessment_mapping");
    } else {
      setStep("employer_selection");
    }
  }

  function proceedFromEmployerSelection() {
    if (worksiteResolutions.length > 0) {
      setWorksiteResolutions((prev) =>
        prev.map((resolution) => {
          const candidates = sortWorksiteCandidatesForEmployer(
            matchWorksiteCandidates(resolution.groupName, worksites, 8)
          );
          const currentWorksite = worksites.find(
            (worksite) => worksite.worksite_id === resolution.worksiteId
          );
          const currentIsCrossEmployer =
            currentWorksite != null && worksiteEmployerContext(currentWorksite) === "other";
          const top = candidates[0];
          const shouldAutoAccept =
            !resolution.confirmed &&
            top?.confidence === "high" &&
            worksiteEmployerContext(top.worksite) !== "other";
          return {
            ...resolution,
            candidates,
            ...(currentIsCrossEmployer
              ? { worksiteId: null, worksiteName: null, confirmed: false }
              : {}),
            ...(shouldAutoAccept
              ? {
                  worksiteId: top.worksite.worksite_id,
                  worksiteName: top.worksite.worksite_name,
                  confirmed: true,
                }
              : {}),
          };
        })
      );
      setStep("worksite_matching");
    } else if (hasOuColumn() && numericCampaignId != null && ouResolutions.length > 0) {
      setStep("ou_matching");
    } else if (hasOccupationColumn()) {
      setStep("occupation_matching");
    } else {
      proceedToRowReview();
    }
  }

  function proceedFromWorksiteMatching() {
    if (hasOuColumn() && numericCampaignId != null && ouResolutions.length > 0) {
      setStep("ou_matching");
    } else if (hasOccupationColumn()) {
      setStep("occupation_matching");
    } else {
      proceedToRowReview();
    }
  }

  function proceedFromOuMatching() {
    if (hasOccupationColumn()) {
      setStep("occupation_matching");
    } else {
      proceedToRowReview();
    }
  }

  function proceedFromOccupationMatching() {
    proceedToRowReview();
  }

  function resolveWorksite(groupName: string, worksite: Worksite | null) {
    setWorksiteResolutions((prev) =>
      prev.map((r) =>
        r.groupName === groupName
          ? {
              ...r,
              worksiteId: worksite?.worksite_id ?? null,
              worksiteName: worksite?.worksite_name ?? null,
              confirmed: true,
            }
          : r
      )
    );
  }

  async function handleCreateWorksite(groupName: string) {
    if (!newWorksiteName.trim() || !newWorksiteType) return;
    setIsCreatingWorksite(true);
    setCreateWorksiteError(null);
    try {
      const response = await fetchApi("/api/worker-import/worksites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worksiteName: newWorksiteName.trim(),
          worksiteType: newWorksiteType,
          employerId: selectedEmployerId,
          employerRoleType: newWorksiteRoleType,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error ?? "Failed to create worksite");
      }
      resolveWorksite(groupName, json.worksite as Worksite);
      await refetchWorksites();
      await queryClient.invalidateQueries({ queryKey: ["employer-worksite-roles-current"] });
      setCreateWorksiteFor(null);
      setNewWorksiteName("");
      setNewWorksiteType("");
      setNewWorksiteRoleType("Other");
    } catch (err) {
      setCreateWorksiteError(
        err instanceof Error ? err.message : "Failed to create worksite"
      );
    } finally {
      setIsCreatingWorksite(false);
    }
  }

  function resolveOu(rawValue: string, ou: { ou_id: number; name: string; ou_type: string } | null) {
    setOuResolutions((prev) =>
      prev.map((r) =>
        r.rawValue === rawValue
          ? {
              ...r,
              ouId: ou?.ou_id ?? null,
              ouName: ou?.name ?? null,
              confirmed: true,
            }
          : r
      )
    );
  }

  async function handleCreateOu(rawValue: string) {
    if (!newOuName.trim() || !newOuType || !numericCampaignId) return;
    setIsCreatingOu(true);
    setCreateOuError(null);
    try {
      const response = await fetchApi("/api/worker-import/organising-units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: numericCampaignId,
          name: newOuName.trim(),
          ouType: newOuType,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error ?? "Failed to create organising unit");
      }
      resolveOu(rawValue, json.ou as { ou_id: number; name: string; ou_type: string });
      await queryClient.invalidateQueries({ queryKey: ["import-campaign-ous", numericCampaignId] });
      setOuResolutions((prev) =>
        prev.map((r) =>
          r.rawValue === rawValue ? { ...r, createdDuringImport: true } : r
        )
      );
      setCreateOuFor(null);
      setNewOuName("");
      setNewOuType("");
    } catch (err) {
      setCreateOuError(err instanceof Error ? err.message : "Failed to create organising unit");
    } finally {
      setIsCreatingOu(false);
    }
  }

  function proceedToRowReview() {
    const resolutionMap = new Map(worksiteResolutions.map((r) => [r.groupName, r]));
    const ouResMap = new Map(ouResolutions.map((r) => [r.rawValue, r]));
    const occResMap = new Map(occupationResolutions.map((r) => [r.rawValue, r]));
    const assessmentCols = assessmentResolutions.map((assessment) => assessment.columnHeader);

    // Build lookup maps from value resolutions
    // key: "columnHeader|rawValue" → resolved id
    const membershipResMap = new Map<string, ValueResolution>(
      valueResolutions
        .filter((r) => r.targetField === "membership_status")
        .map((r) => [`${r.columnHeader}|${r.rawValue}`, r])
    );
    const roleTypeResMap = new Map<string, ValueResolution>(
      valueResolutions
        .filter((r) => r.targetField === "member_role_type")
        .map((r) => [`${r.columnHeader}|${r.rawValue}`, r])
    );

    if (fileFormat === "header") {
      const referenceIdCol = columnMappings.find((m) => m.field === "reference_id")?.header ?? "";
      const firstNameCol = columnMappings.find((m) => m.field === "first_name")?.header ?? "";
      const lastNameCol = columnMappings.find((m) => m.field === "last_name")?.header ?? "";
      const fullNameCol = columnMappings.find((m) => m.field === "full_name")?.header ?? "";
      const preferredNameCol = columnMappings.find((m) => m.field === "preferred_name")?.header ?? "";
      const emailCol = columnMappings.find((m) => m.field === "email")?.header ?? "";
      const phoneCol = columnMappings.find((m) => m.field === "phone")?.header ?? "";
      const worksiteCol = columnMappings.find((m) => m.field === "worksite")?.header ?? "";
      const ouCol = columnMappings.find((m) => m.field === "organising_unit")?.header ?? "";
      const occupationCol = columnMappings.find((m) => m.field === "occupation")?.header ?? "";
      const membershipCol = columnMappings.find((m) => m.field === "membership_status")?.header ?? "";
      const roleTypeCol = columnMappings.find((m) => m.field === "member_role_type")?.header ?? "";
      const joinDateCol = columnMappings.find((m) => m.field === "join_date")?.header ?? "";
      const rejoinDateCol = columnMappings.find((m) => m.field === "rejoin_date")?.header ?? "";
      const notesCol = columnMappings.find((m) => m.field === "notes")?.header ?? "";
      const otherUnionCol = columnMappings.find((m) => m.field === "other_union")?.header ?? "";

      const rows: ReviewRow[] = headerRows
        .map((row, i) => {
          const rawWorksiteVal = worksiteCol
            ? String(row[worksiteCol] ?? "").trim()
            : "";
          const resolution = resolutionMap.get(rawWorksiteVal);
          const rawOuVal = ouCol ? String(row[ouCol] ?? "").trim() : "";
          const ouRes = ouResMap.get(rawOuVal);

          let firstName = "";
          let lastName = "";
          let preferredName: string | null = null;
          const parseWarnings: string[] = [];

          if (fullNameCol) {
            const rawFull = String(row[fullNameCol] ?? "").trim();
            const parsed = parseName(rawFull);
            firstName = parsed.firstName;
            lastName = parsed.lastName;
            preferredName = parsed.preferredName;
            parseWarnings.push(...parsed.warnings);
          } else {
            firstName = String(row[firstNameCol] ?? "").trim();
            lastName = String(row[lastNameCol] ?? "").trim();
            if (!firstName || !lastName) parseWarnings.push("Missing first or last name");
          }

          if (preferredNameCol) {
            preferredName = String(row[preferredNameCol] ?? "").trim() || preferredName;
          }

          const rawPhone = phoneCol ? String(row[phoneCol] ?? "").trim() : "";

          const rawMembership = membershipCol ? String(row[membershipCol] ?? "").trim() : "";
          const parsedMembership = parseMembershipStatus(rawMembership);

          // Resolve membership status from value mapping
          let unionMembershipTypeKey: ReviewRow["unionMembershipTypeKey"] =
            parsedMembership.membershipKey;
          let overrideUnionMembershipTypeId: number | null | undefined = undefined;
          if (membershipCol) {
            const res = membershipResMap.get(`${membershipCol}|${rawMembership}`);
            if (res?.confirmed) {
              overrideUnionMembershipTypeId = res.resolvedId;
            }
          }

          let nonOaUnionBadgeInitials: string | null = null;
          if (otherUnionCol) {
            const v = String(row[otherUnionCol] ?? "").trim();
            if (v) nonOaUnionBadgeInitials = v;
          }
          if (!nonOaUnionBadgeInitials) {
            nonOaUnionBadgeInitials = parsedMembership.nonOaUnionBadgeInitials ?? null;
          }

          if (
            rawMembership &&
            parsedMembership.membershipKey == null &&
            overrideUnionMembershipTypeId === undefined
          ) {
            parseWarnings.push(`Unknown membership status: "${rawMembership}"`);
          }

          // Resolve role type from value mapping
          let resolvedMemberRoleTypeId: number | null | undefined = undefined;
          if (roleTypeCol) {
            const rawRole = String(row[roleTypeCol] ?? "").trim();
            const res = roleTypeResMap.get(`${roleTypeCol}|${rawRole}`);
            if (res?.confirmed) {
              resolvedMemberRoleTypeId = res.resolvedId;
            }
          }

          const rawOccupation = occupationCol
            ? String(row[occupationCol] ?? "").trim() || null
            : null;
          const occRes = rawOccupation ? occResMap.get(rawOccupation) : undefined;
          const assessmentEvents = assessmentCols.flatMap((columnHeader) => {
            const rawValue = String(row[columnHeader] ?? "").trim();
            if (!rawValue) return [];
            const column = assessmentResolutions.find(
              (item) => item.columnHeader === columnHeader
            );
            const mapping = column?.values.find((value) => value.rawValue === rawValue);
            if (!mapping || mapping.skip || !mapping.confirmed) return [];
            return [
              {
                columnHeader,
                rawValue,
                rating: mapping.rating,
                binaryValue: mapping.binaryValue,
              },
            ];
          });

          return {
            rowIndex: i,
            referenceId: referenceIdCol ? String(row[referenceIdCol] ?? "").trim() || null : null,
            rawName: `${firstName} ${lastName}`.trim(),
            firstName,
            lastName,
            preferredName,
            notes: notesCol ? String(row[notesCol] ?? "").trim() || null : null,
            joinDate: joinDateCol ? parseIsoDate(String(row[joinDateCol] ?? "").trim()) : null,
            rejoinDate: rejoinDateCol ? parseIsoDate(String(row[rejoinDateCol] ?? "").trim()) : null,
            rawMembershipStatus: rawMembership,
            unionMembershipTypeKey,
            ...(overrideUnionMembershipTypeId !== undefined
              ? { overrideUnionMembershipTypeId }
              : {}),
            ...(resolvedMemberRoleTypeId !== undefined
              ? { resolvedMemberRoleTypeId }
              : {}),
            unionId: parsedMembership.unionId,
            resignationDate: parsedMembership.resignationDate,
            rawPhone,
            phone: normalisePhoneClient(rawPhone),
            email: emailCol ? String(row[emailCol] ?? "").trim() || null : null,
            parseWarnings,
            nonOaUnionBadgeInitials,
            groupName: rawWorksiteVal,
            resolvedWorksiteId: resolution?.worksiteId ?? null,
            resolvedWorksiteName: resolution?.worksiteName ?? null,
            resolvedOuId: ouRes?.confirmed ? (ouRes.ouId ?? null) : null,
            resolvedOuName: ouRes?.confirmed ? (ouRes.ouName ?? null) : null,
            rawOccupation,
            resolvedOccupationId: occRes?.confirmed ? (occRes.resolvedOccupationId ?? null) : null,
            createOccupationName: occRes?.confirmed ? occRes.createOccupationName : null,
            additionalOccupationIds: occRes?.confirmed ? occRes.additionalOccupationIds : [],
            specialisationIds: occRes?.confirmed ? occRes.specialisationIds : [],
            createSpecialisationNames: occRes?.confirmed ? occRes.createSpecialisationNames : [],
            assessmentEvents,
          } satisfies ReviewRow;
        })
        .filter((r) => r.firstName || r.lastName);

      setReviewRows(rows);
    } else {
      const rows: ReviewRow[] = groups.flatMap((g) => {
        const resolution = resolutionMap.get(g.groupName);
        return g.rows.map((row) => ({
          ...row,
          notes: null,
          joinDate: null,
          rejoinDate: null,
          groupName: g.groupName,
          resolvedWorksiteId: resolution?.worksiteId ?? null,
          resolvedWorksiteName: resolution?.worksiteName ?? null,
          resolvedOuId: null,
          resolvedOuName: null,
          rawOccupation: null,
          resolvedOccupationId: null,
          createOccupationName: null,
          additionalOccupationIds: [],
          specialisationIds: [],
          createSpecialisationNames: [],
          assessmentEvents: [],
        }));
      });
      setReviewRows(rows);
    }

    setStep("row_review");
  }

  async function proceedToDedupCheck() {
    setIsLoading(true);
    setStep("dedup_check");

    const refIds = reviewRows
      .map((r) => r.overrideReferenceId ?? r.referenceId)
      .filter((x): x is string => !!x);
    const emails = reviewRows
      .map((r) => r.overrideEmail ?? r.email)
      .filter((e): e is string => !!e);
    const phones = reviewRows
      .map((r) => r.overridePhone ?? r.phone)
      .filter((p): p is string => !!p);

    const matches: DedupMatch[] = [];
    const worksiteSelect = "worker_id, first_name, last_name, email, phone, reference_id, worksite:worksites(worksite_name)";

    function extractWorksite(raw: unknown): string | null {
      const worksiteRaw = raw as unknown;
      const ws = Array.isArray(worksiteRaw)
        ? (worksiteRaw[0] as { worksite_name: string } | undefined) ?? null
        : (worksiteRaw as { worksite_name: string } | null);
      return ws?.worksite_name ?? null;
    }

    // 1. Reference ID (primary — highest confidence, exact unique key)
    if (refIds.length > 0) {
      const { data: refMatches } = await supabase
        .from("workers")
        .select(worksiteSelect)
        .in("reference_id", refIds);

      for (const existing of refMatches ?? []) {
        const row = reviewRows.find(
          (r) => (r.overrideReferenceId ?? r.referenceId) === existing.reference_id
        );
        if (row) {
          matches.push({
            rowIndex: row.rowIndex,
            existingWorkerId: existing.worker_id,
            existingFirstName: existing.first_name,
            existingLastName: existing.last_name,
            existingEmail: existing.email,
            existingPhone: existing.phone,
            existingWorksiteName: extractWorksite(existing.worksite),
            matchedOn: "reference_id",
            action: "update",
          });
        }
      }
    }

    // 2. Email (for rows not already matched by reference_id)
    if (emails.length > 0) {
      const matchedRowIndices = new Set(matches.map((m) => m.rowIndex));
      const { data: emailMatches } = await supabase
        .from("workers")
        .select(worksiteSelect)
        .in("email", emails);

      for (const existing of emailMatches ?? []) {
        const row = reviewRows.find(
          (r) =>
            !matchedRowIndices.has(r.rowIndex) &&
            (r.overrideEmail ?? r.email) === existing.email
        );
        if (row) {
          matches.push({
            rowIndex: row.rowIndex,
            existingWorkerId: existing.worker_id,
            existingFirstName: existing.first_name,
            existingLastName: existing.last_name,
            existingEmail: existing.email,
            existingPhone: existing.phone,
            existingWorksiteName: extractWorksite(existing.worksite),
            matchedOn: "email",
            action: "update",
          });
        }
      }
    }

    // 3. Phone (for rows not yet matched)
    if (phones.length > 0) {
      const matchedRowIndices = new Set(matches.map((m) => m.rowIndex));
      const { data: phoneMatches } = await supabase
        .from("workers")
        .select(worksiteSelect)
        .in("phone", phones);

      for (const existing of phoneMatches ?? []) {
        const row = reviewRows.find(
          (r) =>
            !matchedRowIndices.has(r.rowIndex) &&
            (r.overridePhone ?? r.phone) === existing.phone
        );
        if (row) {
          matches.push({
            rowIndex: row.rowIndex,
            existingWorkerId: existing.worker_id,
            existingFirstName: existing.first_name,
            existingLastName: existing.last_name,
            existingEmail: existing.email,
            existingPhone: existing.phone,
            existingWorksiteName: extractWorksite(existing.worksite),
            matchedOn: "phone",
            action: "update",
          });
        }
      }
    }

    setDedupMatches(matches);
    setIsLoading(false);
  }

  function updateDedupAction(rowIndex: number, action: DedupMatch["action"]) {
    setDedupMatches((prev) =>
      prev.map((m) => (m.rowIndex === rowIndex ? { ...m, action } : m))
    );
  }

  async function applyImport() {
    setIsLoading(true);
    const dedupMap = new Map(dedupMatches.map((m) => [m.rowIndex, m]));

    const rows: WorkerImportRow[] = reviewRows.map((row) => {
      const dedup = dedupMap.get(row.rowIndex);
      let action: WorkerImportRow["action"] = "create";
      let existingWorkerId: number | undefined;

      if (dedup) {
        action = dedup.action;
        if (dedup.action === "update") existingWorkerId = dedup.existingWorkerId;
      }

      const nonOaPk = membershipIdByKey.get("non_oa_member") ?? null;
      const resolvedForRow = resolvedUnionMembershipIdForApply(row);
      const nonOaUnionBadgeInitials =
        nonOaPk != null && resolvedForRow === nonOaPk
          ? row.nonOaUnionBadgeInitials?.trim() || null
          : null;

      return {
        rowIndex: row.rowIndex,
        referenceId: row.overrideReferenceId ?? row.referenceId ?? null,
        firstName: row.overrideFirstName ?? row.firstName,
        lastName: row.overrideLastName ?? row.lastName,
        preferredName: row.overridePreferredName ?? row.preferredName ?? null,
        email: row.overrideEmail ?? row.email,
        phone: row.overridePhone ?? row.phone,
        unionMembershipTypeId: resolvedUnionMembershipIdForApply(row),
        unionMembershipTypeKey: row.unionMembershipTypeKey,
        memberRoleTypeId: row.resolvedMemberRoleTypeId ?? null,
        unionId: row.unionId,
        resignationDate: row.resignationDate,
        joinDate: row.overrideJoinDate ?? row.joinDate ?? null,
        rejoinDate: row.overrideRejoinDate ?? row.rejoinDate ?? null,
        worksiteId: row.resolvedWorksiteId,
        employerId: selectedEmployerId,
        rawMembershipStatus: row.rawMembershipStatus,
        notes: row.overrideNotes ?? row.notes ?? null,
        canonicalOccupationId: row.resolvedOccupationId ?? null,
        rawOccupation: row.rawOccupation ?? null,
        createOccupationName: row.createOccupationName ?? null,
        additionalOccupationIds: row.additionalOccupationIds ?? [],
        specialisationIds: row.specialisationIds ?? [],
        createSpecialisationNames: row.createSpecialisationNames ?? [],
        assessmentEvents: row.assessmentEvents ?? [],
        nonOaUnionBadgeInitials,
        ouId: row.resolvedOuId ?? null,
        action,
        existingWorkerId,
      };
    });
    const assessmentColumns: WorkerImportAssessmentColumn[] = assessmentResolutions.map((column) => ({
      columnHeader: column.columnHeader,
      activityId: column.createNew ? null : column.activityId,
      title: column.title,
      isBinary: column.isBinary,
    }));

    try {
      const res = await fetchApi("/api/worker-import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, campaignId: numericCampaignId, assessmentColumns, rows }),
        timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
      });
      const json = await res.json();
      setResult({
        created: json.created ?? 0,
        updated: json.updated ?? 0,
        skipped: json.skipped ?? 0,
        errors: json.errors ?? [],
        rowResults: json.rowResults ?? [],
      });
      setStep("done");
    } catch (e) {
      setResult({
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [e instanceof Error ? e.message : "Unknown error"],
        rowResults: [],
      });
      setStep("done");
    } finally {
      setIsLoading(false);
    }
  }

  function updateReviewRow(rowIndex: number, patch: Partial<ReviewRow>) {
    setReviewRows((prev) =>
      prev.map((r) => (r.rowIndex === rowIndex ? { ...r, ...patch } : r))
    );
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  function StepIndicator() {
    const visibleSteps = getVisibleSteps();
    const currentStepIndex = visibleSteps.findIndex((s) => s.id === step);
    return (
      <div className="flex items-center gap-1 mb-6 flex-wrap">
        {visibleSteps.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium border transition-colors ${
                i < currentStepIndex
                  ? "bg-primary text-primary-foreground border-primary"
                  : i === currentStepIndex
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-muted-foreground/30"
              }`}
            >
              {i < currentStepIndex ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            {i < visibleSteps.length - 1 && (
              <div
                className={`h-px w-6 mx-1 ${
                  i < currentStepIndex ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </div>
        ))}
        <span className="ml-2 text-sm text-muted-foreground font-medium">
          {visibleSteps[currentStepIndex]?.label ?? ""}
        </span>
      </div>
    );
  }

  // ─── Step renderers ────────────────────────────────────────────────────────

  function renderUpload() {
    const formatOptions: { value: "auto" | "header" | "group"; label: string; desc: string }[] = [
      {
        value: "header",
        label: "Column headers",
        desc: "Spreadsheet has a header row (First Name, Last Name, Email…). You will map columns to fields.",
      },
      {
        value: "group",
        label: "Crew list (ESS/Woodside)",
        desc: "Worksite group names as rows; columns: Name | Status | Phone | Email.",
      },
    ];

    return (
      <div className="space-y-4">
        {/* Format selector — choose before uploading to guarantee correct parsing */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            What format is your file?
          </p>
          <div className="grid grid-cols-2 gap-2">
            {formatOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPreferredFormat(opt.value)}
                className={`text-left rounded-lg border p-3 transition-colors ${
                  preferredFormat === opt.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-muted-foreground/30 hover:border-primary/40"
                }`}
              >
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
          {preferredFormat === "auto" && (
            <p className="text-xs text-muted-foreground mt-1.5 italic">
              No format selected — the wizard will try to detect it automatically.
            </p>
          )}
        </div>

        <div
          className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors cursor-pointer ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/30 hover:border-primary/50"
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Drop your .xlsx file here</p>
          <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>
        {parseError && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            {parseError}
          </div>
        )}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Parsing file…
          </div>
        )}
      </div>
    );
  }

  function renderGroupFormatOverride() {
    if (!lastParsedFileRef.current) return null;
    return (
      <div className="flex items-start gap-3 p-3 rounded-md border bg-amber-50 border-amber-200 text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium text-amber-800">
            Detected as crew list (ESS/Woodside) format.
          </p>
          <p className="text-amber-700 text-xs mt-0.5">
            If your file has column headers (e.g. First Name, Last Name, Email) use column
            mapping instead.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs h-7 whitespace-nowrap border-amber-400 bg-white"
          disabled={isLoading}
          onClick={() => {
            if (lastParsedFileRef.current) {
              handleFile(lastParsedFileRef.current, "header");
            }
          }}
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : null}
          Switch to column mapping
        </Button>
      </div>
    );
  }

  function renderColumnMapping() {
    const mappedFields = new Set(
      columnMappings.filter((m) => m.field !== "ignore").map((m) => m.field)
    );
    const canProceed =
      (mappedFields.has("first_name") && mappedFields.has("last_name")) ||
      mappedFields.has("full_name");

    const updateMapping = (header: string, field: MappableField) => {
      setColumnMappings((prev) =>
        prev.map((m) => (m.header === header ? { ...m, field } : m))
      );
    };

    const previewRows = headerRows.slice(0, 3);

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Match each column from your file to the appropriate field.{" "}
          Map either <span className="font-medium text-foreground">First Name + Last Name</span>{" "}
          separately, or a single <span className="font-medium text-foreground">Full Name (split)</span>{" "}
          column which will be split automatically.
        </p>

        <div className="border rounded-lg overflow-auto max-h-[380px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-1/3">File Column</TableHead>
                <TableHead className="text-xs w-1/3">Map To</TableHead>
                <TableHead className="text-xs">Sample Values</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {columnMappings.map(({ header, field }) => (
                <TableRow key={header}>
                  <TableCell className="p-2 font-medium text-sm">{header}</TableCell>
                  <TableCell className="p-2">
                    <Select
                      value={field}
                      onValueChange={(v) => updateMapping(header, v as MappableField)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MAPPABLE_FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value} className="text-xs">
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-2 text-xs text-muted-foreground">
                    {previewRows
                      .map((r) => String(r[header] ?? ""))
                      .filter(Boolean)
                      .slice(0, 2)
                      .join(", ") || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {!canProceed && (
          <div className="flex items-center gap-2 text-sm text-amber-600">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            Map either First Name + Last Name, or a Full Name (split) column to continue.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("upload")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={proceedFromColumnMapping} disabled={!canProceed}>
            Continue <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderValueMapping() {
    const allConfirmed = valueResolutions.every((r) => r.confirmed);

    // Group by column header for display
    const byColumn = new Map<string, ValueResolution[]>();
    for (const r of valueResolutions) {
      const key = r.columnHeader;
      if (!byColumn.has(key)) byColumn.set(key, []);
      byColumn.get(key)!.push(r);
    }

    function updateResolution(columnHeader: string, rawValue: string, patch: Partial<ValueResolution>) {
      setValueResolutions((prev) =>
        prev.map((r) =>
          r.columnHeader === columnHeader && r.rawValue === rawValue
            ? { ...r, ...patch }
            : r
        )
      );
    }

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Map the raw text values from your spreadsheet to the correct database values.
          Auto-matched entries are pre-filled — review and confirm any that need attention.
        </p>

        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
          {[...byColumn.entries()].map(([colHeader, resolutions]) => {
            const targetField = resolutions[0].targetField;
            const targetLabel =
              targetField === "membership_status" ? "Membership Status" : "Role Type";
            const options =
              targetField === "membership_status" ? unionMembershipTypes : memberRoleTypes;

            return (
              <div key={colHeader} className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 border-b flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{colHeader}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 h-4">
                    {targetLabel}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {resolutions.filter((r) => r.confirmed).length}/{resolutions.length} confirmed
                  </span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-1/2">Spreadsheet value</TableHead>
                      <TableHead className="text-xs w-12 text-right">Rows</TableHead>
                      <TableHead className="text-xs">Map to</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resolutions.map((res) => {
                      const selectValue = res.confirmed
                        ? res.resolvedId != null
                          ? String(res.resolvedId)
                          : "__ignore__"
                        : "__unset__";

                      return (
                        <TableRow
                          key={res.rawValue}
                          className={!res.confirmed ? "bg-amber-50" : ""}
                        >
                          <TableCell className="p-2 text-xs font-mono">
                            &ldquo;{res.rawValue}&rdquo;
                          </TableCell>
                          <TableCell className="p-2 text-xs text-right text-muted-foreground">
                            {res.occurrences}
                          </TableCell>
                          <TableCell className="p-1.5">
                            <div className="flex items-center gap-1.5">
                              <Select
                                value={selectValue}
                                onValueChange={(v) => {
                                  if (v === "__unset__") return;
                                  const isIgnore = v === "__ignore__";
                                  const id = isIgnore ? null : Number(v);
                                  const label = isIgnore
                                    ? "Ignore"
                                    : targetField === "membership_status"
                                    ? unionMembershipTypes.find(
                                        (t) => t.union_membership_type_id === id
                                      )?.display_name ?? null
                                    : memberRoleTypes.find((t) => t.role_type_id === id)
                                        ?.display_name ?? null;
                                  updateResolution(colHeader, res.rawValue, {
                                    resolvedId: id,
                                    resolvedLabel: label,
                                    confirmed: true,
                                  });
                                }}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue placeholder="Select…" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__ignore__" className="text-xs text-muted-foreground">
                                    — Ignore (leave blank)
                                  </SelectItem>
                                  {targetField === "membership_status"
                                    ? unionMembershipTypes.map((t) => (
                                        <SelectItem
                                          key={t.union_membership_type_id}
                                          value={String(t.union_membership_type_id)}
                                          className="text-xs"
                                        >
                                          {t.display_name}
                                        </SelectItem>
                                      ))
                                    : memberRoleTypes.map((t) => (
                                        <SelectItem
                                          key={t.role_type_id}
                                          value={String(t.role_type_id)}
                                          className="text-xs"
                                        >
                                          {t.display_name}
                                        </SelectItem>
                                      ))}
                                </SelectContent>
                              </Select>
                              {res.confirmed && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                              )}
                              {!res.confirmed && (
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("column_mapping")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={proceedFromValueMapping} disabled={!allConfirmed}>
            {assessmentResolutions.length > 0 ? "Map Assessments" : "Select Employer"}{" "}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderAssessmentMapping() {
    const canUseAssessments = numericCampaignId != null;
    const allConfirmed =
      canUseAssessments &&
      assessmentResolutions.every(
        (column) =>
          (column.activityId != null || (column.createNew && column.title.trim().length > 0)) &&
          column.values.every((value) => value.confirmed)
      );
    const backStep: WizardStep = valueResolutions.length > 0 ? "value_mapping" : "column_mapping";

    function updateColumn(columnHeader: string, patch: Partial<AssessmentColumnResolution>) {
      setAssessmentResolutions((prev) =>
        prev.map((column) =>
          column.columnHeader === columnHeader ? { ...column, ...patch } : column
        )
      );
    }

    function updateAssessmentValue(
      columnHeader: string,
      rawValue: string,
      patch: Partial<AssessmentValueResolution>
    ) {
      setAssessmentResolutions((prev) =>
        prev.map((column) =>
          column.columnHeader === columnHeader
            ? {
                ...column,
                values: column.values.map((value) =>
                  value.rawValue === rawValue ? { ...value, ...patch } : value
                ),
              }
            : column
        )
      );
    }

    return (
      <div className="space-y-4">
        {!canUseAssessments && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Assessment columns need a campaign context. Reopen this import from a campaign
            page, or remap these columns to Ignore.
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Match each assessment column to an existing campaign assessment or create a new
          one, then map each spreadsheet value to a rating or binary result.
        </p>

        <div className="space-y-4 max-h-[430px] overflow-y-auto pr-1">
          {assessmentResolutions.map((column) => (
            <div key={column.columnHeader} className="rounded-lg border">
              <div className="space-y-3 border-b bg-muted/40 p-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{column.columnHeader}</p>
                  <Badge variant="outline" className="text-[10px]">
                    {column.isBinary ? "Yes/No" : "Rating 1-5"}
                  </Badge>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Select
                    value={column.createNew ? "__new__" : String(column.activityId ?? "__unset__")}
                    onValueChange={(value) => {
                      if (value === "__new__") {
                        updateColumn(column.columnHeader, {
                          createNew: true,
                          activityId: null,
                          title: column.title || column.columnHeader,
                        });
                        return;
                      }
                      const assessment = campaignAssessments.find(
                        (item) => item.activity_id === Number(value)
                      );
                      updateColumn(column.columnHeader, {
                        createNew: false,
                        activityId: assessment?.activity_id ?? null,
                        title: assessment?.title ?? column.title,
                        isBinary: assessment?.is_binary ?? column.isBinary,
                        values: column.values.map((raw) => ({
                          ...assessmentValueForRaw(raw.rawValue, assessment?.is_binary ?? column.isBinary),
                          occurrences: raw.occurrences,
                        })),
                      });
                    }}
                    disabled={!canUseAssessments}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Choose assessment..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new__" className="text-xs">
                        Create new assessment
                      </SelectItem>
                      {campaignAssessments.map((assessment) => (
                        <SelectItem
                          key={assessment.activity_id}
                          value={String(assessment.activity_id)}
                          className="text-xs"
                        >
                          {assessment.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`binary-${column.columnHeader}`}
                      checked={column.isBinary}
                      onCheckedChange={(checked) => {
                        const isBinary = checked === true;
                        updateColumn(column.columnHeader, {
                          isBinary,
                          values: column.values.map((raw) => ({
                            ...assessmentValueForRaw(raw.rawValue, isBinary),
                            occurrences: raw.occurrences,
                          })),
                        });
                      }}
                      disabled={!column.createNew}
                    />
                    <Label htmlFor={`binary-${column.columnHeader}`} className="text-xs">
                      Yes/No
                    </Label>
                  </div>
                </div>
                {column.createNew && (
                  <Input
                    value={column.title}
                    onChange={(event) =>
                      updateColumn(column.columnHeader, { title: event.target.value })
                    }
                    placeholder="New assessment title"
                    className="h-8 text-xs"
                  />
                )}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Spreadsheet value</TableHead>
                    <TableHead className="text-xs w-12 text-right">Rows</TableHead>
                    <TableHead className="text-xs">Maps to</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {column.values.map((value) => (
                    <TableRow key={value.rawValue} className={!value.confirmed ? "bg-amber-50" : ""}>
                      <TableCell className="p-2 text-xs font-mono">
                        &ldquo;{value.rawValue}&rdquo;
                      </TableCell>
                      <TableCell className="p-2 text-right text-xs text-muted-foreground">
                        {value.occurrences}
                      </TableCell>
                      <TableCell className="p-1.5">
                        <Select
                          value={
                            value.skip
                              ? "__skip__"
                              : column.isBinary
                                ? value.binaryValue ?? "__unset__"
                                : value.rating != null
                                  ? String(value.rating)
                                  : "__unset__"
                          }
                          onValueChange={(selected) => {
                            if (selected === "__skip__") {
                              updateAssessmentValue(column.columnHeader, value.rawValue, {
                                skip: true,
                                rating: null,
                                binaryValue: null,
                                confirmed: true,
                              });
                              return;
                            }
                            updateAssessmentValue(column.columnHeader, value.rawValue, {
                              skip: false,
                              rating: column.isBinary ? null : Number(selected),
                              binaryValue: column.isBinary ? selected : null,
                              confirmed: true,
                            });
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__skip__" className="text-xs text-muted-foreground">
                              Skip this value
                            </SelectItem>
                            {column.isBinary ? (
                              <>
                                <SelectItem value="yes" className="text-xs">
                                  Yes / true
                                </SelectItem>
                                <SelectItem value="no" className="text-xs">
                                  No / false
                                </SelectItem>
                              </>
                            ) : (
                              ratingLevels.map((level) => (
                                <SelectItem
                                  key={level.value}
                                  value={String(level.value)}
                                  className="text-xs"
                                >
                                  {level.value} - {level.label}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep(backStep)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={() => setStep("employer_selection")} disabled={!allConfirmed}>
            Select Employer <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderEmployerSelection() {
    const filtered = employerSearch
      ? employers.filter(
          (e) =>
            e.employer_name.toLowerCase().includes(employerSearch.toLowerCase()) ||
            (e.trading_name ?? "").toLowerCase().includes(employerSearch.toLowerCase())
        )
      : employers;

    const hasWorksites =
      fileFormat === "group"
        ? worksiteResolutions.length > 0
        : columnMappings.some((m) => m.field === "worksite");

    const backStep: WizardStep =
      fileFormat === "header" ? "column_mapping" : "upload";

    return (
      <div className="space-y-4">
        {fileFormat === "group" && renderGroupFormatOverride()}
        <p className="text-sm text-muted-foreground">
          Select the employer to assign to all imported workers. You can skip to leave
          employer unassigned.
        </p>

        {selectedEmployerId && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
            <Building2 className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-sm font-medium">{selectedEmployerName}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 px-2 text-xs"
              onClick={() => {
                setSelectedEmployerId(null);
                setSelectedEmployerName(null);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search employers..."
            value={employerSearch}
            onChange={(e) => setEmployerSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>

        <div className="border rounded-lg overflow-auto max-h-[260px]">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No employers found.
            </p>
          ) : (
            <div className="divide-y">
              {filtered.map((emp) => (
                <button
                  key={emp.employer_id}
                  className={`w-full text-left px-4 py-3 text-sm hover:bg-accent transition-colors flex items-center justify-between ${
                    selectedEmployerId === emp.employer_id ? "bg-accent" : ""
                  }`}
                  onClick={() => {
                    setSelectedEmployerId(emp.employer_id);
                    setSelectedEmployerName(emp.employer_name);
                  }}
                >
                  <div>
                    <span className="font-medium">{emp.employer_name}</span>
                    {emp.trading_name && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({emp.trading_name})
                      </span>
                    )}
                  </div>
                  {selectedEmployerId === emp.employer_id && (
                    <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep(backStep)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSelectedEmployerId(null);
              setSelectedEmployerName(null);
              proceedFromEmployerSelection();
            }}
          >
            Skip (No Employer)
          </Button>
          <Button onClick={proceedFromEmployerSelection}>
            {hasWorksites ? (
              <>Match Worksites <ArrowRight className="h-4 w-4 ml-1" /></>
            ) : (
              <>Review Rows <ArrowRight className="h-4 w-4 ml-1" /></>
            )}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderWorksiteMatching() {
    const allConfirmed = worksiteResolutions.every((r) => r.confirmed);

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {worksiteResolutions.length} unique worksite
          {worksiteResolutions.length !== 1 ? "s" : ""} detected. Confirm or override
          the mapping for each.
        </p>

        <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
          {worksiteResolutions.map((resolution) => {
            const workerCount =
              fileFormat === "group"
                ? (groups.find((g) => g.groupName === resolution.groupName)?.rows.length ?? 0)
                : headerRows.filter((r) => {
                    const wCol =
                      columnMappings.find((m) => m.field === "worksite")?.header ?? "";
                    return String(r[wCol] ?? "").trim() === resolution.groupName;
                  }).length;

            const searchTerm = worksiteSearch[resolution.groupName] ?? "";
            const filteredWorksites = searchTerm
              ? worksites
                  .filter((ws) =>
                    ws.worksite_name.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .sort((a, b) => {
                    const order = { linked: 0, principal: 1, other: 2 };
                    return order[worksiteEmployerContext(a)] - order[worksiteEmployerContext(b)];
                  })
              : [];

            return (
              <div
                key={resolution.groupName}
                className="border rounded-lg p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-sm">{resolution.groupName}</p>
                    <p className="text-xs text-muted-foreground">
                      {workerCount} worker{workerCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {resolution.confirmed ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {resolution.worksiteName ?? "No Worksite"}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Needs Review</Badge>
                  )}
                </div>

                {resolution.candidates.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Suggested matches — click to select:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {resolution.candidates.map((c) => {
                        const isSelected =
                          resolution.confirmed &&
                          resolution.worksiteId === c.worksite.worksite_id;
                        return (
                          <Button
                            key={c.worksite.worksite_id}
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            onClick={() =>
                              resolveWorksite(resolution.groupName, c.worksite)
                            }
                            className="h-8 text-xs gap-1.5"
                          >
                            {isSelected && (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <Badge
                              variant={
                                isSelected
                                  ? "secondary"
                                  : confidenceBadgeVariant(c.confidence)
                              }
                              className="text-[10px] px-1 py-0 h-4"
                            >
                              {c.confidence}
                            </Badge>
                            {c.worksite.worksite_name}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search worksites..."
                    value={searchTerm}
                    onChange={(e) =>
                      setWorksiteSearch((prev) => ({
                        ...prev,
                        [resolution.groupName]: e.target.value,
                      }))
                    }
                    className="pl-8 h-8 text-sm"
                  />
                  {searchTerm && filteredWorksites.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 border rounded-md bg-background shadow-md max-h-40 overflow-y-auto">
                      {filteredWorksites.map((ws) => (
                        <button
                          key={ws.worksite_id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                          onClick={() => {
                            resolveWorksite(resolution.groupName, ws);
                            setWorksiteSearch((prev) => ({
                              ...prev,
                              [resolution.groupName]: "",
                            }));
                          }}
                        >
                          {ws.worksite_name}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {worksiteContextLabel(ws)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {createWorksiteFor === resolution.groupName ? (
                  <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                    <p className="text-xs font-medium">New worksite</p>
                    <Input
                      placeholder="Worksite name"
                      value={newWorksiteName}
                      onChange={(e) => setNewWorksiteName(e.target.value)}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    {selectedEmployerName && (
                      <p className="text-xs text-muted-foreground">
                        Will link this worksite to {selectedEmployerName}.
                      </p>
                    )}
                    <Select
                      value={newWorksiteType}
                      onValueChange={(v) => setNewWorksiteType(v as WorksiteType)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {WORKSITE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedEmployerId && (
                      <Select value={newWorksiteRoleType} onValueChange={setNewWorksiteRoleType}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Employer role..." />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            "Owner",
                            "Operator",
                            "Principal_Contractor",
                            "Subcontractor",
                            "Labour_Hire",
                            "Maintenance",
                            "Drilling",
                            "Aviation",
                            "Other",
                          ].map((role) => (
                            <SelectItem key={role} value={role}>
                              {role.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {createWorksiteError && (
                      <p className="text-xs text-destructive">{createWorksiteError}</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={
                          !newWorksiteName.trim() ||
                          !newWorksiteType ||
                          isCreatingWorksite
                        }
                        onClick={() => handleCreateWorksite(resolution.groupName)}
                      >
                        {isCreatingWorksite ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Plus className="h-3 w-3 mr-1" />
                        )}
                        Create
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setCreateWorksiteFor(null);
                          setNewWorksiteName("");
                          setNewWorksiteType("");
                          setNewWorksiteRoleType("Other");
                          setCreateWorksiteError(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="flex gap-2">
                  <Button
                    variant={
                      resolution.confirmed && !resolution.worksiteId
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() =>
                      setWorksiteResolutions((prev) =>
                        prev.map((r) =>
                          r.groupName === resolution.groupName
                            ? {
                                ...r,
                                worksiteId: null,
                                worksiteName: null,
                                confirmed: true,
                              }
                            : r
                        )
                      )
                    }
                    className="text-xs h-7 gap-1"
                  >
                    {resolution.confirmed && !resolution.worksiteId ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    No Worksite
                  </Button>
                  {createWorksiteFor !== resolution.groupName && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 gap-1"
                      onClick={() => {
                        setCreateWorksiteFor(resolution.groupName);
                        setNewWorksiteName(resolution.groupName);
                        setNewWorksiteType("");
                        setCreateWorksiteError(null);
                      }}
                    >
                      <Plus className="h-3 w-3" />
                      Create new
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("employer_selection")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={proceedFromWorksiteMatching} disabled={!allConfirmed}>
            {hasOccupationColumn() ? (
              <>Match Occupations <ArrowRight className="h-4 w-4 ml-1" /></>
            ) : (
              <>Review Rows <ArrowRight className="h-4 w-4 ml-1" /></>
            )}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderOuMatching() {
    const allConfirmed = ouResolutions.every((r) => r.confirmed);
    const OU_TYPES: CampaignOuType[] = [
      "shift",
      "department",
      "network",
      "job_type",
      "worksite",
      "employer",
      "ethnic_community",
      "crew_rotation",
      "accommodation",
      "work_area",
      "custom",
    ];

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {ouResolutions.length} unique organising unit
          {ouResolutions.length !== 1 ? "s" : ""} detected. Confirm or override
          the mapping for each.
        </p>

        <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
          {ouResolutions.map((resolution) => {
            const workerCount = headerRows.filter((r) => {
              const col = columnMappings.find((m) => m.field === "organising_unit")?.header ?? "";
              return String(r[col] ?? "").trim() === resolution.rawValue;
            }).length;

            const searchTerm = ouSearch[resolution.rawValue] ?? "";
            const filteredOus = searchTerm
              ? campaignOus.filter((ou) =>
                  ou.name.toLowerCase().includes(searchTerm.toLowerCase())
                )
              : [];

            return (
              <div
                key={resolution.rawValue}
                className="border rounded-lg p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-sm">{resolution.rawValue}</p>
                    <p className="text-xs text-muted-foreground">
                      {workerCount} worker{workerCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {resolution.confirmed ? (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {resolution.ouName ?? "No Unit"}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Needs Review</Badge>
                  )}
                </div>

                {resolution.candidates.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Suggested matches — click to select:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {resolution.candidates.map((c) => {
                        const isSelected =
                          resolution.confirmed && resolution.ouId === c.ou_id;
                        return (
                          <Button
                            key={c.ou_id}
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            onClick={() => resolveOu(resolution.rawValue, { ou_id: c.ou_id, name: c.name, ou_type: c.ou_type })}
                            className="h-8 text-xs gap-1.5"
                          >
                            {isSelected && (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <Badge
                              variant={isSelected ? "secondary" : "outline"}
                              className="text-[10px] px-1 py-0 h-4"
                            >
                              {c.ou_type.replace(/_/g, " ")}
                            </Badge>
                            {c.name}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search organising units..."
                    value={searchTerm}
                    onChange={(e) =>
                      setOuSearch((prev) => ({
                        ...prev,
                        [resolution.rawValue]: e.target.value,
                      }))
                    }
                    className="pl-8 h-8 text-sm"
                  />
                  {searchTerm && filteredOus.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 border rounded-md bg-background shadow-md max-h-40 overflow-y-auto">
                      {filteredOus.map((ou) => (
                        <button
                          key={ou.ou_id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                          onClick={() => {
                            resolveOu(resolution.rawValue, ou);
                            setOuSearch((prev) => ({
                              ...prev,
                              [resolution.rawValue]: "",
                            }));
                          }}
                        >
                          {ou.name}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {ou.ou_type.replace(/_/g, " ")}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {createOuFor === resolution.rawValue ? (
                  <div className="border rounded-md p-3 space-y-2 bg-muted/30">
                    <p className="text-xs font-medium">New organising unit</p>
                    <Input
                      placeholder="Unit name"
                      value={newOuName}
                      onChange={(e) => setNewOuName(e.target.value)}
                      className="h-8 text-sm"
                      autoFocus
                    />
                    <Select
                      value={newOuType}
                      onValueChange={(v) => setNewOuType(v as CampaignOuType)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select unit type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {OU_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {createOuError && (
                      <p className="text-xs text-destructive">{createOuError}</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!newOuName.trim() || !newOuType || isCreatingOu}
                        onClick={() => handleCreateOu(resolution.rawValue)}
                      >
                        {isCreatingOu ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Plus className="h-3 w-3 mr-1" />
                        )}
                        Create &amp; assign
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setCreateOuFor(null);
                          setNewOuName("");
                          setNewOuType("");
                          setCreateOuError(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="flex gap-2">
                  <Button
                    variant={
                      resolution.confirmed && !resolution.ouId ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() =>
                      setOuResolutions((prev) =>
                        prev.map((r) =>
                          r.rawValue === resolution.rawValue
                            ? { ...r, ouId: null, ouName: null, confirmed: true }
                            : r
                        )
                      )
                    }
                    className="text-xs h-7 gap-1"
                  >
                    {resolution.confirmed && !resolution.ouId ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    No Unit
                  </Button>
                  {createOuFor !== resolution.rawValue && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 gap-1"
                      onClick={() => {
                        setCreateOuFor(resolution.rawValue);
                        setNewOuName(resolution.rawValue);
                        setNewOuType("custom");
                        setCreateOuError(null);
                      }}
                    >
                      <Plus className="h-3 w-3" />
                      Create new
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("worksite_matching")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={proceedFromOuMatching} disabled={!allConfirmed}>
            {hasOccupationColumn() ? (
              <>Match Occupations <ArrowRight className="h-4 w-4 ml-1" /></>
            ) : (
              <>Review Rows <ArrowRight className="h-4 w-4 ml-1" /></>
            )}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderRowReview() {
    const warningCount = reviewRows.filter((r) => r.parseWarnings.length > 0).length;
    const noMembershipTypeCount = reviewRows.filter(
      (r) => resolvedUnionMembershipIdForApply(r) == null
    ).length;
    const assessmentEventCount = reviewRows.reduce(
      (sum, row) => sum + (row.assessmentEvents?.length ?? 0),
      0
    );
    const backStep: WizardStep = ouResolutions.length > 0
      ? "ou_matching"
      : worksiteResolutions.length > 0
      ? "worksite_matching"
      : "employer_selection";

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-muted-foreground">
            {reviewRows.length} workers parsed.
            {warningCount > 0 && (
              <span className="ml-2 text-amber-600 font-medium">
                {warningCount} row{warningCount !== 1 ? "s" : ""} with warnings.
              </span>
            )}
            {noMembershipTypeCount > 0 && (
              <span className="ml-2 text-muted-foreground">
                {noMembershipTypeCount} with no member type.
              </span>
            )}
            {assessmentEventCount > 0 && (
              <span className="ml-2 text-muted-foreground">
                {assessmentEventCount} assessment value{assessmentEventCount !== 1 ? "s" : ""}.
              </span>
            )}
          </p>
          {fileFormat === "header" && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 gap-1 text-muted-foreground"
              onClick={() => setStep("column_mapping")}
            >
              <ArrowLeft className="h-3 w-3" />
              Fix column mapping
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Set all member types:</span>
          <Select
            value={bulkUnionMembershipId}
            onValueChange={setBulkUnionMembershipId}
          >
            <SelectTrigger className="h-7 text-xs w-36">
              <SelectValue placeholder="Choose type…" />
            </SelectTrigger>
            <SelectContent>
              {unionMembershipTypes.map((rt) => (
                <SelectItem
                  key={rt.union_membership_type_id}
                  value={String(rt.union_membership_type_id)}
                  className="text-xs"
                >
                  {rt.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={!bulkUnionMembershipId}
            onClick={() => {
              if (!bulkUnionMembershipId) return;
              const id = Number(bulkUnionMembershipId);
              setReviewRows((prev) =>
                prev.map((r) => ({ ...r, overrideUnionMembershipTypeId: id }))
              );
            }}
          >
            Apply to all
          </Button>
          {bulkUnionMembershipId && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setBulkUnionMembershipId("")}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        <div className="border rounded-lg overflow-auto max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Ref ID</TableHead>
                <TableHead className="text-xs">First Name</TableHead>
                <TableHead className="text-xs">Last Name</TableHead>
                <TableHead className="text-xs">Preferred Name</TableHead>
                <TableHead className="text-xs">Phone</TableHead>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Member type</TableHead>
                <TableHead className="text-xs">Join Date</TableHead>
                <TableHead className="text-xs">Re-join Date</TableHead>
                <TableHead className="text-xs">Notes</TableHead>
                <TableHead className="text-xs">Worksite</TableHead>
                <TableHead className="text-xs w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviewRows.map((row) => (
                <TableRow
                  key={row.rowIndex}
                  className={row.parseWarnings.length > 0 ? "bg-amber-50" : ""}
                >
                  <TableCell className="p-1">
                    <Input
                      value={row.overrideReferenceId ?? row.referenceId ?? ""}
                      onChange={(e) =>
                        updateReviewRow(row.rowIndex, {
                          overrideReferenceId: e.target.value || undefined,
                        })
                      }
                      className="h-7 text-xs font-mono"
                      placeholder="—"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={row.overrideFirstName ?? row.firstName}
                      onChange={(e) =>
                        updateReviewRow(row.rowIndex, {
                          overrideFirstName: e.target.value,
                        })
                      }
                      className="h-7 text-xs"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={row.overrideLastName ?? row.lastName}
                      onChange={(e) =>
                        updateReviewRow(row.rowIndex, {
                          overrideLastName: e.target.value,
                        })
                      }
                      className="h-7 text-xs"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={row.overridePreferredName ?? row.preferredName ?? ""}
                      onChange={(e) =>
                        updateReviewRow(row.rowIndex, {
                          overridePreferredName: e.target.value || undefined,
                        })
                      }
                      className="h-7 text-xs"
                      placeholder="—"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={row.overridePhone ?? row.phone ?? ""}
                      onChange={(e) =>
                        updateReviewRow(row.rowIndex, {
                          overridePhone: e.target.value || undefined,
                        })
                      }
                      className="h-7 text-xs"
                      placeholder="—"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={row.overrideEmail ?? row.email ?? ""}
                      onChange={(e) =>
                        updateReviewRow(row.rowIndex, {
                          overrideEmail: e.target.value || undefined,
                        })
                      }
                      className="h-7 text-xs"
                      placeholder="—"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Select
                      value={unionMembershipSelectValue(row)}
                      onValueChange={(v) =>
                        updateReviewRow(row.rowIndex, {
                          overrideUnionMembershipTypeId: v && v !== "__none__" ? Number(v) : null,
                        })
                      }
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {unionMembershipTypes.map((rt) => (
                          <SelectItem
                            key={rt.union_membership_type_id}
                            value={String(rt.union_membership_type_id)}
                          >
                            {rt.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={row.overrideJoinDate ?? row.joinDate ?? ""}
                      onChange={(e) =>
                        updateReviewRow(row.rowIndex, {
                          overrideJoinDate: e.target.value || undefined,
                        })
                      }
                      className="h-7 text-xs"
                      placeholder="yyyy-mm-dd"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={row.overrideRejoinDate ?? row.rejoinDate ?? ""}
                      onChange={(e) =>
                        updateReviewRow(row.rowIndex, {
                          overrideRejoinDate: e.target.value || undefined,
                        })
                      }
                      className="h-7 text-xs"
                      placeholder="yyyy-mm-dd"
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={row.overrideNotes ?? row.notes ?? ""}
                      onChange={(e) =>
                        updateReviewRow(row.rowIndex, {
                          overrideNotes: e.target.value || undefined,
                        })
                      }
                      className="h-7 text-xs"
                      placeholder="—"
                    />
                  </TableCell>
                  <TableCell className="p-1 text-xs text-muted-foreground whitespace-nowrap">
                    {row.resolvedWorksiteName ?? "—"}
                  </TableCell>
                  <TableCell className="p-1">
                    {row.parseWarnings.length > 0 && (
                      <span title={row.parseWarnings.join("\n")}>
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep(backStep)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={proceedToDedupCheck}>
            Check for Duplicates <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderOccupationMatching() {
    const allConfirmed = occupationResolutions.every((r) => r.confirmed);

    const backStep: WizardStep = ouResolutions.length > 0
      ? "ou_matching"
      : worksiteResolutions.length > 0
      ? "worksite_matching"
      : "employer_selection";

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {occupationResolutions.length} unique occupation
          {occupationResolutions.length !== 1 ? "s" : ""} detected. Confirm or
          override the match for each.
        </p>

        <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
          {occupationResolutions.map((res) => {
            const searchTerm = occupationSearch[res.rawValue] ?? "";
            const filteredOccs = searchTerm
              ? occupations.filter((o) =>
                  o.canonical_name.toLowerCase().includes(searchTerm.toLowerCase())
                )
              : [];
            const additionalOptions = occupations.filter(
              (o) =>
                o.occupation_id !== res.resolvedOccupationId &&
                !res.additionalOccupationIds.includes(o.occupation_id)
            );
            const specialisationOptions = specialisations.filter(
              (s) => !res.specialisationIds.includes(s.specialisation_id)
            );

            return (
              <div key={res.rawValue} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{res.rawValue}</p>
                    <p className="text-xs text-muted-foreground">
                      {res.occurrences} worker{res.occurrences !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {res.confirmed ? (
                    <Badge variant="default" className="gap-1 shrink-0">
                      <CheckCircle2 className="h-3 w-3" />
                      {res.resolvedCanonicalName ?? "No Occupation"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0">Needs Review</Badge>
                  )}
                </div>

                {res.candidates.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      Suggested matches — click to select:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {res.candidates.map((c) => {
                        const isSelected =
                          res.confirmed && res.resolvedOccupationId === c.occupation_id;
                        return (
                          <Button
                            key={c.occupation_id}
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            className="h-8 text-xs gap-1.5"
                            onClick={() =>
                              setOccupationResolutions((prev) =>
                                prev.map((r) =>
                                  r.rawValue === res.rawValue
                                    ? {
                                        ...r,
                                        resolvedOccupationId: c.occupation_id,
                                        resolvedCanonicalName: c.canonical_name,
                                        createOccupationName: null,
                                        confirmed: true,
                                        search: "",
                                      }
                                    : r
                                )
                              )
                            }
                          >
                            {isSelected && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                            {c.canonical_name}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search occupations..."
                    value={searchTerm}
                    onChange={(e) =>
                      setOccupationSearch((prev) => ({
                        ...prev,
                        [res.rawValue]: e.target.value,
                      }))
                    }
                    className="pl-8 h-8 text-sm"
                  />
                  {searchTerm && filteredOccs.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 border rounded-md bg-background shadow-md max-h-40 overflow-y-auto">
                      {filteredOccs.map((o) => (
                        <button
                          key={o.occupation_id}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                          onClick={() => {
                            setOccupationResolutions((prev) =>
                              prev.map((r) =>
                                r.rawValue === res.rawValue
                                  ? {
                                      ...r,
                                      resolvedOccupationId: o.occupation_id,
                                      resolvedCanonicalName: o.canonical_name,
                                      createOccupationName: null,
                                      confirmed: true,
                                    }
                                  : r
                              )
                            );
                            setOccupationSearch((prev) => ({
                              ...prev,
                              [res.rawValue]: "",
                            }));
                          }}
                        >
                          {o.canonical_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    value=""
                    onValueChange={(value) => {
                      const occupationId = Number(value);
                      const occupation = occupations.find((o) => o.occupation_id === occupationId);
                      if (!occupation) return;
                      setOccupationResolutions((prev) =>
                        prev.map((r) =>
                          r.rawValue === res.rawValue
                            ? {
                                ...r,
                                additionalOccupationIds: [
                                  ...r.additionalOccupationIds,
                                  occupation.occupation_id,
                                ],
                              }
                            : r
                        )
                      );
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Add secondary occupation..." />
                    </SelectTrigger>
                    <SelectContent>
                      {additionalOptions.map((o) => (
                        <SelectItem key={o.occupation_id} value={String(o.occupation_id)}>
                          {o.canonical_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value=""
                    onValueChange={(value) => {
                      const specialisationId = Number(value);
                      const specialisation = specialisations.find(
                        (s) => s.specialisation_id === specialisationId
                      );
                      if (!specialisation) return;
                      setOccupationResolutions((prev) =>
                        prev.map((r) =>
                          r.rawValue === res.rawValue
                            ? {
                                ...r,
                                specialisationIds: [
                                  ...r.specialisationIds,
                                  specialisation.specialisation_id,
                                ],
                              }
                            : r
                        )
                      );
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Add specialisation..." />
                    </SelectTrigger>
                    <SelectContent>
                      {specialisationOptions.map((s) => (
                        <SelectItem key={s.specialisation_id} value={String(s.specialisation_id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(res.additionalOccupationIds.length > 0 ||
                  res.specialisationIds.length > 0 ||
                  res.createSpecialisationNames.length > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {res.additionalOccupationIds.map((id) => {
                      const occupation = occupations.find((o) => o.occupation_id === id);
                      return (
                        <Badge key={`occ-${id}`} variant="secondary" className="gap-1 pr-1">
                          {occupation?.canonical_name ?? `Occupation #${id}`}
                          <button
                            type="button"
                            onClick={() =>
                              setOccupationResolutions((prev) =>
                                prev.map((r) =>
                                  r.rawValue === res.rawValue
                                    ? {
                                        ...r,
                                        additionalOccupationIds: r.additionalOccupationIds.filter(
                                          (x) => x !== id
                                        ),
                                      }
                                    : r
                                )
                              )
                            }
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                    {res.specialisationIds.map((id) => {
                      const specialisation = specialisations.find((s) => s.specialisation_id === id);
                      return (
                        <Badge key={`spec-${id}`} variant="outline" className="gap-1 pr-1">
                          {specialisation?.name ?? `Specialisation #${id}`}
                          <button
                            type="button"
                            onClick={() =>
                              setOccupationResolutions((prev) =>
                                prev.map((r) =>
                                  r.rawValue === res.rawValue
                                    ? {
                                        ...r,
                                        specialisationIds: r.specialisationIds.filter((x) => x !== id),
                                      }
                                    : r
                                )
                              )
                            }
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                    {res.createSpecialisationNames.map((name) => (
                      <Badge key={`new-spec-${name}`} variant="outline" className="gap-1 pr-1">
                        New: {name}
                        <button
                          type="button"
                          onClick={() =>
                            setOccupationResolutions((prev) =>
                              prev.map((r) =>
                                r.rawValue === res.rawValue
                                  ? {
                                      ...r,
                                      createSpecialisationNames: r.createSpecialisationNames.filter(
                                        (x) => x !== name
                                      ),
                                    }
                                  : r
                              )
                            )
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    value={res.newSpecialisationName}
                    onChange={(event) =>
                      setOccupationResolutions((prev) =>
                        prev.map((r) =>
                          r.rawValue === res.rawValue
                            ? { ...r, newSpecialisationName: event.target.value }
                            : r
                        )
                      )
                    }
                    placeholder="New specialisation, e.g. Rope Access"
                    className="h-8 text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={!res.newSpecialisationName.trim()}
                    onClick={() =>
                      setOccupationResolutions((prev) =>
                        prev.map((r) =>
                          r.rawValue === res.rawValue
                            ? {
                                ...r,
                                createSpecialisationNames: [
                                  ...r.createSpecialisationNames,
                                  r.newSpecialisationName.trim(),
                                ],
                                newSpecialisationName: "",
                              }
                            : r
                        )
                      )
                    }
                  >
                    Add skill
                  </Button>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={res.createOccupationName ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-7 gap-1"
                    onClick={() =>
                      setOccupationResolutions((prev) =>
                        prev.map((r) =>
                          r.rawValue === res.rawValue
                            ? {
                                ...r,
                                resolvedOccupationId: null,
                                resolvedCanonicalName: null,
                                createOccupationName: res.rawValue,
                                confirmed: true,
                              }
                            : r
                        )
                      )
                    }
                  >
                    <Plus className="h-3 w-3" />
                    Create occupation
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 gap-1"
                    onClick={() =>
                      setOccupationResolutions((prev) =>
                        prev.map((r) =>
                          r.rawValue === res.rawValue
                            ? {
                                ...r,
                                resolvedOccupationId: null,
                                resolvedCanonicalName: null,
                                createOccupationName: null,
                                confirmed: true,
                              }
                            : r
                        )
                      )
                    }
                  >
                    {res.confirmed && !res.resolvedOccupationId ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    No Match
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep(backStep)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={proceedFromOccupationMatching} disabled={!allConfirmed}>
            Review Rows <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderDedupCheck() {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Checking for existing workers…</p>
        </div>
      );
    }

    const rowMap = new Map(reviewRows.map((r) => [r.rowIndex, r]));

    if (dedupMatches.length === 0) {
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted">
            <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-sm">No duplicates found</p>
              <p className="text-xs text-muted-foreground">
                All {reviewRows.length} workers will be created as new records.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep("row_review")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button onClick={() => setStep("confirm")}>
              Proceed to Confirm <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </DialogFooter>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {dedupMatches.length} potential duplicate
          {dedupMatches.length !== 1 ? "s" : ""} found. Choose how to handle each match.
        </p>

        <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
          {dedupMatches.map((match) => {
            const importRow = rowMap.get(match.rowIndex);
            if (!importRow) return null;

            return (
              <div key={match.rowIndex} className="border rounded-lg p-4">
                <div className="flex items-start gap-3 mb-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-muted-foreground">
                    Matched on{" "}
                    <span className="font-medium text-foreground">
                      {match.matchedOn === "reference_id" ? "Reference ID" : match.matchedOn}
                    </span>
                    {match.matchedOn === "reference_id" && (
                      <Badge variant="default" className="ml-2 text-[10px] px-1.5 h-4">Primary key</Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs mb-3">
                  <div className="space-y-1">
                    <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">
                      Importing
                    </p>
                    <p className="font-medium">
                      {importRow.overrideFirstName ?? importRow.firstName}{" "}
                      {importRow.overrideLastName ?? importRow.lastName}
                    </p>
                    <p className="text-muted-foreground">
                      {importRow.overrideEmail ?? importRow.email ?? "—"}
                    </p>
                    <p className="text-muted-foreground">
                      {importRow.overridePhone ?? importRow.phone ?? "—"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">
                      Existing (#{match.existingWorkerId})
                    </p>
                    <p className="font-medium">
                      {match.existingFirstName} {match.existingLastName}
                    </p>
                    <p className="text-muted-foreground">
                      {match.existingEmail ?? "—"}
                    </p>
                    <p className="text-muted-foreground">
                      {match.existingPhone ?? "—"}
                    </p>
                    {match.existingWorksiteName && (
                      <p className="text-muted-foreground">
                        {match.existingWorksiteName}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  {(["update", "skip", "create"] as DedupMatch["action"][]).map(
                    (action) => (
                      <Button
                        key={action}
                        variant={match.action === action ? "default" : "outline"}
                        size="sm"
                        className="text-xs h-7 capitalize"
                        onClick={() => updateDedupAction(match.rowIndex, action)}
                      >
                        {action === "update"
                          ? "Update Existing"
                          : action === "skip"
                            ? "Skip"
                            : "Import as New"}
                      </Button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("row_review")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={() => setStep("confirm")}>
            Proceed to Confirm <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderConfirm() {
    const dedupMap = new Map(dedupMatches.map((m) => [m.rowIndex, m]));
    let toCreate = 0;
    let toUpdate = 0;
    let toSkip = 0;

    for (const row of reviewRows) {
      const dedup = dedupMap.get(row.rowIndex);
      if (!dedup) { toCreate++; continue; }
      if (dedup.action === "update") toUpdate++;
      else if (dedup.action === "skip") toSkip++;
      else toCreate++;
    }

    const worksiteSummary = worksiteResolutions.filter((r) => r.worksiteId);
    const assessmentEventCount = reviewRows.reduce(
      (sum, row) => sum + (row.assessmentEvents?.length ?? 0),
      0
    );
    const extraRoleCount = reviewRows.reduce(
      (sum, row) =>
        sum +
        (row.additionalOccupationIds?.length ?? 0) +
        (row.specialisationIds?.length ?? 0) +
        (row.createSpecialisationNames?.length ?? 0),
      0
    );

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "To Create", value: toCreate, color: "text-green-600" },
            { label: "To Update", value: toUpdate, color: "text-blue-600" },
            { label: "To Skip", value: toSkip, color: "text-muted-foreground" },
          ].map(({ label, value, color }) => (
            <div key={label} className="border rounded-lg p-3 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {selectedEmployerName && (
          <div className="rounded-lg border p-3 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Employer Assignment
              </p>
              <p className="text-sm font-medium">{selectedEmployerName}</p>
            </div>
          </div>
        )}

        {worksiteSummary.length > 0 && (
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Worksite Assignments
            </p>
            {worksiteSummary.map((r) => {
              const count =
                fileFormat === "group"
                  ? (groups.find((g) => g.groupName === r.groupName)?.rows.length ?? 0)
                  : headerRows.filter((row) => {
                      const wCol =
                        columnMappings.find((m) => m.field === "worksite")?.header ?? "";
                      return String(row[wCol] ?? "").trim() === r.groupName;
                    }).length;
              return (
                <div key={r.groupName} className="flex justify-between text-xs">
                  <span className="font-medium">{r.groupName}</span>
                  <span className="text-muted-foreground">
                    → {r.worksiteName} ({count} workers)
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {(assessmentEventCount > 0 || extraRoleCount > 0) && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground">Assessment Values</p>
              <p className="text-lg font-semibold">{assessmentEventCount}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground">Extra Roles/Skills</p>
              <p className="text-lg font-semibold">{extraRoleCount}</p>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          This action will be logged to Import History.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep("dedup_check")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Button onClick={applyImport} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Applying…
              </>
            ) : (
              <>Apply Import <ArrowRight className="h-4 w-4 ml-1" /></>
            )}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  function renderDone() {
    if (!result) return null;
    const hasErrors = result.errors.length > 0;
    return (
      <div className="space-y-4">
        <div
          className={`flex items-center gap-3 p-4 rounded-lg ${
            hasErrors ? "bg-amber-50" : "bg-green-50"
          }`}
        >
          {hasErrors ? (
            <AlertCircle className="h-6 w-6 text-amber-600 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
          )}
          <div>
            <p className="font-medium text-sm">
              {hasErrors ? "Import completed with errors" : "Import successful"}
            </p>
            <p className="text-xs text-muted-foreground">
              {result.created} created · {result.updated} updated · {result.skipped}{" "}
              skipped
            </p>
          </div>
        </div>

        {hasErrors && (
          <div className="border rounded-lg p-3 space-y-1 max-h-48 overflow-y-auto">
            <p className="text-xs font-medium text-destructive">Errors:</p>
            {result.errors.map((err, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                {err}
              </p>
            ))}
          </div>
        )}

        {result.rowResults.length > 0 && (
          <div className="border rounded-lg p-3 space-y-1 max-h-48 overflow-y-auto">
            <p className="text-xs font-medium text-muted-foreground">Row results:</p>
            {result.rowResults.slice(0, 20).map((row) => (
              <p key={row.rowIndex} className="text-xs text-muted-foreground">
                Row {row.rowIndex + 1}: {row.status}
                {row.workerId ? ` (#${row.workerId})` : ""}
              </p>
            ))}
            {result.rowResults.length > 20 && (
              <p className="text-xs text-muted-foreground">
                {result.rowResults.length - 20} more rows not shown.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={reset}>
            Import Another File
          </Button>
          <Button
            onClick={() => {
              onComplete?.();
              onOpenChange(false);
              reset();
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Worker Import Wizard
          </DialogTitle>
          <DialogDescription>
            Import workers from an xlsx spreadsheet with column mapping, employer
            assignment, worksite matching, and deduplication.
          </DialogDescription>
        </DialogHeader>

        <StepIndicator />

        {isLoading && step === "upload" ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Parsing spreadsheet…</p>
          </div>
        ) : (
          <>
            {step === "upload" && renderUpload()}
            {step === "column_mapping" && renderColumnMapping()}
            {step === "value_mapping" && renderValueMapping()}
            {step === "assessment_mapping" && renderAssessmentMapping()}
            {step === "employer_selection" && renderEmployerSelection()}
            {step === "worksite_matching" && renderWorksiteMatching()}
            {step === "ou_matching" && renderOuMatching()}
            {step === "occupation_matching" && renderOccupationMatching()}
            {step === "row_review" && renderRowReview()}
            {step === "dedup_check" && renderDedupCheck()}
            {step === "confirm" && renderConfirm()}
            {step === "done" && renderDone()}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
