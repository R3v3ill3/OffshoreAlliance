import type { SupabaseClient } from "@supabase/supabase-js";
import { getEmailProvider, getEmailSenderIdentity } from "@/lib/email/provider";
import { composeAlertMessage, composeDigest, priorityMeets } from "../notify-message";
import type { AlertDraft, SignalView } from "../types";
import type { Db, RadarContext } from "./context";
import { toSignal } from "./context";

interface StaffPref {
  userId: string;
  email: string | null;
  emailImmediate: boolean;
  pushImmediate: boolean;
  digest: "off" | "daily" | "weekly";
  minPriority: string;
}

export async function dispatchImmediate(
  db: Db,
  ctx: RadarContext,
  alerts: (AlertDraft & { alert_id?: number })[]
): Promise<void> {
  const concrete = alerts.filter((a) => a.alert_id);
  if (concrete.length === 0) return;
  const staff = await loadStaff(db);
  for (const alert of concrete) {
    const signals = await signalsForAlert(db, alert.alert_id!);
    const entities = await entityLabels(db, alert);
    const message = composeAlertMessage({
      alert,
      signals,
      entities,
      appUrl: appUrl(),
    });
    await postTeam(db, ctx, alert.alert_id!, "slack", ctx.slackWebhook, message.slackText);
    await postTeam(db, ctx, alert.alert_id!, "teams", ctx.teamsWebhook, message.text);
    for (const person of staff) {
      if (!priorityMeets(alert.priority, person.minPriority)) continue;
      if (person.emailImmediate && person.email) {
        await sendEmail(db, alert.alert_id!, person, message.subject, message.html, message.text, "immediate");
      }
      if (person.pushImmediate) {
        await sendPush(db, alert.alert_id!, person.userId, message.subject, message.text);
      }
    }
  }
}

export async function dispatchDigests(db: Db, ctx: RadarContext): Promise<string> {
  await unsnooze(db);
  const staff = await loadStaff(db);
  const since = new Date(Date.now() - 8 * 86400000).toISOString();
  const { data, error } = await db
    .from("mobilisation_alerts")
    .select("alert_id, title, summary, priority, status, created_at")
    .gte("created_at", since)
    .neq("status", "dismissed")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  const alerts = data ?? [];
  if (alerts.length === 0) return "digest empty";
  const monday = new Date().getUTCDay() === 1;
  let sent = 0;
  for (const person of staff) {
    if (person.digest === "off") continue;
    if (person.digest === "weekly" && !monday) continue;
    if (!person.email) continue;
    const kind = `digest:${new Date().toISOString().slice(0, 10)}`;
    const fresh = [];
    for (const alert of alerts) {
      const existing = await db
        .from("mobilisation_notifications")
        .select("notification_id")
        .eq("alert_id", alert.alert_id)
        .eq("destination", `user:${person.userId}`)
        .eq("channel", "email")
        .eq("kind", kind)
        .maybeSingle();
      if (!existing.data) fresh.push(alert);
    }
    if (fresh.length === 0) continue;
    const message = composeDigest({
      alerts: fresh.map((a) => ({ title: String(a.title), priority: String(a.priority), summary: String(a.summary) })),
      appUrl: appUrl(),
      cadence: person.digest === "weekly" ? "weekly" : "daily",
    });
    await sendEmail(db, Number(fresh[0]!.alert_id), person, message.subject, message.html, message.text, kind);
    for (const alert of fresh.slice(1)) {
      await db.from("mobilisation_notifications").insert({
        alert_id: alert.alert_id,
        destination: `user:${person.userId}`,
        channel: "email",
        kind,
        status: "sent",
        sent_at: new Date().toISOString(),
      });
    }
    sent += 1;
  }
  void ctx;
  return `digest emails ${sent}`;
}

async function unsnooze(db: Db): Promise<void> {
  await db
    .from("mobilisation_alerts")
    .update({ status: "new", snoozed_until: null, status_note: "Snooze expired" })
    .eq("status", "snoozed")
    .lt("snoozed_until", new Date().toISOString());
}

async function loadStaff(db: Db): Promise<StaffPref[]> {
  const recipientIds = await loadRecipientIds(db);
  let profileQuery = db.from("user_profiles").select("user_id, role").in("role", ["admin", "user"]);
  if (recipientIds !== null) {
    if (recipientIds.length === 0) return [];
    profileQuery = profileQuery.in("user_id", recipientIds);
  }
  const { data: profiles, error } = await profileQuery;
  if (error) throw new Error(error.message);
  const ids = (profiles ?? []).map((p) => p.user_id as string);
  if (ids.length === 0) return [];

  const { data: prefs } = await db.from("mobilisation_prefs").select("*").in("user_id", ids);
  const prefById = new Map((prefs ?? []).map((p) => [p.user_id as string, p]));
  const emails = await emailsById(db, ids);
  return ids.map((userId) => {
    const pref = prefById.get(userId) as { email_immediate?: boolean; push_immediate?: boolean; digest?: StaffPref["digest"]; min_priority?: string } | undefined;
    return {
      userId,
      email: emails.get(userId) ?? null,
      emailImmediate: pref?.email_immediate ?? true,
      pushImmediate: pref?.push_immediate ?? false,
      digest: pref?.digest ?? "daily",
      minPriority: pref?.min_priority ?? "high",
    };
  });
}

/** Enabled recipient user ids, or null when the recipients table is not applied yet. */
async function loadRecipientIds(db: Db): Promise<string[] | null> {
  const { data, error } = await db.from("mobilisation_recipients").select("user_id").eq("enabled", true);
  if (error) {
    if (/mobilisation_recipients|schema cache|does not exist/i.test(error.message)) {
      return null;
    }
    throw new Error(error.message);
  }
  return [...new Set((data ?? []).map((row) => row.user_id as string))];
}

async function emailsById(db: Db, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const admin = db.auth.admin;
  let page = 1;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    for (const user of data.users) {
      if (ids.includes(user.id) && user.email) map.set(user.id, user.email);
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  return map;
}

async function signalsForAlert(db: Db, alertId: number): Promise<SignalView[]> {
  const links = await db.from("mobilisation_alert_signals").select("signal_id").eq("alert_id", alertId);
  const ids = (links.data ?? []).map((row) => row.signal_id as number);
  if (ids.length === 0) return [];
  const signals = await db.from("mobilisation_signals").select("*").in("signal_id", ids);
  return (signals.data ?? []).map((row) => toSignal(row as Record<string, unknown>));
}

async function entityLabels(db: Db, alert: AlertDraft): Promise<string[]> {
  const labels: string[] = [];
  if (alert.watch_contractor_id) {
    const { data } = await db.from("mobilisation_watch_contractors").select("canonical_name").eq("watch_id", alert.watch_contractor_id).maybeSingle();
    if (data?.canonical_name) labels.push(String(data.canonical_name));
  }
  if (alert.vessel_id) {
    const { data } = await db.from("vessels").select("name, imo").eq("vessel_id", alert.vessel_id).maybeSingle();
    if (data?.name) labels.push(data.imo ? `${data.name} (IMO ${data.imo})` : String(data.name));
  }
  if (alert.contractor_id) {
    const { data } = await db.from("employers").select("employer_name").eq("employer_id", alert.contractor_id).maybeSingle();
    if (data?.employer_name) labels.push(String(data.employer_name));
  }
  if (alert.operator_id) {
    const { data } = await db.from("employers").select("employer_name").eq("employer_id", alert.operator_id).maybeSingle();
    if (data?.employer_name) labels.push(`Operator ${data.employer_name}`);
  }
  if (alert.worksite_id) {
    const { data } = await db.from("worksites").select("worksite_name").eq("worksite_id", alert.worksite_id).maybeSingle();
    if (data?.worksite_name) labels.push(String(data.worksite_name));
  }
  return [...new Set(labels)];
}

async function sendEmail(
  db: Db,
  alertId: number,
  person: StaffPref,
  subject: string,
  html: string,
  text: string,
  kind: string
): Promise<void> {
  const destination = `user:${person.userId}`;
  try {
    const [provider, from] = await Promise.all([getEmailProvider(), getEmailSenderIdentity()]);
    const [result] = await provider.sendBatch(
      [{ to: person.email!, subject, html, text }],
      { from, idempotencyKey: `mob-${alertId}-${person.userId}-${kind}` }
    );
    await db.from("mobilisation_notifications").insert({
      alert_id: alertId,
      destination,
      channel: "email",
      kind,
      status: result?.status === "success" ? "sent" : "failed",
      error: result?.error ?? null,
      sent_at: result?.status === "success" ? new Date().toISOString() : null,
    });
  } catch (error) {
    await db.from("mobilisation_notifications").insert({
      alert_id: alertId,
      destination,
      channel: "email",
      kind,
      status: "skipped",
      error: error instanceof Error ? error.message : "email failed",
    });
  }
}

async function sendPush(db: Db, alertId: number, userId: string, title: string, body: string): Promise<void> {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:organise@offshorealliance.org.au";
  if (!pub || !priv) return;
  const { data: subs } = await db.from("mobilisation_push_subscriptions").select("*").eq("user_id", userId);
  if (!subs?.length) return;
  type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };
  const imported = (await import("web-push")) as {
    setVapidDetails?: (subject: string, publicKey: string, privateKey: string) => void;
    sendNotification?: (subscription: PushTarget, payload?: string) => Promise<unknown>;
    default?: {
      setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
      sendNotification: (subscription: PushTarget, payload?: string) => Promise<unknown>;
    };
  };
  const webpush =
    typeof imported.setVapidDetails === "function" && typeof imported.sendNotification === "function"
      ? imported
      : imported.default;
  if (!webpush?.setVapidDetails || !webpush.sendNotification) {
    throw new Error("web-push did not export setVapidDetails");
  }
  webpush.setVapidDetails(subject, pub, priv);
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint as string, keys: { p256dh: sub.p256dh as string, auth: sub.auth as string } },
        JSON.stringify({ title, body: body.slice(0, 240), url: appUrl() ?? "/projects/alerts" })
      );
      await db.from("mobilisation_notifications").insert({
        alert_id: alertId,
        destination: `user:${userId}`,
        channel: "push",
        kind: "immediate",
        status: "sent",
        sent_at: new Date().toISOString(),
      });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.from("mobilisation_push_subscriptions").delete().eq("subscription_id", sub.subscription_id);
      }
      await db.from("mobilisation_notifications").insert({
        alert_id: alertId,
        destination: `user:${userId}`,
        channel: "push",
        kind: "immediate",
        status: "failed",
        error: error instanceof Error ? error.message : "push failed",
      });
    }
  }
}

async function postTeam(
  db: Db,
  ctx: RadarContext,
  alertId: number,
  channel: "slack" | "teams",
  webhook: string | null,
  text: string
): Promise<void> {
  void ctx;
  if (!webhook) return;
  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        channel === "slack"
          ? { text }
          : { "@type": "MessageCard", "@context": "https://schema.org/extensions", summary: text.slice(0, 120), text }
      ),
    });
    await db.from("mobilisation_notifications").insert({
      alert_id: alertId,
      destination: `team:${channel}`,
      channel,
      kind: "immediate",
      status: response.ok ? "sent" : "failed",
      error: response.ok ? null : `HTTP ${response.status}`,
      sent_at: response.ok ? new Date().toISOString() : null,
    });
  } catch (error) {
    await db.from("mobilisation_notifications").insert({
      alert_id: alertId,
      destination: `team:${channel}`,
      channel,
      kind: "immediate",
      status: "failed",
      error: error instanceof Error ? error.message : "webhook failed",
    });
  }
}

function appUrl(): string | null {
  if (process.env.NEXT_PUBLIC_APP_URL) return `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/projects/alerts`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/projects/alerts`;
  return null;
}

export type DispatchDb = SupabaseClient;
