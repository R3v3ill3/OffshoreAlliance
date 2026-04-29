"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronDown,
  Loader2,
  MessageCircle,
  Send,
  Check,
  X,
  Sparkles,
} from "lucide-react";
import {
  fetchApi,
  API_FETCH_TIMEOUT_STREAM_MS,
} from "@/lib/api/fetch-api";
import type {
  CompanyPlaybookMove,
  InformationGap,
  LeverageAndMaths,
  SituationAnalysisDraft,
  WorkforcePopulation,
} from "@/lib/situation-analysis/types";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface ProposedUpdates {
  strategic_context_summary?: string | null;
  company_playbook?: CompanyPlaybookMove[] | null;
  workforce_populations?: WorkforcePopulation[] | null;
  leverage_and_maths?: LeverageAndMaths | null;
  information_gaps?: InformationGap[] | null;
}

interface AiChatPanelProps {
  campaignId: number;
  draft: SituationAnalysisDraft;
  onApply: (next: SituationAnalysisDraft) => void;
}

/**
 * Phase 3 multi-turn chat. Reads the streaming NDJSON response from
 * /api/situation-analysis/chat and applies proposed_updates patches with
 * explicit accept/reject controls (mirrors AiAssistPanel's pattern).
 */
export function AiChatPanel({ campaignId, draft, onApply }: AiChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [pendingUpdates, setPendingUpdates] = useState<ProposedUpdates | null>(
    null
  );
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendTurn = async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;
    setError(null);
    setPendingUpdates(null);
    const nextTurns: ChatTurn[] = [...turns, { role: "user", content: trimmed }];
    setTurns(nextTurns);
    setInput("");
    setStreaming(true);
    setStreamingText("");

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetchApi("/api/situation-analysis/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaignId,
          draft,
          messages: nextTurns,
        }),
        signal: ac.signal,
        timeoutMs: API_FETCH_TIMEOUT_STREAM_MS,
      });
      if (!res.ok || !res.body) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(payload.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let proposedUpdates: ProposedUpdates | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let payload: {
            type: string;
            text?: string;
            natural_language?: string;
            proposed_updates?: ProposedUpdates | null;
            message?: string;
          };
          try {
            payload = JSON.parse(line);
          } catch {
            continue;
          }
          if (payload.type === "delta" && typeof payload.text === "string") {
            assistantText += payload.text;
            // Strip the proposed-updates marker + everything after from the
            // streaming display so the user sees clean prose.
            const markerIdx = assistantText.indexOf("---PROPOSED-UPDATES---");
            const visible =
              markerIdx === -1 ? assistantText : assistantText.slice(0, markerIdx);
            setStreamingText(visible);
          } else if (payload.type === "complete") {
            assistantText = payload.natural_language ?? assistantText;
            proposedUpdates = payload.proposed_updates ?? null;
          } else if (payload.type === "error") {
            throw new Error(payload.message ?? "Streaming error");
          }
        }
      }

      setTurns([...nextTurns, { role: "assistant", content: assistantText.trim() }]);
      setStreamingText("");
      setPendingUpdates(proposedUpdates);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Chat failed");
      setStreamingText("");
      // Roll the user's turn back so they can edit + retry.
      setTurns(turns);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  };

  const acceptUpdates = () => {
    if (!pendingUpdates) return;
    const next: SituationAnalysisDraft = { ...draft };
    if (typeof pendingUpdates.strategic_context_summary === "string") {
      next.strategic_context_summary = pendingUpdates.strategic_context_summary;
    }
    if (Array.isArray(pendingUpdates.company_playbook)) {
      next.company_playbook = pendingUpdates.company_playbook;
    }
    if (Array.isArray(pendingUpdates.workforce_populations)) {
      next.workforce_populations = pendingUpdates.workforce_populations;
    }
    if (
      pendingUpdates.leverage_and_maths &&
      typeof pendingUpdates.leverage_and_maths === "object"
    ) {
      next.leverage_and_maths = pendingUpdates.leverage_and_maths;
    }
    if (Array.isArray(pendingUpdates.information_gaps)) {
      next.information_gaps = pendingUpdates.information_gaps;
    }
    onApply(next);
    setPendingUpdates(null);
  };

  const rejectUpdates = () => setPendingUpdates(null);

  const updateSummary = pendingUpdates
    ? summariseUpdates(pendingUpdates)
    : null;

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setOpen((s) => !s)}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Chat with the strategist (optional)
            </CardTitle>
            <CardDescription>
              Ask follow-up questions about the campaign — workforce
              populations, leverage timing, what to inoculate against. Each
              turn may propose updates to the situation analysis; nothing
              writes until you accept.
            </CardDescription>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          {turns.length === 0 && !streaming && (
            <p className="text-sm text-muted-foreground italic">
              No conversation yet. Try: &ldquo;Walk me through what the
              employer&apos;s likely playbook looks like, and what we should
              inoculate against.&rdquo;
            </p>
          )}

          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {turns.map((turn, i) => (
              <div
                key={i}
                className={`rounded-md border p-3 text-sm whitespace-pre-wrap ${
                  turn.role === "user"
                    ? "bg-muted/30 ml-6"
                    : "bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-200/60 dark:border-emerald-900/40 mr-6"
                }`}
              >
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  {turn.role === "user" ? "You" : "Strategist"}
                </p>
                {turn.content}
              </div>
            ))}
            {streaming && (
              <div className="rounded-md border p-3 text-sm whitespace-pre-wrap bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-200/60 dark:border-emerald-900/40 mr-6">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-2">
                  Strategist <Loader2 className="h-3 w-3 animate-spin" />
                </p>
                {streamingText || "…"}
              </div>
            )}
          </div>

          {pendingUpdates && updateSummary && (
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="gap-1">
                    <Sparkles className="h-3 w-3" />
                    Proposed updates
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {updateSummary}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={rejectUpdates}>
                    <X className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                  <Button size="sm" onClick={acceptUpdates}>
                    <Check className="h-4 w-4 mr-1" />
                    Accept all
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Review the strategist&apos;s reply above; accepted patches
                replace the corresponding sections of your situation analysis.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-3 text-sm text-red-900 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Textarea
              rows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void sendTurn();
                }
              }}
              placeholder="Ask the strategist a question. Cmd/Ctrl+Enter to send."
              disabled={streaming}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                The strategist uses only OA data + your survey. Information
                gaps surface things the model won&apos;t invent.
              </p>
              <div className="flex gap-2">
                {streaming && (
                  <Button variant="outline" size="sm" onClick={cancel}>
                    Cancel
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => void sendTurn()}
                  disabled={streaming || !input.trim()}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function summariseUpdates(updates: ProposedUpdates): string | null {
  const parts: string[] = [];
  if (typeof updates.strategic_context_summary === "string") parts.push("summary");
  if (Array.isArray(updates.company_playbook)) {
    parts.push(`${updates.company_playbook.length} playbook moves`);
  }
  if (Array.isArray(updates.workforce_populations)) {
    parts.push(`${updates.workforce_populations.length} populations`);
  }
  if (
    updates.leverage_and_maths &&
    typeof updates.leverage_and_maths === "object"
  ) {
    parts.push("leverage");
  }
  if (Array.isArray(updates.information_gaps)) {
    parts.push(`${updates.information_gaps.length} gaps`);
  }
  if (parts.length === 0) return null;
  return parts.join(" · ");
}
