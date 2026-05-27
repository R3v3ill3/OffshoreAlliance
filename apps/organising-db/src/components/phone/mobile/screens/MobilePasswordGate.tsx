"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Search, UserCircle, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchApi } from "@/lib/api/fetch-api";
import { tokens } from "@/lib/ui/dialer-tokens";
import { dialerTelemetry, tokenHint } from "@/lib/phone/telemetry";

interface IdentityOption {
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

interface MobilePasswordGateProps {
  token: string;
  campaignName: string | null;
  callListName: string | null;
  /** Called once auth succeeds — parent should refresh the bootstrap. */
  onSuccess: () => void;
}

type IdentityMode =
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

/**
 * Mobile password + identity gate.
 *
 * Identity has three states:
 *  1. `designated` — the token was issued specifically for this worker; show
 *     a "Welcome, [Name] — is that you?" confirmation and skip the search.
 *  2. `search`  — debounced server-side search (≥2 chars) plus a "not listed"
 *     free-text fallback.  Also shown when the caller clicks "Not me" on a
 *     designated token.
 *  3. `loading` — transient while identity-options loads.
 *
 * The selected identity is also persisted to localStorage so repeat callers
 * are pre-filled on their next visit.
 */
export function MobilePasswordGate({
  token,
  campaignName,
  callListName,
  onSuccess,
}: MobilePasswordGateProps) {
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

  // ── Load identity options on mount ────────────────────────────────────────
  useEffect(() => {
    void fetchApi(`/api/call-share/${token}/identity-options`)
      .then((res) => res.json())
      .then((body: IdentityOptionsResponse) => {
        if (body.designated) {
          setIdentityMode({ kind: "designated", worker: body.designated });
          // Pre-fill label from designated worker; won't override if user already typed
          setSessionLabel((prev) =>
            prev
              ? prev
              : `${body.designated!.first_name} ${body.designated!.last_name}`.trim(),
          );
          setSessionWorkerId(body.designated.worker_id);
        } else {
          // Check localStorage for a previous session on this token
          const remembered = loadIdentityFromStorage(token);
          if (remembered) {
            setIdentityMode({ kind: "designated", worker: { ...remembered, designated: undefined } });
            setSessionLabel(`${remembered.first_name} ${remembered.last_name}`.trim());
            setSessionWorkerId(remembered.worker_id);
          } else {
            setIdentityMode({ kind: "search" });
          }
        }
      })
      .catch(() => setIdentityMode({ kind: "search" }));
  }, [token]);

  // ── Debounced search ───────────────────────────────────────────────────────
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

  function selectWorker(worker: IdentityOption) {
    setSessionWorkerId(worker.worker_id);
    setSessionLabel(`${worker.first_name} ${worker.last_name}`.trim());
    setSearchQ("");
    setSearchResults([]);
  }

  function clearWorker() {
    setSessionWorkerId(null);
    setSessionLabel("");
    setSearchQ("");
    setSearchResults([]);
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function submit() {
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
        // Persist identity for next time
        if (sessionWorkerId) {
          const workerForStorage: IdentityOption = {
            worker_id: sessionWorkerId,
            first_name: label.split(" ")[0] ?? label,
            last_name: label.split(" ").slice(1).join(" ") ?? "",
            occupation: null,
          };
          // Use the richer designated record if available
          if (identityMode.kind === "designated") {
            saveIdentityToStorage(token, identityMode.worker);
          } else {
            saveIdentityToStorage(token, workerForStorage);
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
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const isDesignated =
    identityMode.kind === "designated" &&
    (identityMode.worker as IdentityOption & { designated?: true }).designated === true;
  const isRemembered =
    identityMode.kind === "designated" &&
    !(identityMode.worker as IdentityOption & { designated?: true }).designated;

  return (
    <div className={tokens.layout.mobileScreen}>
      <div className="px-5 pt-6">
        {/* ── Header ── */}
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className={tokens.type.hero}>Start calling</h1>
            <p className="text-sm text-muted-foreground">
              {campaignName ? campaignName : "Phone calling action"}
              {callListName ? ` · ${callListName}` : ""}
            </p>
          </div>
        </div>

        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {/* ── Identity section ── */}
          <div className="space-y-2">
            <Label>Who are you?</Label>

            {identityMode.kind === "loading" ? (
              <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                Loading…
              </div>
            ) : identityMode.kind === "designated" ? (
              /* ── Designated / remembered greeting ── */
              <div className="rounded-xl border bg-card px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {isDesignated ? (
                      <UserCheck className="h-5 w-5" />
                    ) : (
                      <UserCircle className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {isDesignated ? "This link was created for" : "Welcome back,"}
                    </p>
                    <p className="truncate text-base font-bold text-foreground">
                      {identityMode.worker.first_name} {identityMode.worker.last_name}
                    </p>
                    {identityMode.worker.occupation ? (
                      <p className="text-xs text-muted-foreground">
                        {identityMode.worker.occupation}
                      </p>
                    ) : null}
                    {isRemembered ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        (remembered from your last session)
                      </p>
                    ) : null}
                  </div>
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearWorker();
                    setIdentityMode({ kind: "search" });
                  }}
                  className="mt-2 w-full rounded-lg bg-muted/50 py-1.5 text-center text-xs text-muted-foreground hover:bg-muted"
                >
                  {isDesignated ? "Not me — search instead" : "Not me"}
                </button>
              </div>
            ) : (
              /* ── Search mode ── */
              <div className="space-y-1.5">
                {/* Worker selected from search */}
                {sessionWorkerId != null ? (
                  <div className="flex items-center gap-2 rounded-xl border bg-primary/5 px-3 py-2.5 text-sm">
                    <UserCheck className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate font-medium">{sessionLabel}</span>
                    <button
                      type="button"
                      onClick={clearWorker}
                      className="shrink-0 text-xs text-muted-foreground underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      {searchLoading ? (
                        <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none" />
                      ) : null}
                      <Input
                        value={searchQ}
                        onChange={(e) => setSearchQ(e.target.value)}
                        placeholder="Search by name…"
                        className="h-11 pl-9 pr-9 text-sm"
                        autoComplete="off"
                      />
                    </div>
                    {searchResults.length > 0 ? (
                      <div className="max-h-44 overflow-y-auto rounded-xl border bg-card">
                        {searchResults.map((opt) => (
                          <button
                            key={opt.worker_id}
                            type="button"
                            onClick={() => selectWorker(opt)}
                            className="flex w-full items-start gap-2 border-b px-3 py-2.5 text-left text-sm last:border-0 hover:bg-accent"
                          >
                            <UserCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">
                                {opt.first_name} {opt.last_name}
                              </span>
                              {opt.occupation ? (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {opt.occupation}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : searchQ.trim().length >= 2 && !searchLoading ? (
                      <p className="rounded-lg bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
                        No match — type your name below instead.
                      </p>
                    ) : searchQ.trim().length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Type at least 2 characters to search.
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Your name field (always visible; pre-filled from selection) ── */}
          <div className="space-y-1.5">
            <Label htmlFor="caller-name">
              {identityMode.kind === "search" && sessionWorkerId == null
                ? "Your name (if not listed above)"
                : "Your name"}
            </Label>
            <Input
              id="caller-name"
              autoComplete="name"
              value={sessionLabel}
              onChange={(e) => {
                setSessionLabel(e.target.value);
                // Typing a custom name clears any selected worker
                if (sessionWorkerId != null) setSessionWorkerId(null);
              }}
              placeholder="Name shown to organisers"
              className="h-12 text-base"
            />
          </div>

          {/* ── Password ── */}
          <div className="space-y-1.5">
            <Label htmlFor="call-password">Password</Label>
            <Input
              id="call-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 text-base"
            />
          </div>

          {error ? (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
      </div>

      <div className={tokens.layout.mobileActionBar}>
        <Button
          type="button"
          className={tokens.buttons.actionPrimary}
          disabled={submitting || !password}
          onClick={() => void submit()}
        >
          {submitting ? (
            <Loader2
              className="h-5 w-5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          )}
          Start calling
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          Your name is shown to organisers in the live action dashboard.
        </p>
      </div>
    </div>
  );
}
