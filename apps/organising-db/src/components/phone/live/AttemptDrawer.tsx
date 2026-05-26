"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  X,
  MessageCircle,
  ShieldAlert,
  Flame,
  Star,
  ClipboardCheck,
  RotateCcw,
  ShieldOff,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { fetchApi } from "@/lib/api/fetch-api";

interface AttemptRow {
  attempt_id: number;
  list_item_id: number;
  started_at: string;
  duration_seconds: number | null;
  dial_disposition: string;
  call_disposition: string | null;
  outcome_classification: string | null;
  support_level_assessed: string | null;
  overall_notes: string | null;
  callback_datetime: string | null;
  caller_user_id: string | null;
  caller_session_label: string | null;
  share_token_id: number | null;
  list_id: number | null;
  list_name: string | null;
  worker_id: number | null;
  worker_name: string | null;
  objections: { objection_id: number | null; custom_label: string | null; outcome: string | null; notes: string | null }[];
  issues: { issue_label: string; heat: number; notes: string | null }[];
  cta_ratings: { cta_ambition_id: number | null; rating: number | null; binary_value: string | null; notes: string | null }[];
  assessment_ratings: { activity_id: number; rating: number | null; notes: string | null }[];
}

interface AttemptDrawerProps {
  campaignId: string;
  filter:
    | { kind: "outcome"; outcomeClassification: string; label: string }
    | { kind: "caller"; callerSessionLabel: string; label: string }
    | { kind: "token"; shareTokenId: number; label: string };
  onClose: () => void;
}

async function postRealloc(
  campaignId: string,
  listId: number,
  itemId: number,
  action: "requeue" | "exclude_from_share" | "include_in_share",
): Promise<void> {
  const res = await fetchApi(
    `/api/campaigns/${campaignId}/call-lists/${listId}/items/${itemId}/realloc`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? "Failed");
  }
}

/**
 * Bottom-sheet drill-down listing attempts that match a single filter
 * (outcome bucket, caller, or share token). Used as the next-level surface
 * after a rollup tile, caller tile, or token panel is tapped.
 */
export function AttemptDrawer({ campaignId, filter, onClose }: AttemptDrawerProps) {
  const [rows, setRows] = useState<AttemptRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AttemptRow | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filter.kind === "outcome") params.set("outcome_classification", filter.outcomeClassification);
    else if (filter.kind === "caller") params.set("caller_session_label", filter.callerSessionLabel);
    else if (filter.kind === "token") params.set("share_token_id", String(filter.shareTokenId));
    params.set("limit", "100");

    void (async () => {
      try {
        const res = await fetchApi(`/api/campaigns/${campaignId}/phone/attempts?${params}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error ?? "Failed to load");
        setRows((body as { attempts: AttemptRow[] }).attempts);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load attempts");
      }
    })();
  }, [campaignId, filter]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex bg-black/40"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="ml-auto flex h-full w-full max-w-xl flex-col bg-background shadow-2xl">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Attempts · {filter.kind}
            </p>
            <h3 className="text-base font-semibold">{filter.label}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {error ? (
            <p className="m-4 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-800">{error}</p>
          ) : rows == null ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="m-4 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              No attempts match this filter in the last 24 hours.
            </p>
          ) : (
            <ol className="divide-y">
              {rows.map((row) => (
                <li key={row.attempt_id}>
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    className="w-full px-4 py-3 text-left transition hover:bg-muted/40"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium text-sm">
                        {row.worker_name ?? `Worker #${row.worker_id ?? "?"}`}
                      </p>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(row.started_at).toLocaleString("en-AU", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                      <span>{row.list_name ?? `List #${row.list_id ?? "?"}`}</span>
                      <span>·</span>
                      <span>{row.caller_session_label ?? "Staff"}</span>
                      <span>·</span>
                      <span>{row.dial_disposition.replace(/_/g, " ")}</span>
                      {row.outcome_classification ? (
                        <>
                          <span>·</span>
                          <span className="font-medium text-foreground">
                            {row.outcome_classification.replace(/_/g, " ")}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>

        {selected ? (
          <AttemptDetailPanel
            campaignId={campaignId}
            row={selected}
            onClose={() => setSelected(null)}
          />
        ) : null}
      </aside>
    </div>
  );
}

function AttemptDetailPanel({
  campaignId,
  row,
  onClose,
}: {
  campaignId: string;
  row: AttemptRow;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const reallocate = async (
    action: "requeue" | "exclude_from_share" | "include_in_share",
  ) => {
    if (!row.list_id) return;
    setBusy(action);
    try {
      const itemId = row.list_item_id as number;
      await postRealloc(campaignId, row.list_id, itemId, action);
      toast.success(
        action === "requeue"
          ? "Contact re-queued for calling."
          : action === "exclude_from_share"
            ? "Contact removed from share pool."
            : "Contact added back to share pool.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-background border-l shadow-2xl">
      <header className="flex items-start justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Attempt #{row.attempt_id}</p>
          <h3 className="truncate text-base font-semibold">
            {row.worker_name ?? `Worker #${row.worker_id ?? "?"}`}
          </h3>
          <p className="text-xs text-muted-foreground">
            {row.list_name ? `${row.list_name} · ` : ""}
            {row.caller_session_label ?? "Staff"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
          aria-label="Back to list"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={busy === "requeue"}
            onClick={() => void reallocate("requeue")}
            className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            <RotateCcw className="h-3 w-3" />
            Re-queue
          </button>
          <button
            type="button"
            disabled={busy === "exclude_from_share"}
            onClick={() => void reallocate("exclude_from_share")}
            className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            <ShieldOff className="h-3 w-3" />
            Pull from share
          </button>
          <button
            type="button"
            disabled={busy === "include_in_share"}
            onClick={() => void reallocate("include_in_share")}
            className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            <ShieldCheck className="h-3 w-3" />
            Return to share
          </button>
        </div>

        <Section icon={<MessageCircle className="h-3.5 w-3.5" />} title="Notes">
          {row.overall_notes ? (
            <p className="whitespace-pre-wrap rounded bg-muted/30 p-2 text-xs">{row.overall_notes}</p>
          ) : (
            <p className="text-xs text-muted-foreground">No notes captured.</p>
          )}
        </Section>

        <Section icon={<ShieldAlert className="h-3.5 w-3.5" />} title={`Objections (${row.objections.length})`}>
          {row.objections.length === 0 ? (
            <p className="text-xs text-muted-foreground">None logged.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {row.objections.map((o, i) => (
                <li key={i} className="rounded border bg-muted/20 p-2">
                  <p className="font-medium">{o.custom_label ?? `Objection #${o.objection_id ?? ""}`}</p>
                  {o.outcome ? (
                    <p className="text-muted-foreground">Result: {o.outcome.replace(/_/g, " ")}</p>
                  ) : null}
                  {o.notes ? <p className="mt-1">{o.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={<Flame className="h-3.5 w-3.5" />} title={`Issues (${row.issues.length})`}>
          {row.issues.length === 0 ? (
            <p className="text-xs text-muted-foreground">None logged.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {row.issues.map((i, idx) => (
                <li key={idx} className="rounded border bg-muted/20 p-2">
                  <p>
                    <span className="font-medium">{i.issue_label}</span> · heat {i.heat}/5
                  </p>
                  {i.notes ? <p className="text-muted-foreground">{i.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={<Star className="h-3.5 w-3.5" />} title={`CTA ratings (${row.cta_ratings.length})`}>
          {row.cta_ratings.length === 0 ? (
            <p className="text-xs text-muted-foreground">None captured.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {row.cta_ratings.map((c, idx) => (
                <li key={idx} className="rounded border bg-muted/20 p-2">
                  CTA #{c.cta_ambition_id ?? "?"} ·{" "}
                  {c.rating != null ? `${c.rating}/5` : c.binary_value ?? "—"}
                  {c.notes ? <p className="text-muted-foreground">{c.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          icon={<ClipboardCheck className="h-3.5 w-3.5" />}
          title={`Assessment ratings (${row.assessment_ratings.length})`}
        >
          {row.assessment_ratings.length === 0 ? (
            <p className="text-xs text-muted-foreground">None captured.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {row.assessment_ratings.map((a, idx) => (
                <li key={idx} className="rounded border bg-muted/20 p-2">
                  Activity #{a.activity_id} · {a.rating != null ? `${a.rating}/5` : "—"}
                  {a.notes ? <p className="text-muted-foreground">{a.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h4>
      {children}
    </section>
  );
}
