"use client";

/**
 * Administration → Settings → "AI models".
 *
 * Lets an admin pick which Claude model the app uses for reasoning work
 * (`ai_model_default`) and for cheap classification (`ai_model_fast`).
 * The list comes from the Anthropic Models API via /api/admin/ai-models;
 * a "Test" button sends a one-line request so a choice can be verified
 * before it is saved. Saves go through the existing PATCH
 * /api/admin/settings whitelist.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Cpu, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchApi, API_FETCH_TIMEOUT_LLM_MS } from "@/lib/api/fetch-api";
import type { AiModelsResponse } from "@/app/api/admin/ai-models/route";
import type { AiModelTestResponse } from "@/app/api/admin/ai-models/test/route";

type Purpose = "default" | "fast";

const PURPOSES: { id: Purpose; label: string; help: string }[] = [
  {
    id: "default",
    label: "Default model",
    help: "Reports, drafting, coaching, analysis — quality first.",
  },
  {
    id: "fast",
    label: "Fast model",
    help: "Cheap classification and extraction where speed matters more than nuance.",
  },
];

interface TestState {
  busy: boolean;
  result: AiModelTestResponse | null;
  error: string | null;
}

export function AiModelsCard() {
  const [data, setData] = useState<AiModelsResponse | null>(null);
  const [selection, setSelection] = useState<Record<Purpose, string>>({ default: "", fast: "" });
  const [custom, setCustom] = useState<Record<Purpose, boolean>>({ default: false, fast: false });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<Purpose, TestState>>({
    default: { busy: false, result: null, error: null },
    fast: { busy: false, result: null, error: null },
  });

  const load = useCallback(async (refresh: boolean) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetchApi(`/api/admin/ai-models${refresh ? "?refresh=1" : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load AI models");
      const payload = json as AiModelsResponse;
      setData(payload);
      setSelection({
        default: payload.resolved.default.model,
        fast: payload.resolved.fast.model,
      });
      const known = new Set(payload.models.map((m) => m.id));
      setCustom({
        default: !known.has(payload.resolved.default.model),
        fast: !known.has(payload.resolved.fast.model),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI models");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetchApi("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ai_model_default: selection.default.trim(),
          ai_model_fast: selection.fast.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error(err.error ?? "Save failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      void load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async (purpose: Purpose) => {
    const model = selection[purpose].trim();
    setTests((t) => ({ ...t, [purpose]: { busy: true, result: null, error: null } }));
    try {
      const res = await fetchApi("/api/admin/ai-models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
        timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Test failed");
      setTests((t) => ({
        ...t,
        [purpose]: { busy: false, result: json as AiModelTestResponse, error: null },
      }));
    } catch (err) {
      setTests((t) => ({
        ...t,
        [purpose]: {
          busy: false,
          result: null,
          error: err instanceof Error ? err.message : "Test failed",
        },
      }));
    }
  };

  const models = data?.models ?? [];
  const listUnavailable = !!data?.list_error || models.length === 0;

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cpu className="h-4 w-4" />
          AI models
        </CardTitle>
        <CardDescription>
          Which Claude model the app calls. Changes apply within a minute, no deploy needed.
          The list comes from the Anthropic API for the configured key.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {data?.list_error && (
          <div className="rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Could not fetch the model list ({data.list_error}). You can still type a model id.
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {PURPOSES.map((p) => {
            const value = selection[p.id];
            const resolved = data?.resolved[p.id];
            const test = tests[p.id];
            const useCustom = custom[p.id] || listUnavailable;
            return (
              <div key={p.id} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>{p.label}</Label>
                  {resolved && (
                    <Badge variant={resolved.source === "setting" ? "secondary" : "outline"}>
                      {resolved.source === "setting" ? "saved" : "fallback"}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{p.help}</p>

                {useCustom ? (
                  <Input
                    value={value}
                    onChange={(e) => setSelection((s) => ({ ...s, [p.id]: e.target.value }))}
                    placeholder={loading ? "Loading…" : "claude-…"}
                    disabled={loading}
                  />
                ) : (
                  <Select
                    value={value}
                    onValueChange={(v) => setSelection((s) => ({ ...s, [p.id]: v }))}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loading ? "Loading…" : "Select model"} />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.display_name} <span className="text-muted-foreground">({m.id})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {custom[p.id] && !listUnavailable && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    The saved id is not in the current model list.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {!listUnavailable && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCustom((c) => ({ ...c, [p.id]: !c[p.id] }))}
                      disabled={loading}
                    >
                      {custom[p.id] ? "Pick from list" : "Type an id"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => runTest(p.id)}
                    disabled={loading || test.busy || !value.trim()}
                  >
                    {test.busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                    Test
                  </Button>
                  {test.result && (
                    <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                      <Check className="h-3.5 w-3.5" />
                      {test.result.model} replied in {test.result.latency_ms} ms
                    </span>
                  )}
                  {test.error && (
                    <span className="text-xs text-destructive">{test.error}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleSave} disabled={loading || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save AI models
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => load(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh list
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-emerald-700 dark:text-emerald-300">
              <Check className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
