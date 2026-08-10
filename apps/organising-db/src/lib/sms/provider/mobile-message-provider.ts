import { createHmac, timingSafeEqual } from "crypto";
import type {
  MessageDeliveryStatus,
  MessageStatus,
  OutboundSms,
  SenderId,
  SendResult,
  SmsProvider,
  SmsWebhookEvent,
} from "./types";

const BASE_URL = "https://api.mobilemessage.com.au";
/** POST /v1/messages accepts up to 10,000 messages per request. */
const MAX_BATCH_SIZE = 10_000;
/** Account-level cap — requests beyond this return HTTP 429. */
const MAX_CONCURRENT_REQUESTS = 5;
/** Reject webhooks whose timestamp drifts beyond this (replay guard). */
const WEBHOOK_MAX_SKEW_SECONDS = 300;

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

function mapDeliveryStatus(raw: string | undefined | null): MessageDeliveryStatus {
  switch (raw) {
    case "pending":
    case "scheduled":
    case "sent":
    case "delivered":
    case "failed":
    case "cancelled":
      return raw;
    default:
      return "unknown";
  }
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
      senders?: { sender?: string; number?: string; type?: string; status?: string }[];
    }>("GET", "/v1/senders");
    return (data.senders ?? []).map((s) => ({
      sender: s.sender ?? s.number ?? "",
      type: s.type,
      status: s.status,
    }));
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

    switch (payload.type) {
      case "inbound":
        return {
          type: "inbound",
          from: str("from") ?? "",
          to: str("to") ?? "",
          body: str("message") ?? str("body") ?? "",
          providerMessageId: str("message_id"),
          originalMessageId: str("original_message_id"),
          originalCustomRef: str("original_custom_ref"),
          receivedAt: str("received_at") ?? str("timestamp"),
        };
      case "unsubscribe":
        return {
          type: "unsubscribe",
          from: str("from") ?? str("number") ?? "",
          to: str("to") ?? "",
          providerMessageId: str("message_id"),
          receivedAt: str("received_at") ?? str("timestamp"),
        };
      case "status":
        return {
          type: "status",
          providerMessageId: str("message_id"),
          customRef: str("custom_ref"),
          status: mapDeliveryStatus(str("status")),
          occurredAt: str("occurred_at") ?? str("timestamp"),
        };
      default:
        return { type: "unknown", raw: payload };
    }
  }
}
