"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchApi } from "@/lib/api/fetch-api";
import { CallSessionView, type CallSessionDataSource } from "@/components/phone/CallSessionView";
import type { CallListItemWithWorker, RecordCallAttemptRequest } from "@/types/planner-types";

type GateInfo = {
  campaign_name: string | null;
  call_list_name: string | null;
};

type IdentityOption = {
  worker_id: number;
  first_name: string;
  last_name: string;
  occupation: string | null;
};

type PageState =
  | { kind: "loading" }
  | { kind: "password_required"; gate: GateInfo }
  | { kind: "ready"; bootstrap: CallSessionDataSource["bootstrap"]; caller: CallSessionDataSource["caller"] }
  | { kind: "error"; message: string };

export default function CallSharePage() {
  const params = useParams();
  const token = params?.token as string;
  const [state, setState] = useState<PageState>({ kind: "loading" });

  const loadBootstrap = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetchApi(`/api/call-share/${token}`);
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setState({ kind: "password_required", gate: body as GateInfo });
        return;
      }
      if (!res.ok) {
        setState({ kind: "error", message: (body as { error?: string }).error ?? "Failed to load call list" });
        return;
      }
      const payload = body as {
        campaign: { campaign_id: number; name: string };
        call_list: CallSessionDataSource["bootstrap"]["list"];
        linkedScripts: CallSessionDataSource["bootstrap"]["linkedScripts"];
        outcome_definitions: CallSessionDataSource["bootstrap"]["outcomeDefinitions"];
        cta_ambitions: CallSessionDataSource["bootstrap"]["ctaAmbitions"];
        script_variable_context: Record<string, string | undefined>;
        caller: CallSessionDataSource["caller"];
      };
      setState({
        kind: "ready",
        bootstrap: {
          campaignId: payload.campaign.campaign_id,
          list: payload.call_list,
          linkedScripts: payload.linkedScripts ?? [],
          outcomeDefinitions: payload.outcome_definitions ?? [],
          ctaAmbitions: payload.cta_ambitions ?? [],
          scriptContext: payload.script_variable_context ?? {},
        },
        caller: payload.caller,
      });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Failed to load" });
    }
  }, [token]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void loadBootstrap();
    });
  }, [loadBootstrap]);

  const dataSource = useMemo<CallSessionDataSource | null>(() => {
    if (state.kind !== "ready") return null;
    return {
      bootstrap: state.bootstrap,
      caller: state.caller,
      canEditWorker: false,
      canCreateTaskList: false,
      onLogout: () => setState({ kind: "password_required", gate: { campaign_name: null, call_list_name: state.bootstrap.list.name } }),
      fetchNext: async () => {
        const res = await fetchApi(`/api/call-share/${token}/next`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error ?? "Failed to get next contact");
        if ((body as { done?: boolean }).done) return null;
        return body as CallListItemWithWorker;
      },
      recordAttempt: async (req: RecordCallAttemptRequest) => {
        const res = await fetchApi(`/api/call-share/${token}/attempt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error ?? "Failed to record attempt");
        return body as { attempt_id: number };
      },
      releaseClaim: async (itemId: number) => {
        const body = JSON.stringify({ item_id: itemId });
        if (navigator.sendBeacon) {
          const sent = navigator.sendBeacon(`/api/call-share/${token}/release`, body);
          if (sent) return;
        }
        await fetchApi(`/api/call-share/${token}/release`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
      },
    };
  }, [state, token]);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state.kind === "password_required") {
    return <PasswordGate token={token} gate={state.gate} onSuccess={() => void loadBootstrap()} />;
  }

  if (state.kind === "error") {
    return <p className="p-8 text-center text-destructive">{state.message}</p>;
  }

  return dataSource ? <CallSessionView dataSource={dataSource} /> : null;
}

function PasswordGate({
  token,
  gate,
  onSuccess,
}: {
  token: string;
  gate: GateInfo;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState("");
  const [sessionLabel, setSessionLabel] = useState("");
  const [sessionWorkerId, setSessionWorkerId] = useState<string>("");
  const [options, setOptions] = useState<IdentityOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchApi(`/api/call-share/${token}/identity-options`)
      .then((res) => res.json())
      .then((body: { workers?: IdentityOption[] }) => setOptions(body.workers ?? []))
      .catch(() => undefined);
  }, [token]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const selectedWorkerId = sessionWorkerId ? Number(sessionWorkerId) : undefined;
      const selected = selectedWorkerId
        ? options.find((option) => option.worker_id === selectedWorkerId)
        : null;
      const label = sessionLabel.trim()
        || (selected ? `${selected.first_name} ${selected.last_name}`.trim() : "");
      if (!label) {
        setError("Enter your name before starting.");
        return;
      }
      const res = await fetchApi(`/api/call-share/${token}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          sessionLabel: label,
          sessionWorkerId: selectedWorkerId,
        }),
      });
      const body = await res.json().catch(() => ({})) as {
        ok?: boolean;
        attempts_remaining?: number;
        locked_until?: string;
        error?: string;
      };
      if (res.ok && body.ok) {
        onSuccess();
        return;
      }
      if (res.status === 423) {
        setError(`Too many failed attempts. Try again after ${body.locked_until ? new Date(body.locked_until).toLocaleString() : "the lockout ends"}.`);
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
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Start calling</CardTitle>
          <CardDescription>
            {gate.campaign_name ? `${gate.campaign_name}${gate.call_list_name ? ` · ${gate.call_list_name}` : ""}` : "Enter the password shared with your link."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="caller-name">Your name</Label>
            <Input
              id="caller-name"
              value={sessionLabel}
              onChange={(event) => setSessionLabel(event.target.value)}
              placeholder="Name shown to organisers"
            />
          </div>
          {options.length > 0 ? (
            <div className="space-y-1">
              <Label>Pick your worker record (optional)</Label>
              <Select value={sessionWorkerId || "__none__"} onValueChange={(value) => setSessionWorkerId(value === "__none__" ? "" : value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">I am not listed here</SelectItem>
                  {options.map((option) => (
                    <SelectItem key={option.worker_id} value={String(option.worker_id)}>
                      {option.first_name} {option.last_name}
                      {option.occupation ? ` · ${option.occupation}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="call-password">Password</Label>
            <Input
              id="call-password"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="w-full" disabled={submitting || !password} onClick={() => void submit()}>
            {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Start calling
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
