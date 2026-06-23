"use client";

import { CheckCircle2, KeyRound, Loader2, Search, UserCheck, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePasswordGate } from "@/lib/phone/session/use-password-gate";

interface DesktopGateProps {
  token: string;
  campaignName: string | null;
  callListName: string | null;
  /** Called once auth succeeds — parent should refresh the bootstrap. */
  onSuccess: () => void;
}

/**
 * Desktop password + identity gate. Centred card layout backed by the shared
 * `usePasswordGate` hook (same logic as the mobile gate: designated /
 * remembered / search identity, debounced server search, lockout handling).
 */
export function DesktopGate({ token, campaignName, callListName, onSuccess }: DesktopGateProps) {
  const {
    password,
    setPassword,
    sessionLabel,
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
  } = usePasswordGate(token, onSuccess);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-muted/20 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold leading-tight tracking-tight">Start calling</h1>
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
              <div className="rounded-xl border bg-background px-4 py-3">
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
              <div className="space-y-1.5">
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
                      <div className="max-h-52 overflow-y-auto rounded-xl border bg-background">
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

          {/* ── Your name field ── */}
          <div className="space-y-1.5">
            <Label htmlFor="desktop-caller-name">
              {identityMode.kind === "search" && sessionWorkerId == null
                ? "Your name (if not listed above)"
                : "Your name"}
            </Label>
            <Input
              id="desktop-caller-name"
              autoComplete="name"
              value={sessionLabel}
              onChange={(e) => onNameInputChange(e.target.value)}
              placeholder="Name shown to organisers"
              className="h-11"
            />
          </div>

          {/* ── Password ── */}
          <div className="space-y-1.5">
            <Label htmlFor="desktop-call-password">Password</Label>
            <Input
              id="desktop-call-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
            />
          </div>

          {error ? (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="h-11 w-full gap-2" disabled={submitting || !password}>
            {submitting ? (
              <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            )}
            Start calling
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Your name is shown to organisers in the live action dashboard.
          </p>
        </form>
      </div>
    </div>
  );
}
