"use client";

/**
 * TanStack Query hooks for the Action Network survey/form importer
 * (/api/an-surveys/*). Shapes come from src/lib/an-surveys/types.ts — the
 * one contract the routes and this client share.
 *
 * Query keys all sit under ["an-surveys", ...] so a write can invalidate the
 * whole feature with one prefix when needed.
 */

import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  API_FETCH_TIMEOUT_LLM_MS,
  API_FETCH_TIMEOUT_UPLOAD_MS,
  fetchApi,
} from "@/lib/api/fetch-api";
import type {
  AnSurveyActionsResponse,
  AnSurveyCreateRequest,
  AnSurveyDetailResponse,
  AnSurveyGenerateRequest,
  AnSurveyGenerateResponse,
  AnSurveyImport,
  AnSurveyImportConflict,
  AnSurveyImportResponse,
  AnSurveyListResponse,
  AnSurveyPatchRequest,
  AnSurveyReportResponse,
  AnSurveyReviewResponse,
  AnSurveyRowsResponse,
  AnSurveySourceKind,
} from "@/lib/an-surveys/types";

// ─── Errors ─────────────────────────────────────────────────────────────────

/** A failed /api/an-surveys call, carrying the HTTP status for UI branching. */
export class AnSurveyApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AnSurveyApiError";
    this.status = status;
  }
}

async function toError(res: Response, fallback: string): Promise<AnSurveyApiError> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  const message =
    body && typeof body.error === "string" && body.error.trim() ? body.error : fallback;
  return new AnSurveyApiError(message, res.status);
}

/**
 * A one-line, user-facing description of a failure — the route's own message
 * where it has one, with a status-based fallback so 503/502/413 always read
 * as what they are even when the body is empty.
 */
export function describeAnSurveyError(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof AnSurveyApiError) {
    switch (err.status) {
      case 503:
        return err.message || "AI not configured — ask an admin to set the AI model in Administration → Settings.";
      case 502:
        return err.message || "Upstream service failed (Action Network or the AI provider). Try again.";
      case 413:
        return err.message || "File too large — the limit is 10 MB.";
      case 403:
        return err.message || "You do not have permission to do that.";
      case 404:
        return err.message || "Not found.";
      default:
        return err.message || fallback;
    }
  }
  if (err instanceof Error) {
    if (err.name === "AbortError") return "The request timed out. Try again.";
    return err.message || fallback;
  }
  return fallback;
}

// ─── Keys ───────────────────────────────────────────────────────────────────

export const anSurveyKeys = {
  all: ["an-surveys"] as const,
  lists: () => ["an-surveys", "list"] as const,
  list: (campaignId?: number | null) =>
    ["an-surveys", "list", campaignId ?? "all"] as const,
  detail: (id: string) => ["an-surveys", "detail", id] as const,
  reports: (id: string) => ["an-surveys", "report", id] as const,
  report: (id: string, crosstabs: readonly string[], includeText: boolean) =>
    ["an-surveys", "report", id, [...crosstabs].sort().join(","), includeText ? 1 : 0] as const,
  actions: (type: AnSurveySourceKind, q: string) =>
    ["an-surveys", "an-actions", type, q] as const,
};

// ─── Queries ────────────────────────────────────────────────────────────────

export function useAnSurveyList(campaignId?: number | null) {
  return useQuery({
    queryKey: anSurveyKeys.list(campaignId),
    queryFn: async () => {
      const qs = campaignId != null ? `?campaignId=${encodeURIComponent(String(campaignId))}` : "";
      const res = await fetchApi(`/api/an-surveys${qs}`);
      if (!res.ok) throw await toError(res, "Failed to load surveys & forms");
      return res.json() as Promise<AnSurveyListResponse>;
    },
  });
}

export function useAnSurveyDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: anSurveyKeys.detail(id ?? ""),
    queryFn: async () => {
      const res = await fetchApi(`/api/an-surveys/${encodeURIComponent(id ?? "")}`);
      if (!res.ok) throw await toError(res, "Failed to load the import");
      return res.json() as Promise<AnSurveyDetailResponse>;
    },
    enabled: !!id,
  });
}

export interface AnSurveyReportOptions {
  /** Cross-tab pairs as "row_qkey:col_qkey". */
  crosstabs?: readonly string[];
  /** Populate free_text `responses` arrays (members' own words). */
  includeText?: boolean;
  enabled?: boolean;
}

export function useAnSurveyReport(id: string | null | undefined, opts: AnSurveyReportOptions = {}) {
  const crosstabs = opts.crosstabs ?? [];
  const includeText = !!opts.includeText;
  return useQuery({
    queryKey: anSurveyKeys.report(id ?? "", crosstabs, includeText),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (crosstabs.length > 0) params.set("crosstabs", crosstabs.join(","));
      params.set("includeText", includeText ? "1" : "0");
      const res = await fetchApi(
        `/api/an-surveys/${encodeURIComponent(id ?? "")}/report?${params.toString()}`
      );
      if (!res.ok) throw await toError(res, "Failed to load the report");
      return res.json() as Promise<AnSurveyReportResponse>;
    },
    enabled: !!id && (opts.enabled ?? true),
    // Toggling includeText / adding cross-tabs changes the key; keep the
    // previous aggregates on screen rather than flashing a skeleton.
    placeholderData: keepPreviousData,
  });
}

/**
 * Action Network forms/surveys the shared key can see. A 503 means the AN
 * key is not configured — callers branch on `error.status === 503` to offer
 * the "import a CSV without linking" path.
 */
export function useAnSurveyActions(type: AnSurveySourceKind, q: string, enabled = true) {
  return useQuery({
    queryKey: anSurveyKeys.actions(type, q.trim()),
    queryFn: async () => {
      const params = new URLSearchParams({ type });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetchApi(`/api/an-surveys/an-actions?${params.toString()}`);
      if (!res.ok) throw await toError(res, "Could not list Action Network actions");
      return res.json() as Promise<AnSurveyActionsResponse>;
    },
    enabled,
    staleTime: 60_000,
    retry: (count, err) => !(err instanceof AnSurveyApiError && err.status === 503) && count < 2,
  });
}

/**
 * The stored rows with identity columns — only for seeding the assessment
 * wizard (campaign-linked, non-viewer). On demand, never cached: the rows
 * are the one place members' identities travel to the browser.
 */
export async function fetchAnSurveyRows(id: string): Promise<AnSurveyRowsResponse> {
  const res = await fetchApi(`/api/an-surveys/${encodeURIComponent(id)}/rows`, {
    timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
  });
  if (!res.ok) throw await toError(res, "Failed to load the response rows");
  return res.json() as Promise<AnSurveyRowsResponse>;
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export function useCreateAnSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: AnSurveyCreateRequest) => {
      const res = await fetchApi("/api/an-surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw await toError(res, "Failed to create the import");
      const json = (await res.json()) as { success: true; import: AnSurveyImport };
      return json.import;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: anSurveyKeys.lists() });
    },
  });
}

export function usePatchAnSurvey(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: AnSurveyPatchRequest) => {
      const res = await fetchApi(`/api/an-surveys/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw await toError(res, "Failed to save changes");
      return res.json() as Promise<AnSurveyDetailResponse>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(anSurveyKeys.detail(id), data);
      void queryClient.invalidateQueries({ queryKey: anSurveyKeys.lists() });
      // Question edits change which aggregates the report shows.
      void queryClient.invalidateQueries({ queryKey: anSurveyKeys.reports(id) });
    },
  });
}

export function useDeleteAnSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetchApi(`/api/an-surveys/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw await toError(res, "Failed to delete the import");
      return res.json() as Promise<{ success: true }>;
    },
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: anSurveyKeys.detail(id) });
      queryClient.removeQueries({ queryKey: anSurveyKeys.reports(id) });
      void queryClient.invalidateQueries({ queryKey: anSurveyKeys.lists() });
    },
  });
}

/** The typed outcome of a CSV upload: success, or a header-diff 409 to confirm. */
export type ImportCsvResult =
  | { kind: "ok"; data: AnSurveyImportResponse }
  | { kind: "conflict"; conflict: AnSurveyImportConflict };

export function useImportAnSurveyCsv(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, confirm }: { file: File; confirm?: boolean }): Promise<ImportCsvResult> => {
      const formData = new FormData();
      formData.append("file", file);
      if (confirm) formData.append("confirm", "1");
      const res = await fetchApi(`/api/an-surveys/${encodeURIComponent(id)}/import`, {
        method: "POST",
        body: formData,
        timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
      });
      if (res.status === 409) {
        const conflict = (await res.json().catch(() => null)) as AnSurveyImportConflict | null;
        if (conflict && conflict.needs_confirm) return { kind: "conflict", conflict };
        throw new AnSurveyApiError(conflict?.error ?? "Upload conflict", 409);
      }
      if (!res.ok) throw await toError(res, "Upload failed");
      const data = (await res.json()) as AnSurveyImportResponse;
      return { kind: "ok", data };
    },
    onSuccess: (result) => {
      if (result.kind !== "ok") return;
      void queryClient.invalidateQueries({ queryKey: anSurveyKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: anSurveyKeys.reports(id) });
      void queryClient.invalidateQueries({ queryKey: anSurveyKeys.lists() });
    },
  });
}

export function useReviewAnSurvey(id: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await fetchApi(`/api/an-surveys/${encodeURIComponent(id)}/analyse/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
      });
      if (!res.ok) throw await toError(res, "The AI review failed");
      return res.json() as Promise<AnSurveyReviewResponse>;
    },
  });
}

export function useGenerateAnSurveyReport(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: AnSurveyGenerateRequest) => {
      const res = await fetchApi(`/api/an-surveys/${encodeURIComponent(id)}/analyse/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
      });
      if (!res.ok) throw await toError(res, "Report generation failed");
      return res.json() as Promise<AnSurveyGenerateResponse>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: anSurveyKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: anSurveyKeys.reports(id) });
      void queryClient.invalidateQueries({ queryKey: anSurveyKeys.lists() });
    },
  });
}
