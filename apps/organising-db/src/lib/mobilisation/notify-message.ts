import type { AlertDraft, SignalView } from "./types";

export interface AlertMessage {
  subject: string;
  text: string;
  html: string;
  slackText: string;
}

const LAYER: Record<string, string> = {
  regulatory: "Regulatory",
  commercial: "Commercial",
  ais: "AIS",
};

/**
 * Every outbound notification carries the source link and the matched
 * entities. AIS positions are not included beyond the geofence name — the
 * licence does not allow redistribution of the track.
 */
export function composeAlertMessage(input: {
  alert: Pick<AlertDraft, "title" | "summary" | "priority" | "confidence">;
  signals: Pick<SignalView, "title" | "url" | "source_layer" | "source" | "occurred_at">[];
  entities: string[];
  appUrl: string | null;
}): AlertMessage {
  const links = input.signals
    .filter((s) => s.url)
    .map((s) => `${s.source}: ${s.url}`)
    .filter((v, i, a) => a.indexOf(v) === i);
  const layers = [...new Set(input.signals.map((s) => LAYER[s.source_layer] ?? s.source_layer))].join(", ");
  const who = input.entities.length ? input.entities.join(", ") : "unlinked entity";
  const subject = `[Mobilisation ${input.alert.priority}] ${input.alert.title}`;
  const lines = [
    input.alert.summary,
    `Priority: ${input.alert.priority}`,
    `Confidence: ${Math.round(input.alert.confidence * 100)}%`,
    `Layers: ${layers || "—"}`,
    `Matched: ${who}`,
    ...links.map((l) => `Source: ${l}`),
    input.appUrl ? `Open in Offshore Alliance: ${input.appUrl}` : null,
  ].filter((l): l is string => Boolean(l));
  const text = lines.join("\n");
  const html = `<p>${escapeHtml(input.alert.summary)}</p>
<ul>
<li>Priority: ${escapeHtml(input.alert.priority)}</li>
<li>Confidence: ${Math.round(input.alert.confidence * 100)}%</li>
<li>Layers: ${escapeHtml(layers || "—")}</li>
<li>Matched: ${escapeHtml(who)}</li>
${links.map((l) => `<li><a href="${escapeHtml(l.replace(/^.*?:\s*/, ""))}">${escapeHtml(l)}</a></li>`).join("")}
</ul>
${input.appUrl ? `<p><a href="${escapeHtml(input.appUrl)}">Open in Offshore Alliance</a></p>` : ""}`;
  return { subject, text, html, slackText: text };
}

export function composeDigest(input: {
  alerts: { title: string; priority: string; summary: string }[];
  appUrl: string | null;
  cadence: "daily" | "weekly";
}): AlertMessage {
  const subject = `Mobilisation ${input.cadence} digest (${input.alerts.length})`;
  const lines = input.alerts.map((a) => `• [${a.priority}] ${a.title} — ${a.summary}`);
  const text = [`Mobilisation ${input.cadence} roundup`, ...lines, input.appUrl].filter(Boolean).join("\n");
  const html = `<p>Mobilisation ${input.cadence} roundup</p><ul>${input.alerts
    .map((a) => `<li><strong>[${escapeHtml(a.priority)}]</strong> ${escapeHtml(a.title)} — ${escapeHtml(a.summary)}</li>`)
    .join("")}</ul>${input.appUrl ? `<p><a href="${escapeHtml(input.appUrl)}">Open the feed</a></p>` : ""}`;
  return { subject, text, html, slackText: text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function priorityMeets(priority: string, minimum: string): boolean {
  const rank: Record<string, number> = { low: 0, normal: 1, high: 2, critical: 3 };
  return (rank[priority] ?? 0) >= (rank[minimum] ?? 2);
}
