"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchApi } from "@/lib/api/fetch-api";
import { dialerTelemetry, tokenHint } from "@/lib/phone/telemetry";

export interface IdentityOption {
  worker_id: number;
  first_name: string;
  last_name: string;
  occupation: string | null;
  designated?: true;
}

interface IdentityOptionsResponse {
  designated?: IdentityOption;
  workers: IdentityOption[];
}

export type IdentityMode =
  | { kind: "loading" }
  | { kind: "designated"; worker: IdentityOption }
  | { kind: "search" };

const STORAGE_KEY_PREFIX = "cs_last_identity_";

function storageKey(token: string) {
  return `${STORAGE_KEY_PREFIX}${token.slice(0, 16)}`;
}

function saveIdentityToStorage(token: string, worker: IdentityOption) {
  try {
    localStorage.setItem(storageKey(token), JSON.stringify(worker));
  } catch {
    // Ignore storage errors (private browsing, storage full, etc.)
  }
}

function loadIdentityFromStorage(token: string): IdentityOption | null {
  try {
    const raw = localStorage.getItem(storageKey(token));
    if (!raw) return null;
    return JSON.parse(raw) as IdentityOption;
  } catch {
    return null;
  }
}

export interface UsePasswordGateResult {
  password: string;
  setPassword: (value: string) => void;
  sessionLabel: string;
  setSessionLabel: (value: string) => void;
  sessionWorkerId: number | null;
  identityMode: IdentityMode;
  setIdentityMode: (mode: IdentityMode) => void;
  searchQ: string;
  setSearchQ: (value: string) => void;
  searchResults: IdentityOption[];
  searchLoading: boolean;
  submitting: boolean;
  error: string | null;
  isDesignated: boolean;
  isRemembered: boolean;
  /** Select a worker from the search results / designated greeting. */
  selectWorker: (worker: IdentityOption) => void;
  /** Clear the selected worker and reset the search field. */
  clearWorker: () => void;
  /** Name-field change handler — typing a custom name clears any selection. */
  onNameInputChange: (value: string) => void;
  /** Submit the password + identity to the share-token auth endpoint. */
  submit: () => Promise<void>;
}

/**
 * Headless password + identity gate logic for the shareable dialer.
 *
 * Owns identity-options loading (designated / remembered / search), debounced
 * server-side search, the auth POST, lockout/attempt error mapping, and
 * localStorage persistence of the chosen identity. Both the mobile and desktop
 * gate UIs render their own layout on top of this single source of truth.
 */
export function usePasswordGate(token: string, onSuccess: () => void): UsePasswordGateResult {
  const [password, setPassword] = useState("");
  const [sessionLabel, setSessionLabel] = useState("");
  const [sessionWorkerId, setSessionWorkerId] = useState<number | null>(null);
  const [identityMode, setIdentityMode] = useState<IdentityMode>({ kind: "loading" });
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<IdentityOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load identity options on mount ──────────────────────────────────────────
  useEffect(() => {
    void fetchApi(`/api/call-share/${token}/identity-options`)
      .then((res) => res.json())
      .then((body: IdentityOptionsResponse) => {
        if (body.designated) {
          setIdentityMode({ kind: "designated", worker: body.designated });
          setSessionLabel((prev) =>
            prev ? prev : `${body.designated!.first_name} ${body.designated!.last_name}`.trim(),
          );
          setSessionWorkerId(body.designated.worker_id);
        } else {
          const remembered = loadIdentityFromStorage(token);
          if (remembered) {
            setIdentityMode({
              kind: "designated",
              worker: { ...remembered, designated: undefined },
            });
            setSessionLabel(`${remembered.first_name} ${remembered.last_name}`.trim());
            setSessionWorkerId(remembered.worker_id);
          } else {
            setIdentityMode({ kind: "search" });
          }
        }
      })
      .catch(() => setIdentityMode({ kind: "search" }));
  }, [token]);

  // ── Debounced search ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (identityMode.kind !== "search") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchQ.trim().length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    debounceRef.current = setTimeout(() => {
      void fetchApi(
        `/api/call-share/${token}/identity-options?q=${encodeURIComponent(searchQ.trim())}`,
      )
        .then((res) => res.json())
        .then((body: IdentityOptionsResponse) => {
          setSearchResults(body.workers ?? []);
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 250);
  }, [searchQ, token, identityMode.kind]);

  const selectWorker = useCallback((worker: IdentityOption) => {
    setSessionWorkerId(worker.worker_id);
    setSessionLabel(`${worker.first_name} ${worker.last_name}`.trim());
    setSearchQ("");
    setSearchResults([]);
  }, []);

  const clearWorker = useCallback(() => {
    setSessionWorkerId(null);
    setSessionLabel("");
    setSearchQ("");
    setSearchResults([]);
  }, []);

  const onNameInputChange = useCallback(
    (value: string) => {
      setSessionLabel(value);
      if (sessionWorkerId != null) setSessionWorkerId(null);
    },
    [sessionWorkerId],
  );

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const label = sessionLabel.trim();
      if (!label) {
        setError("Enter your name before starting.");
        setSubmitting(false);
        return;
      }
      const res = await fetchApi(`/api/call-share/${token}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          sessionLabel: label,
          sessionWorkerId: sessionWorkerId ?? undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        attempts_remaining?: number;
        locked_until?: string;
        error?: string;
      };
      if (res.ok && body.ok) {
        dialerTelemetry.passwordAttempted({ success: true });
        dialerTelemetry.passwordSuccess({
          token_hint: tokenHint(token),
          worker_id: sessionWorkerId,
        });
        if (sessionWorkerId) {
          if (identityMode.kind === "designated") {
            saveIdentityToStorage(token, identityMode.worker);
          } else {
            saveIdentityToStorage(token, {
              worker_id: sessionWorkerId,
              first_name: label.split(" ")[0] ?? label,
              last_name: label.split(" ").slice(1).join(" ") ?? "",
              occupation: null,
            });
          }
        }
        onSuccess();
        return;
      }
      dialerTelemetry.passwordAttempted({ success: false });
      if (res.status === 423) {
        setError(
          `Too many failed attempts. Try again after ${
            body.locked_until ? new Date(body.locked_until).toLocaleString() : "the lockout ends"
          }.`,
        );
      } else if (res.status === 401 && body.attempts_remaining != null) {
        setError(`Incorrect password. ${body.attempts_remaining} attempts remaining.`);
      } else {
        setError(body.error ?? "Sign-in failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  }, [identityMode, onSuccess, password, sessionLabel, sessionWorkerId, token]);

  const isDesignated =
    identityMode.kind === "designated" &&
    (identityMode.worker as IdentityOption & { designated?: true }).designated === true;
  const isRemembered =
    identityMode.kind === "designated" &&
    !(identityMode.worker as IdentityOption & { designated?: true }).designated;

  return {
    password,
    setPassword,
    sessionLabel,
    setSessionLabel,
    sessionWorkerId,
    identityMode,
    setIdentityMode,
    searchQ,
    setSearchQ,
    searchResults,
    searchLoading,
    submitting,
    error,
    isDesignated,
    isRemembered,
    selectWorker,
    clearWorker,
    onNameInputChange,
    submit,
  };
}
