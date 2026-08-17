import { createHash, createHmac, timingSafeEqual } from "crypto";
import type {
  MessageDeliveryStatus,
  MessageStatus,
  OutboundSms,
  SenderId,
  SendResult,
  SmsProvider,
  SmsWebhookEvent,
} from "./types";

/**
 * Mobile Message's inbound webhook docs omit a stable `message_id`.
 * Retries therefore arrive without a native idempotency key. Build a
 * deterministic stand-in from the fields MM always sends so duplicate
 * deliveries collapse instead of re-answering the next survey question.
 */
export function syntheticInboundMessageId(parts: {
  to: string;
  from: string;
  body: string;
  receivedAt: string | null;
  originalMessageId: string | null;
}): string {
  const basis = [
    parts.originalMessageId ?? "",
    parts.to,
    parts.from,
    parts.receivedAt ?? "",
    parts.body,
  ].join("|");
  return `mm-in-${createHash("sha256").update(basis).digest("hex").slice(0, 32)}`;
}

const BASE_URL = "https://api.mobilemessage.com.au";
/** POST /v1/messages accepts up to 10,000 messages per request. */
const MAX_BATCH_SIZE = 10_000;
/** Account-level cap — requests beyond this return HTTP 429. */
const MAX_CONCURRENT_REQUESTS = 5;
/** Reject webhooks whose timestamp drifts beyond this (replay guard). */
const WEBHOOK_MAX_SKEW_SECONDS = 300;
/**
 * Hard timeout per API request. Without it a stalled provider fetch can
 * pin a dispatcher run past the next cron tick (double-send risk — the
 * queued→sending claim is the primary guard; this bounds the overlap).
 */
const REQUEST_TIMEOUT_MS = 30_000;

export interface MobileMessageConfig {
  username: string;
  password: string;
  /** Webhook signing secret from the Mobile Message dashboard. */
  webhookSecret?: string;
}

interface MmMessageResult {
  status?: string;
  cost?: number;
  message_id?: string;
  custom_ref?: string;
  encoding?: string;
  to?: string;
  error?: string;
}

interface MmSenderRow {
  sender?: string;
  number?: string;
  type?: string;
  status?: string;
}

/** MM docs return `{ results }`; some payloads use `{ senders }`. */
export function parseListSendersResponse(data: {
  senders?: MmSenderRow[];
  results?: MmSenderRow[];
}): SenderId[] {
  const rows = data.senders ?? data.results ?? [];
  return rows
    .map((s) => ({
      sender: s.sender ?? s.number ?? "",
      type: s.type,
      status: s.status,
    }))
    .filter((s) => s.sender);
}

/** Minimal promise semaphore for the 5-concurrent-request account limit. */
class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    // Re-check after waking: a caller arriving between a slot freeing and the
    // woken waiter resuming could otherwise push concurrency past the limit.
    while (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

/**
 * Delivery-status vocabulary. The documented values are the six in
 * MessageDeliveryStatus, but MM's live payloads have already proven
 * looser than the docs once (the inbound webhook sends `sender`, not
 * `from`), and carrier DLR text varies. Normalise case and accept the
 * common synonyms so a wording difference cannot silently drop a
 * receipt — the failure mode is invisible, because an unmapped status
 * becomes "unknown" and the route discards the event.
 */
function mapDeliveryStatus(raw: string | undefined | null): MessageDeliveryStatus {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  switch (v) {
    case "pending":
    case "queued":
      return "pending";
    case "scheduled":
      return "scheduled";
    case "sent":
    case "submitted":
    case "accepted":
      return "sent";
    case "delivered":
    case "delivrd":
    case "success":
    case "successful":
      return "delivered";
    case "failed":
    case "failure":
    case "error":
    case "undelivered":
    case "undeliverable":
    case "rejected":
    case "expired":
    case "bounced":
    case "blocked":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "unknown";
  }
}

/** Read the first present string value across candidate key spellings. */
function pickString(
  payload: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === "string" && v.length > 0) return v;
    // Some providers send numeric ids/timestamps unquoted.
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

const STATUS_ID_KEYS = [
  "message_id",
  "messageId",
  "provider_message_id",
  "msg_id",
  "id",
];
const STATUS_VALUE_KEYS = [
  "status",
  "delivery_status",
  "message_status",
  "state",
];
const STATUS_TIME_KEYS = [
  "occurred_at",
  "timestamp",
  "status_at",
  "updated_at",
  "delivered_at",
];
const STATUS_REF_KEYS = ["custom_ref", "customRef", "reference", "ref"];

/**
 * Map the payload's `type` discriminator onto our three event kinds,
 * tolerating the spellings a delivery-receipt webhook is plausibly
 * labelled with. Returns null when the value is absent or unrecognised,
 * which hands the decision to shape inference below.
 */
function normaliseEventType(
  raw: unknown,
): "inbound" | "unsubscribe" | "status" | null {
  if (typeof raw !== "string") return null;
  switch (raw.trim().toLowerCase()) {
    case "inbound":
    case "inbound_message":
    case "mo":
    case "reply":
      return "inbound";
    case "unsubscribe":
    case "unsubscribed":
    case "optout":
    case "opt_out":
    case "opt-out":
      return "unsubscribe";
    case "status":
    case "status_update":
    case "delivery":
    case "delivery_report":
    case "delivery_receipt":
    case "delivery_status":
    case "dlr":
    case "receipt":
      return "status";
    default:
      return null;
  }
}

/**
 * Last-resort classification for payloads whose `type` we do not
 * recognise. Deliberately conservative: a delivery receipt is only
 * inferred when the payload carries a status value that maps to a
 * *known* delivery state alongside a message id, and carries no message
 * body (which would make it an inbound reply). Anything ambiguous stays
 * unknown rather than being mis-routed.
 */
function inferEventType(
  payload: Record<string, unknown>,
): "inbound" | "status" | null {
  const hasBody = pickString(payload, ["message", "body", "content"]) !== null;
  const statusValue = pickString(payload, STATUS_VALUE_KEYS);
  const hasId = pickString(payload, STATUS_ID_KEYS) !== null;

  if (
    !hasBody &&
    hasId &&
    statusValue !== null &&
    mapDeliveryStatus(statusValue) !== "unknown"
  ) {
    return "status";
  }
  if (hasBody && pickString(payload, ["from", "sender"]) !== null) {
    return "inbound";
  }
  return null;
}

export class MobileMessageProvider implements SmsProvider {
  readonly name = "mobile_message";
  readonly capabilities = { mms: false };

  private readonly authHeader: string;
  private readonly webhookSecret: string | null;
  private readonly semaphore = new Semaphore(MAX_CONCURRENT_REQUESTS);

  constructor(config: MobileMessageConfig) {
    this.authHeader =
      "Basic " +
      Buffer.from(`${config.username}:${config.password}`).toString("base64");
    this.webhookSecret = config.webhookSecret || null;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    options: { body?: unknown; headers?: Record<string, string> } = {}
  ): Promise<T> {
    return this.semaphore.run(async () => {
      const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: this.authHeader,
          ...options.headers,
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `Mobile Message API error: ${response.status} ${response.statusText}${
            detail ? ` — ${detail.slice(0, 300)}` : ""
          }`
        );
      }
      return response.json() as Promise<T>;
    });
  }

  async sendBatch(
    msgs: OutboundSms[],
    opts?: { idempotencyKey?: string }
  ): Promise<SendResult[]> {
    const results: SendResult[] = [];
    for (let offset = 0; offset < msgs.length; offset += MAX_BATCH_SIZE) {
      const chunk = msgs.slice(offset, offset + MAX_BATCH_SIZE);
      const headers: Record<string, string> = {};
      if (opts?.idempotencyKey) {
        headers["Idempotency-Key"] =
          offset === 0 ? opts.idempotencyKey : `${opts.idempotencyKey}:${offset}`;
      }
      const data = await this.request<{ messages?: MmMessageResult[]; results?: MmMessageResult[] }>(
        "POST",
        "/v1/messages",
        {
          headers,
          body: {
            messages: chunk.map((m) => ({
              to: m.to,
              message: m.body,
              sender: m.sender,
              ...(m.customRef ? { custom_ref: m.customRef } : {}),
              ...(m.scheduledFor ? { scheduled_for: m.scheduledFor } : {}),
            })),
          },
        }
      );
      const perMessage = data.messages ?? data.results ?? [];
      chunk.forEach((m, i) => {
        const r = perMessage[i];
        if (!r) {
          results.push({
            to: m.to,
            status: "error",
            providerMessageId: null,
            customRef: m.customRef ?? null,
            error: "No result returned for message",
          });
          return;
        }
        results.push({
          to: r.to ?? m.to,
          status:
            r.status === "success" ? "success" : r.status === "blocked" ? "blocked" : "error",
          providerMessageId: r.message_id ?? null,
          customRef: r.custom_ref ?? m.customRef ?? null,
          cost: r.cost,
          encoding: r.encoding,
          ...(r.status !== "success" && r.status !== "blocked"
            ? { error: r.error ?? `Unexpected status: ${r.status}` }
            : {}),
        });
      });
    }
    return results;
  }

  async getMessageStatus(providerMessageId: string): Promise<MessageStatus> {
    const data = await this.request<{
      messages?: { message_id?: string; status?: string; custom_ref?: string; delivered_at?: string }[];
    }>("GET", `/v1/messages?message_id=${encodeURIComponent(providerMessageId)}`);
    const msg = data.messages?.[0];
    return {
      providerMessageId,
      status: mapDeliveryStatus(msg?.status),
      customRef: msg?.custom_ref ?? null,
      deliveredAt: msg?.delivered_at ?? null,
    };
  }

  async listSenders(): Promise<SenderId[]> {
    const data = await this.request<{
      senders?: MmSenderRow[];
      results?: MmSenderRow[];
    }>("GET", "/v1/senders");
    return parseListSendersResponse(data);
  }

  async getCreditBalance(): Promise<number> {
    const data = await this.request<{ balance?: number; credits?: number }>(
      "GET",
      "/v1/account"
    );
    return data.balance ?? data.credits ?? 0;
  }

  // TODO(phase-2): validate the signing scheme (base string, timestamp unit,
  // signature encoding) against the Mobile Message sandbox before the webhook
  // route ships — the `${timestamp}.${rawBody}` hex-HMAC shape is assumed.
  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    if (!this.webhookSecret) return false;
    const timestamp = headers["x-mm-timestamp"] ?? headers["X-MM-Timestamp"];
    const signature = headers["x-mm-signature"] ?? headers["X-MM-Signature"];
    if (!timestamp || !signature) return false;

    let ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    if (ts > 1e12) ts = ts / 1000; // tolerate millisecond timestamps
    if (Math.abs(Date.now() / 1000 - ts) > WEBHOOK_MAX_SKEW_SECONDS) return false;

    const expected = createHmac("sha256", this.webhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(signature.trim().toLowerCase());
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(rawBody: string): SmsWebhookEvent {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { type: "unknown", raw: rawBody };
    }
    const str = (k: string): string | null =>
      typeof payload[k] === "string" ? (payload[k] as string) : null;

    // Accept the documented `type` values plus the near-spellings a
    // delivery receipt may use; fall back to shape inference when the
    // discriminator is missing or unfamiliar. Without this an unmatched
    // label makes the event vanish silently (200 OK, nothing recorded).
    const kind = normaliseEventType(payload.type) ?? inferEventType(payload);

    switch (kind) {
      case "inbound": {
        // Mobile Message's inbound webhook uses `sender` (member MSISDN),
        // not `from`. Accept both so sandbox/docs variants still parse.
        const from = str("from") ?? str("sender") ?? "";
        const to = str("to") ?? "";
        const body = str("message") ?? str("body") ?? "";
        const receivedAt = str("received_at") ?? str("timestamp");
        const originalMessageId = str("original_message_id");
        const nativeId = str("message_id") ?? str("inbound_message_id");
        return {
          type: "inbound",
          from,
          to,
          body,
          providerMessageId:
            nativeId ??
            syntheticInboundMessageId({
              to,
              from,
              body,
              receivedAt,
              originalMessageId,
            }),
          originalMessageId,
          originalCustomRef: str("original_custom_ref"),
          receivedAt,
        };
      }
      case "unsubscribe":
        return {
          type: "unsubscribe",
          from: str("from") ?? str("sender") ?? str("number") ?? "",
          to: str("to") ?? "",
          providerMessageId: str("message_id"),
          receivedAt: str("received_at") ?? str("timestamp"),
        };
      case "status":
        // Field spellings are tolerated for the same reason as inbound:
        // the live payload shape has not been verified against MM, and a
        // missed key here reads as a permanent 0% delivery rate.
        return {
          type: "status",
          providerMessageId: pickString(payload, STATUS_ID_KEYS),
          customRef: pickString(payload, STATUS_REF_KEYS),
          status: mapDeliveryStatus(pickString(payload, STATUS_VALUE_KEYS)),
          occurredAt: pickString(payload, STATUS_TIME_KEYS),
        };
      default:
        return { type: "unknown", raw: payload };
    }
  }
}
