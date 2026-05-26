"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, KeyRound, UserCircle, Search } from "lucide-react";
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
}

interface MobilePasswordGateProps {
  token: string;
  campaignName: string | null;
  callListName: string | null;
  /** Called once auth succeeds — parent should refresh the bootstrap. */
  onSuccess: () => void;
}

/**
 * Mobile password + identity gate. Replaces the inline `PasswordGate`
 * component formerly co-located in /call/[token]/page.tsx with a
 * mobile-first layout.
 *
 * Identity picker is searchable (server still caps the response at 20; the
 * search input lets a volunteer with a common name find themselves quickly).
 * Layout pins the primary CTA to the thumb zone and reserves the upper 40%
 * for context (campaign / list name).
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
  const [options, setOptions] = useState<IdentityOption[]>([]);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchApi(`/api/call-share/${token}/identity-options`)
      .then((res) => res.json())
      .then((body: { workers?: IdentityOption[] }) => setOptions(body.workers ?? []))
      .catch(() => undefined);
  }, [token]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => {
      const name = `${option.first_name} ${option.last_name}`.toLowerCase();
      const occ = option.occupation?.toLowerCase() ?? "";
      return name.includes(q) || occ.includes(q);
    });
  }, [options, search]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const selected =
        sessionWorkerId != null ? options.find((o) => o.worker_id === sessionWorkerId) : null;
      const label =
        sessionLabel.trim() ||
        (selected ? `${selected.first_name} ${selected.last_name}`.trim() : "");
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

  return (
    <div className={tokens.layout.mobileScreen}>
      <div className="px-5 pt-6">
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
          <div className="space-y-1.5">
            <Label htmlFor="caller-name">Your name</Label>
            <Input
              id="caller-name"
              autoComplete="name"
              value={sessionLabel}
              onChange={(event) => setSessionLabel(event.target.value)}
              placeholder="Name shown to organisers"
              className="h-12 text-base"
            />
          </div>

          {options.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="identity-search">
                Pick your worker record (optional)
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="identity-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search…"
                  className="h-11 pl-9 text-sm"
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-xl border bg-card">
                <button
                  type="button"
                  onClick={() => setSessionWorkerId(null)}
                  className={`flex w-full items-center gap-2 border-b px-3 py-2.5 text-left text-sm ${
                    sessionWorkerId == null ? "bg-primary/10 font-semibold" : ""
                  }`}
                >
                  <UserCircle className="h-4 w-4 text-muted-foreground" />
                  I am not listed here
                </button>
                {filteredOptions.map((option) => (
                  <button
                    key={option.worker_id}
                    type="button"
                    onClick={() => {
                      setSessionWorkerId(option.worker_id);
                      if (!sessionLabel.trim()) {
                        setSessionLabel(`${option.first_name} ${option.last_name}`.trim());
                      }
                    }}
                    className={`flex w-full items-start gap-2 border-b px-3 py-2.5 text-left text-sm last:border-0 ${
                      sessionWorkerId === option.worker_id ? "bg-primary/10 font-semibold" : ""
                    }`}
                  >
                    <UserCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {option.first_name} {option.last_name}
                      </span>
                      {option.occupation ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {option.occupation}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
                {filteredOptions.length === 0 ? (
                  <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                    No match — pick &quot;I am not listed here&quot; and just type your name.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="call-password">Password</Label>
            <Input
              id="call-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
            <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
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
