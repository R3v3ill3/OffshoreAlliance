"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchApi, API_FETCH_TIMEOUT_UPLOAD_MS } from "@/lib/api/fetch-api";
import {
  autoMapParticipationHeader,
  defaultKeepNote,
  isTimestampHeader,
  type AnActionListItem,
  type AnFetchResponse,
  type AnResolvedPerson,
  type AnResolvePeopleResponse,
  type ImportAssessmentSpec,
  type ParticipationApplyPreview,
  type ParticipationApplyRequest,
  type ParticipationApplyResult,
  type ParticipationApplyRow,
  type ParticipationMatchCandidate,
  type ParticipationMatchResponse,
  type ParticipationRowValue,
  type ResponseValueTarget,
} from "@/lib/import/participation-import-shared";
import { normaliseEmail, normalisePhone } from "@/lib/import/worker-matching";
import type {
  AnParticipantRow,
  AssessmentChoice,
  ColumnMap,
  ImportRow,
  MatchState,
  QuestionMapping,
  RowCleanupStats,
  RowDecision,
  RowQuestionValue,
  WizardSource,
  WizardStep,
} from "./types";

const RESOLVE_CHUNK = 25;
const ANONYMOUS_EMAIL = "anonymous@anonymous.com";

function splitFullName(raw: string): { firstName: string; lastName: string } {
  const cleaned = raw.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  if (cleaned.includes(",")) {
    const [last, first] = cleaned.split(",", 2);
    return { firstName: (first ?? "").trim(), lastName: last.trim() };
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: cleaned, lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

let questionCounter = 0;
function nextQuestionId(): string {
  questionCounter += 1;
  return `q${questionCounter}`;
}

export function newQuestion(column: string | null): QuestionMapping {
  return {
    id: nextQuestionId(),
    column,
    assessment: null,
    valueMappings: [],
    fixedTarget: { kind: "binary", value: "yes" },
    nonResponders: { enabled: false, target: { kind: "binary", value: "no" } },
  };
}

export function useParticipationImport(campaignId: string, onDataChanged?: () => void) {
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WizardStep>("source");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [source, setSource] = useState<WizardSource | null>(null);
  const [columnMap, setColumnMap] = useState<ColumnMap>({});
  const [questions, setQuestions] = useState<QuestionMapping[]>([]);
  const [conflictPolicy, setConflictPolicy] = useState<"overwrite" | "fill_blanks">("overwrite");
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [preview, setPreview] = useState<ParticipationApplyPreview | null>(null);
  const [result, setResult] = useState<ParticipationApplyResult | null>(null);

  const reset = useCallback(() => {
    setStep("source");
    setBusy(false);
    setError(null);
    setSource(null);
    setColumnMap({});
    setQuestions([]);
    setConflictPolicy("overwrite");
    setMatchState(null);
    setPreview(null);
    setResult(null);
  }, []);

  // ── Source: CSV upload ──────────────────────────────────────────────────────

  const uploadFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetchApi(`/api/campaigns/${campaignId}/participation-import/parse`, {
          method: "POST",
          body: formData,
          timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "Could not read file");
        setSource({
          kind: "csv",
          csv: { fileName: json.fileName, headers: json.headers, rows: json.rows },
        });
        // Seed identity column auto-mapping (first header wins per field).
        const map: ColumnMap = {};
        for (const h of json.headers as string[]) {
          const field = autoMapParticipationHeader(h);
          if (field !== "ignore" && !(field in map)) map[field] = h;
        }
        setColumnMap(map);
        setQuestions([newQuestion(null)]);
        setStep("mapping");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [campaignId]
  );

  // ── Source: AN API sync ─────────────────────────────────────────────────────

  const [anProgress, setAnProgress] = useState<string | null>(null);

  /**
   * Pull an AN action's participants: fast local resolution first (workers
   * with a stored action_network_id), then person fetches for the rest in
   * small chunks with progress feedback.
   */
  const loadAnAction = useCallback(
    async (action: AnActionListItem) => {
      setBusy(true);
      setError(null);
      setAnProgress("Fetching participants from Action Network…");
      try {
        const res = await fetchApi(
          `/api/campaigns/${campaignId}/participation-import/fetch-an`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              resource_type: action.resource_type,
              resource_id: action.id,
            }),
            timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
          }
        );
        const json: AnFetchResponse | { success: false; error?: string } = await res.json();
        if (!json.success) throw new Error(("error" in json && json.error) || "Fetch failed");

        const respondedById = new Map<string, string | null>([
          ...json.known.map((k) => [k.an_person_id, k.responded_at] as const),
          ...json.unknown.map((u) => [u.an_person_id, u.responded_at] as const),
        ]);

        const resolved: AnResolvedPerson[] = [];
        const unknownIds = json.unknown.map((u) => u.an_person_id);
        for (let i = 0; i < unknownIds.length; i += RESOLVE_CHUNK) {
          setAnProgress(
            `Fetching participant details… ${Math.min(i + RESOLVE_CHUNK, unknownIds.length)} of ${unknownIds.length}`
          );
          const chunk = unknownIds.slice(i, i + RESOLVE_CHUNK);
          const resolveRes = await fetchApi(
            `/api/campaigns/${campaignId}/participation-import/resolve-people`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: chunk }),
              timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
            }
          );
          const resolveJson: AnResolvePeopleResponse | { success: false; error?: string } =
            await resolveRes.json();
          if (!resolveJson.success) {
            throw new Error(("error" in resolveJson && resolveJson.error) || "Person fetch failed");
          }
          resolved.push(...resolveJson.people);
        }

        const participants: AnParticipantRow[] = [
          ...json.known.map((k) => ({
            an_person_id: k.an_person_id,
            emails: k.email ? [k.email] : [],
            phones: k.phone ? [k.phone] : [],
            given_name: k.first_name,
            family_name: k.last_name,
            responded_at: k.responded_at,
            resolved_worker_id: k.worker_id,
          })),
          ...resolved.map((p) => ({
            an_person_id: p.an_person_id,
            emails: p.emails,
            phones: p.phones,
            given_name: p.given_name,
            family_name: p.family_name,
            responded_at: respondedById.get(p.an_person_id) ?? null,
            resolved_worker_id: null,
          })),
        ];

        if (participants.length === 0) {
          throw new Error("This action has no participants yet.");
        }

        setSource({ kind: "an", action, participants });
        setQuestions([newQuestion(null)]);
        setStep("mapping");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action Network fetch failed");
      } finally {
        setBusy(false);
        setAnProgress(null);
      }
    },
    [campaignId]
  );

  // ── CSV cleanup: identity extraction, anonymous skip, latest-wins dedupe ──

  const identityFor = useCallback(
    (row: Record<string, string>) => {
      const emailCol = columnMap.email;
      const phoneCol = columnMap.phone;
      const firstCol = columnMap.first_name;
      const lastCol = columnMap.last_name;
      const fullCol = columnMap.full_name;
      let firstName = firstCol ? (row[firstCol] ?? "").trim() : "";
      let lastName = lastCol ? (row[lastCol] ?? "").trim() : "";
      if (fullCol && !firstCol && !lastCol) {
        const split = splitFullName((row[fullCol] ?? "").trim());
        firstName = split.firstName;
        lastName = split.lastName;
      }
      const email = emailCol ? (row[emailCol] ?? "").trim() : "";
      const phone = phoneCol ? (row[phoneCol] ?? "").trim() : "";
      return { email, phone, firstName, lastName };
    },
    [columnMap]
  );

  const { cleanRows, cleanupStats } = useMemo((): {
    cleanRows: { key: string; row: Record<string, string> }[];
    cleanupStats: RowCleanupStats;
  } => {
    if (!source || source.kind !== "csv") {
      return { cleanRows: [], cleanupStats: { duplicatesCollapsed: 0, skippedNoIdentity: 0 } };
    }
    const tsCol = source.csv.headers.find(isTimestampHeader) ?? null;
    let skippedNoIdentity = 0;
    // Latest submission wins per identity (AN transaction reports contain
    // one row per submission, so resubmitters appear multiple times).
    const byIdentity = new Map<string, { key: string; row: Record<string, string>; ts: string }>();
    let duplicatesCollapsed = 0;
    source.csv.rows.forEach((row, i) => {
      const { email, phone, firstName, lastName } = identityFor(row);
      const emailNorm = normaliseEmail(email);
      if (emailNorm === ANONYMOUS_EMAIL) {
        skippedNoIdentity += 1;
        return;
      }
      const identityKey =
        emailNorm ??
        normalisePhone(phone) ??
        (firstName && lastName ? `${firstName.toLowerCase()}|${lastName.toLowerCase()}` : null);
      if (!identityKey) {
        skippedNoIdentity += 1;
        return;
      }
      const ts = tsCol ? (row[tsCol] ?? "") : String(i).padStart(8, "0");
      const existing = byIdentity.get(identityKey);
      if (!existing) {
        byIdentity.set(identityKey, { key: String(i), row, ts });
      } else {
        duplicatesCollapsed += 1;
        // Keep the later submission (timestamp strings sort lexically in
        // AN's format; fall back to row order).
        if (ts >= existing.ts) byIdentity.set(identityKey, { key: String(i), row, ts });
      }
    });
    return {
      cleanRows: Array.from(byIdentity.values()).map(({ key, row }) => ({ key, row })),
      cleanupStats: { duplicatesCollapsed, skippedNoIdentity },
    };
  }, [source, identityFor]);

  // ── Question mapping helpers ────────────────────────────────────────────────

  const distinctValuesFor = useCallback(
    (column: string): { value: string; count: number }[] => {
      const counts = new Map<string, number>();
      for (const { row } of cleanRows) {
        const v = (row[column] ?? "").trim();
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, count }));
    },
    [cleanRows]
  );

  const addQuestion = useCallback(() => {
    setQuestions((prev) => [...prev, newQuestion(null)]);
  }, []);

  const removeQuestion = useCallback((id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const updateQuestion = useCallback((id: string, patch: Partial<QuestionMapping>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  const setQuestionColumn = useCallback(
    (id: string, column: string | null) => {
      setQuestions((prev) =>
        prev.map((q) => {
          if (q.id !== id) return q;
          if (!column) return { ...q, column: null, valueMappings: [] };
          const distincts = distinctValuesFor(column);
          return {
            ...q,
            column,
            valueMappings: distincts.map(({ value, count }) => ({
              rawValue: value,
              count,
              target: { kind: "ignore" as const },
              keepNote: false,
            })),
          };
        })
      );
    },
    [distinctValuesFor]
  );

  const setQuestionValueTarget = useCallback(
    (id: string, rawValue: string, target: ResponseValueTarget) => {
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === id
            ? {
                ...q,
                valueMappings: q.valueMappings.map((m) =>
                  m.rawValue === rawValue
                    ? { ...m, target, keepNote: defaultKeepNote(rawValue, target) }
                    : m
                ),
              }
            : q
        )
      );
    },
    []
  );

  const setQuestionValueKeepNote = useCallback((id: string, rawValue: string, keepNote: boolean) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === id
          ? {
              ...q,
              valueMappings: q.valueMappings.map((m) =>
                m.rawValue === rawValue ? { ...m, keepNote } : m
              ),
            }
          : q
      )
    );
  }, []);

  // ── Import rows: identity + per-question resolved targets ──────────────────

  const importRows = useMemo((): ImportRow[] => {
    if (!source) return [];
    if (source.kind === "an") {
      return source.participants.map((p) => ({
        key: p.an_person_id,
        emails: p.emails,
        phones: p.phones,
        firstName: p.given_name,
        lastName: p.family_name,
        values: questions
          .filter((q) => q.assessment != null && q.fixedTarget.kind !== "ignore")
          .map((q) => ({
            questionId: q.id,
            raw: null,
            target: q.fixedTarget,
            keepNote: false,
          })),
        resolvedWorkerId: p.resolved_worker_id,
        anPersonId: p.an_person_id,
      }));
    }

    return cleanRows.map(({ key, row }) => {
      const { email, phone, firstName, lastName } = identityFor(row);
      const values: RowQuestionValue[] = [];
      for (const q of questions) {
        if (!q.assessment) continue;
        if (q.column) {
          const raw = (row[q.column] ?? "").trim();
          const mapping = q.valueMappings.find((m) => m.rawValue === raw);
          if (!mapping || mapping.target.kind === "ignore") continue;
          values.push({
            questionId: q.id,
            raw,
            target: mapping.target,
            keepNote: mapping.keepNote,
          });
        } else if (q.fixedTarget.kind !== "ignore") {
          values.push({ questionId: q.id, raw: null, target: q.fixedTarget, keepNote: false });
        }
      }
      return {
        key,
        emails: email ? [email] : [],
        phones: phone ? [phone] : [],
        firstName,
        lastName,
        values,
      };
    });
  }, [source, cleanRows, identityFor, questions]);

  /** Rows that will actually be recorded (≥1 mapped value). */
  const effectiveRows = useMemo(() => importRows.filter((r) => r.values.length > 0), [importRows]);

  const canMatch = useMemo(() => {
    if (effectiveRows.length === 0) return false;
    return effectiveRows.some(
      (r) => r.emails.length > 0 || r.phones.length > 0 || (r.firstName && r.lastName)
    );
  }, [effectiveRows]);

  // ── Match step ──────────────────────────────────────────────────────────────

  const runMatch = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const activityIds = questions
        .map((q) => (q.assessment?.mode === "existing" ? q.assessment.option.activity_id : null))
        .filter((v): v is number => v != null);
      const res = await fetchApi(`/api/campaigns/${campaignId}/participation-import/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: effectiveRows.map((r) => ({
            key: r.key,
            emails: r.emails.slice(0, 5),
            phones: r.phones.slice(0, 5),
            firstName: r.firstName,
            lastName: r.lastName,
            resolved_worker_id: r.resolvedWorkerId ?? null,
          })),
          activity_ids: activityIds,
        }),
        timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
      });
      const json: ParticipationMatchResponse | { success: false; error?: string } =
        await res.json();
      if (!json.success) throw new Error(("error" in json && json.error) || "Match failed");

      const rowByKey = new Map(effectiveRows.map((r) => [r.key, r]));
      const decisions: Record<string, RowDecision> = {};
      for (const r of json.results) {
        const best = r.candidates[0] ?? null;
        const importRow = rowByKey.get(r.key);
        const canCreate = Boolean(importRow?.firstName && importRow?.lastName);
        if (r.disposition === "auto" || r.disposition === "confirm") {
          decisions[r.key] = {
            action: "match",
            workerId: best?.worker_id ?? null,
            addToCampaign: best ? !best.in_campaign : false,
          };
        } else {
          // review (ambiguous) + unmatched: default to create + add to campaign
          // (per product decision), falling back to skip when we don't have a
          // usable name to create a worker from.
          decisions[r.key] = {
            action: canCreate ? "create" : "skip",
            workerId: null,
            addToCampaign: true,
          };
        }
      }
      setMatchState({ results: json.results, decisions, manualCandidates: {} });
      setStep("match");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Match failed");
    } finally {
      setBusy(false);
    }
  }, [campaignId, effectiveRows, questions]);

  const setDecision = useCallback((key: string, decision: RowDecision) => {
    setMatchState((prev) =>
      prev ? { ...prev, decisions: { ...prev.decisions, [key]: decision } } : prev
    );
  }, []);

  const bulkSetDecisions = useCallback((updates: Record<string, RowDecision>) => {
    setMatchState((prev) =>
      prev ? { ...prev, decisions: { ...prev.decisions, ...updates } } : prev
    );
  }, []);

  /** Link a row to a worker picked via the manual search. */
  const setManualMatch = useCallback(
    (key: string, candidate: ParticipationMatchCandidate) => {
      setMatchState((prev) =>
        prev
          ? {
              ...prev,
              manualCandidates: { ...prev.manualCandidates, [key]: candidate },
              decisions: {
                ...prev.decisions,
                [key]: {
                  action: "match",
                  workerId: candidate.worker_id,
                  addToCampaign: !candidate.in_campaign,
                },
              },
            }
          : prev
      );
    },
    []
  );

  // ── Apply (dry run + real) ──────────────────────────────────────────────────

  const buildApplyRequest = useCallback(
    (dryRun: boolean): ParticipationApplyRequest | null => {
      if (!matchState || !source) return null;
      const rowByKey = new Map(effectiveRows.map((r) => [r.key, r]));
      const activeQuestions = questions.filter((q) => q.assessment != null);
      if (activeQuestions.length === 0) return null;

      const assessments: ImportAssessmentSpec[] = activeQuestions.map((q) => {
        const a = q.assessment as AssessmentChoice;
        let target: ImportAssessmentSpec["target"];
        if (a.mode === "existing") {
          target = { mode: "existing", activity_id: a.option.activity_id };
        } else {
          // Ordinal scales: label the 1–5 points with the answers mapped to them.
          let ratingLabels: Record<string, string> | null = null;
          if (!a.isBinary && a.useAnswerLabels && q.column) {
            ratingLabels = {};
            for (const m of q.valueMappings) {
              if (m.target.kind === "rating" && !ratingLabels[String(m.target.rating)]) {
                ratingLabels[String(m.target.rating)] = m.rawValue.slice(0, 80);
              }
            }
            if (Object.keys(ratingLabels).length === 0) ratingLabels = null;
          }
          target = {
            mode: "new",
            title: a.title,
            is_binary: a.isBinary,
            supporter_outcome_value: a.isBinary ? a.supporterOutcomeValue : null,
            rating_labels: ratingLabels,
            is_perception: a.isPerception,
          };
        }
        return {
          ref: q.id,
          target,
          non_responders: q.nonResponders.enabled
            ? {
                rating:
                  q.nonResponders.target.kind === "rating" ? q.nonResponders.target.rating : null,
                binary_value:
                  q.nonResponders.target.kind === "binary" ? q.nonResponders.target.value : null,
              }
            : null,
        };
      });

      const toValues = (row: ImportRow): ParticipationRowValue[] =>
        row.values.map((v) => ({
          ref: v.questionId,
          rating: v.target.kind === "rating" ? v.target.rating : null,
          binary_value: v.target.kind === "binary" ? v.target.value : null,
          notes: v.keepNote && v.raw ? `AN response: ${v.raw}` : null,
        }));

      const rows: ParticipationApplyRow[] = matchState.results.map((res) => {
        const decision = matchState.decisions[res.key];
        const row = rowByKey.get(res.key);
        if (!decision || !row || decision.action === "skip" || row.values.length === 0) {
          return { key: res.key, action: "skip" };
        }
        if (decision.action === "match" && decision.workerId != null) {
          return {
            key: res.key,
            action: "existing",
            worker_id: decision.workerId,
            add_to_campaign: decision.addToCampaign,
            values: toValues(row),
            an_person_id: row.anPersonId ?? null,
          };
        }
        if (decision.action === "create" && row.firstName && row.lastName) {
          return {
            key: res.key,
            action: "create",
            new_worker: {
              first_name: row.firstName,
              last_name: row.lastName,
              email: row.emails[0] ?? null,
              phone: row.phones[0] ?? null,
            },
            add_to_campaign: decision.addToCampaign,
            values: toValues(row),
            an_person_id: row.anPersonId ?? null,
          };
        }
        return { key: res.key, action: "skip" };
      });

      return {
        assessments,
        source_kind: source.kind === "an" ? "an_api" : "an_report_csv",
        file_name: source.kind === "csv" ? source.csv.fileName : null,
        an_resource:
          source.kind === "an"
            ? {
                type: source.action.resource_type,
                id: source.action.id,
                browser_url: source.action.browser_url,
              }
            : null,
        conflict_policy: conflictPolicy,
        mapping: {
          columnMap,
          questions: questions.map((q) => ({
            column: q.column,
            assessment:
              q.assessment?.mode === "existing"
                ? { mode: "existing", activity_id: q.assessment.option.activity_id }
                : q.assessment,
            valueMappings: q.valueMappings,
            fixedTarget: q.fixedTarget,
            nonResponders: q.nonResponders,
          })),
          conflictPolicy,
          cleanupStats,
        },
        rows,
        dry_run: dryRun,
      };
    },
    [matchState, source, effectiveRows, questions, conflictPolicy, columnMap, cleanupStats]
  );

  const postApply = useCallback(
    async (dryRun: boolean) => {
      const request = buildApplyRequest(dryRun);
      if (!request) throw new Error("Wizard state incomplete");
      const res = await fetchApi(`/api/campaigns/${campaignId}/participation-import/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Import failed");
      return json;
    },
    [buildApplyRequest, campaignId]
  );

  const runPreview = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const json = (await postApply(true)) as ParticipationApplyPreview;
      setPreview(json);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }, [postApply]);

  const runApply = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const json = (await postApply(false)) as ParticipationApplyResult;
      setResult(json);
      setStep("done");
      // Refresh everything the wall chart / list view reads.
      const invalidate = (key: unknown[]) => queryClient.invalidateQueries({ queryKey: key });
      invalidate(["campaign-rating-summary", campaignId]);
      invalidate(["campaign-activity-ratings", campaignId]);
      invalidate(["campaign-activity-ratings-dist", campaignId]);
      invalidate(["worker-activity-ratings", campaignId]);
      invalidate(["campaign-assessments-rated", campaignId]);
      invalidate(["campaign-members-full", campaignId]);
      invalidate(["campaign-activities", campaignId]);
      onDataChanged?.();
      const total = json.per_assessment.reduce((sum, a) => sum + a.ratings_applied, 0);
      toast.success(
        `Recorded ${total} entries across ${json.per_assessment.length} assessment${json.per_assessment.length === 1 ? "" : "s"}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }, [postApply, queryClient, campaignId, onDataChanged]);

  return {
    step,
    setStep,
    busy,
    error,
    setError,
    source,
    uploadFile,
    loadAnAction,
    anProgress,
    columnMap,
    setColumnMap,
    questions,
    addQuestion,
    removeQuestion,
    updateQuestion,
    setQuestionColumn,
    setQuestionValueTarget,
    setQuestionValueKeepNote,
    conflictPolicy,
    setConflictPolicy,
    cleanupStats,
    importRows,
    effectiveRows,
    canMatch,
    runMatch,
    matchState,
    setDecision,
    bulkSetDecisions,
    setManualMatch,
    runPreview,
    preview,
    runApply,
    result,
    reset,
  };
}

export type ParticipationImportController = ReturnType<typeof useParticipationImport>;
