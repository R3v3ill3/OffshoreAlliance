"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchApi, API_FETCH_TIMEOUT_UPLOAD_MS } from "@/lib/api/fetch-api";
import {
  autoMapParticipationHeader,
  type ParticipationApplyPreview,
  type ParticipationApplyRequest,
  type ParticipationApplyResult,
  type ParticipationApplyRow,
  type ParticipationMatchResponse,
  type ResponseValueMapping,
  type ResponseValueTarget,
} from "@/lib/import/participation-import-shared";
import type {
  AssessmentChoice,
  ColumnMap,
  ImportRow,
  MatchState,
  RowDecision,
  WizardSource,
  WizardStep,
} from "./types";

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

export interface NonResponderOption {
  enabled: boolean;
  target: ResponseValueTarget;
}

export function useParticipationImport(campaignId: string, onDataChanged?: () => void) {
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WizardStep>("source");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [source, setSource] = useState<WizardSource | null>(null);
  const [assessment, setAssessment] = useState<AssessmentChoice | null>(null);
  const [columnMap, setColumnMap] = useState<ColumnMap>({});
  const [responseColumn, setResponseColumn] = useState<string | null>(null);
  const [valueMappings, setValueMappings] = useState<ResponseValueMapping[]>([]);
  const [fixedTarget, setFixedTarget] = useState<ResponseValueTarget>({
    kind: "binary",
    value: "yes",
  });
  const [conflictPolicy, setConflictPolicy] = useState<"overwrite" | "fill_blanks">("overwrite");
  const [nonResponders, setNonResponders] = useState<NonResponderOption>({
    enabled: false,
    target: { kind: "binary", value: "no" },
  });
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [preview, setPreview] = useState<ParticipationApplyPreview | null>(null);
  const [result, setResult] = useState<ParticipationApplyResult | null>(null);

  const reset = useCallback(() => {
    setStep("source");
    setBusy(false);
    setError(null);
    setSource(null);
    setAssessment(null);
    setColumnMap({});
    setResponseColumn(null);
    setValueMappings([]);
    setFixedTarget({ kind: "binary", value: "yes" });
    setConflictPolicy("overwrite");
    setNonResponders({ enabled: false, target: { kind: "binary", value: "no" } });
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
        setStep("assessment");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [campaignId]
  );

  /** Phase 2: seed the wizard from an AN action's participant list. */
  const useAnSource = useCallback((src: Extract<WizardSource, { kind: "an" }>) => {
    setSource(src);
    setResponseColumn(null);
    setFixedTarget({ kind: "binary", value: "yes" });
    setStep("assessment");
  }, []);

  // ── Distinct response values (CSV mode) ────────────────────────────────────

  const distinctResponseValues = useMemo(() => {
    if (!source || source.kind !== "csv" || !responseColumn) return [];
    const counts = new Map<string, number>();
    for (const row of source.csv.rows) {
      const v = (row[responseColumn] ?? "").trim();
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
  }, [source, responseColumn]);

  const selectResponseColumn = useCallback(
    (column: string | null) => {
      setResponseColumn(column);
      if (!column || !source || source.kind !== "csv") {
        setValueMappings([]);
        return;
      }
      const counts = new Map<string, number>();
      for (const row of source.csv.rows) {
        const v = (row[column] ?? "").trim();
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      setValueMappings(
        Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([rawValue, count]) => ({
            rawValue,
            count,
            target: rawValue === "" ? { kind: "ignore" } : defaultTargetFor(),
          }))
      );

      function defaultTargetFor(): ResponseValueTarget {
        return { kind: "ignore" };
      }
    },
    [source]
  );

  // ── Import rows: identity + resolved response target ───────────────────────

  const importRows = useMemo((): ImportRow[] => {
    if (!source) return [];
    if (source.kind === "an") {
      return source.participants.map((p) => ({
        key: p.an_person_id,
        emails: p.emails,
        phones: p.phones,
        firstName: p.given_name,
        lastName: p.family_name,
        rawResponse: null,
        target: fixedTarget,
      }));
    }
    const { rows } = source.csv;
    const emailCol = columnMap.email;
    const phoneCol = columnMap.phone;
    const firstCol = columnMap.first_name;
    const lastCol = columnMap.last_name;
    const fullCol = columnMap.full_name;
    const targetByValue = new Map(valueMappings.map((m) => [m.rawValue, m.target]));

    return rows.map((row, i) => {
      let firstName = firstCol ? (row[firstCol] ?? "").trim() : "";
      let lastName = lastCol ? (row[lastCol] ?? "").trim() : "";
      if (fullCol && !firstCol && !lastCol) {
        const split = splitFullName((row[fullCol] ?? "").trim());
        firstName = split.firstName;
        lastName = split.lastName;
      }
      const rawResponse = responseColumn ? (row[responseColumn] ?? "").trim() : null;
      const target: ResponseValueTarget = responseColumn
        ? (targetByValue.get(rawResponse ?? "") ?? { kind: "ignore" })
        : fixedTarget;
      return {
        key: String(i),
        emails: emailCol ? [(row[emailCol] ?? "").trim()].filter(Boolean) : [],
        phones: phoneCol ? [(row[phoneCol] ?? "").trim()].filter(Boolean) : [],
        firstName,
        lastName,
        rawResponse,
        target,
      };
    });
  }, [source, columnMap, responseColumn, valueMappings, fixedTarget]);

  /** Rows that will actually be recorded (target not "ignore"). */
  const effectiveRows = useMemo(
    () => importRows.filter((r) => r.target.kind !== "ignore"),
    [importRows]
  );

  const canMatch = useMemo(() => {
    if (effectiveRows.length === 0) return false;
    return effectiveRows.some(
      (r) => r.emails.length > 0 || r.phones.length > 0 || (r.firstName && r.lastName)
    );
  }, [effectiveRows]);

  // ── Match step ──────────────────────────────────────────────────────────────

  const runMatch = useCallback(async () => {
    if (!assessment) return;
    setBusy(true);
    setError(null);
    try {
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
          })),
          activity_id: assessment.mode === "existing" ? assessment.option.activity_id : null,
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
      setMatchState({ results: json.results, decisions });
      setStep("match");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Match failed");
    } finally {
      setBusy(false);
    }
  }, [assessment, campaignId, effectiveRows]);

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

  // ── Apply (dry run + real) ──────────────────────────────────────────────────

  const buildApplyRequest = useCallback(
    (dryRun: boolean): ParticipationApplyRequest | null => {
      if (!assessment || !matchState || !source) return null;
      const rowByKey = new Map(effectiveRows.map((r) => [r.key, r]));

      const rows: ParticipationApplyRow[] = matchState.results.map((res) => {
        const decision = matchState.decisions[res.key];
        const row = rowByKey.get(res.key);
        if (!decision || !row || decision.action === "skip") {
          return { key: res.key, action: "skip" };
        }
        const rating = row.target.kind === "rating" ? row.target.rating : null;
        const binary = row.target.kind === "binary" ? row.target.value : null;
        const notes = row.rawResponse ? `AN response: ${row.rawResponse}` : null;
        if (decision.action === "match" && decision.workerId != null) {
          return {
            key: res.key,
            action: "existing",
            worker_id: decision.workerId,
            add_to_campaign: decision.addToCampaign,
            rating,
            binary_value: binary,
            notes,
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
            rating,
            binary_value: binary,
            notes,
          };
        }
        return { key: res.key, action: "skip" };
      });

      const nonRespondersPayload = nonResponders.enabled
        ? {
            enabled: true,
            rating:
              nonResponders.target.kind === "rating" ? nonResponders.target.rating : null,
            binary_value:
              nonResponders.target.kind === "binary" ? nonResponders.target.value : null,
          }
        : null;

      return {
        activity:
          assessment.mode === "existing"
            ? { mode: "existing", activity_id: assessment.option.activity_id }
            : {
                mode: "new",
                title: assessment.title,
                is_binary: assessment.isBinary,
                supporter_outcome_value: assessment.isBinary
                  ? assessment.supporterOutcomeValue
                  : null,
              },
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
        non_responders: nonRespondersPayload,
        mapping: {
          columnMap,
          responseColumn,
          valueMappings,
          fixedTarget,
          conflictPolicy,
          nonResponders: nonRespondersPayload,
        },
        rows,
        dry_run: dryRun,
      };
    },
    [
      assessment,
      matchState,
      source,
      effectiveRows,
      conflictPolicy,
      nonResponders,
      columnMap,
      responseColumn,
      valueMappings,
      fixedTarget,
    ]
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
      toast.success(`Recorded ${json.ratings_applied} participation entries`);
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
    useAnSource,
    assessment,
    setAssessment,
    columnMap,
    setColumnMap,
    responseColumn,
    selectResponseColumn,
    distinctResponseValues,
    valueMappings,
    setValueMappings,
    fixedTarget,
    setFixedTarget,
    conflictPolicy,
    setConflictPolicy,
    nonResponders,
    setNonResponders,
    importRows,
    effectiveRows,
    canMatch,
    runMatch,
    matchState,
    setDecision,
    bulkSetDecisions,
    runPreview,
    preview,
    runApply,
    result,
    reset,
  };
}

export type ParticipationImportController = ReturnType<typeof useParticipationImport>;
