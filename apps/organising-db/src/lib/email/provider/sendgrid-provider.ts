/**
 * SendGrid implementation of the EmailProvider interface (v3 Mail Send +
 * signed Event Webhook). No SDK dependency — plain fetch + node:crypto.
 *
 * Sending: one /v3/mail/send request per recipient (each recipient's HTML
 * is fully resolved — merge fields and the per-recipient unsubscribe URL
 * differ, so personalizations can't share content), dispatched in small
 * concurrent chunks with a hard fetch timeout. The returned X-Message-Id
 * header is stored as provider_message_id; webhook events carry
 * sg_message_id whose first dot-segment equals it.
 *
 * Webhook verification: SendGrid's Signed Event Webhook — ECDSA signature
 * over (timestamp + rawBody), public key delivered base64(DER SPKI).
 * node:crypto verifies it directly; no @sendgrid/eventwebhook needed.
 */

import { createPublicKey, verify as cryptoVerify } from "crypto";
import type {
  EmailProvider,
  EmailSenderIdentity,
  EmailSendResult,
  EmailWebhookEvent,
  EmailWebhookEventType,
  OutboundEmail,
} from "./types";

const API_BASE = "https://api.sendgrid.com/v3";
/** Hard timeout per API call — a hung provider must not stall the cron. */
const FETCH_TIMEOUT_MS = 15_000;
/** Parallel sends per chunk. */
const SEND_CONCURRENCY = 8;

const SIGNATURE_HEADER = "x-twilio-email-event-webhook-signature";
const TIMESTAMP_HEADER = "x-twilio-email-event-webhook-timestamp";

interface SendGridConfig {
  apiKey: string;
  /** Base64 DER SPKI public key from the Signed Event Webhook settings. */
  webhookPublicKey?: string;
}

/** SendGrid event names → our normalised types. */
const EVENT_TYPE_MAP: Record<string, EmailWebhookEventType> = {
  processed: "processed",
  delivered: "delivered",
  deferred: "deferred",
  bounce: "bounce",
  blocked: "bounce",
  dropped: "dropped",
  spamreport: "spam_report",
  unsubscribe: "unsubscribe",
  group_unsubscribe: "unsubscribe",
  open: "open",
  click: "click",
};

export class SendGridProvider implements EmailProvider {
  readonly name = "sendgrid";
  private config: SendGridConfig;

  constructor(config: SendGridConfig) {
    this.config = config;
  }

  private async sendOne(
    msg: OutboundEmail,
    from: EmailSenderIdentity
  ): Promise<EmailSendResult> {
    const payload = {
      personalizations: [
        {
          to: [{ email: msg.to, ...(msg.toName ? { name: msg.toName } : {}) }],
          ...(msg.customArgs ? { custom_args: msg.customArgs } : {}),
        },
      ],
      from: { email: from.fromEmail, name: from.fromName },
      reply_to: { email: from.replyTo || from.fromEmail },
      subject: msg.subject,
      content: [
        ...(msg.text ? [{ type: "text/plain", value: msg.text }] : []),
        { type: "text/html", value: msg.html },
      ],
      ...(msg.headers && Object.keys(msg.headers).length > 0
        ? { headers: msg.headers }
        : {}),
      // Unsubscribe is ours (List-Unsubscribe headers + /u/[token]);
      // never let SendGrid's subscription tracking rewrite the footer.
      tracking_settings: {
        subscription_tracking: { enable: false },
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}/mail/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (res.status === 202) {
        return {
          to: msg.to,
          status: "success",
          providerMessageId: res.headers.get("x-message-id"),
        };
      }
      let detail = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as {
          errors?: Array<{ message?: string; field?: string }>;
        };
        if (body?.errors?.length) {
          detail = body.errors
            .map((e) => [e.field, e.message].filter(Boolean).join(": "))
            .join("; ");
        }
      } catch {
        // keep the HTTP status
      }
      return {
        to: msg.to,
        status: "error",
        providerMessageId: null,
        error: detail,
      };
    } catch (err) {
      return {
        to: msg.to,
        status: "error",
        providerMessageId: null,
        error:
          err instanceof Error && err.name === "AbortError"
            ? `SendGrid request timed out after ${FETCH_TIMEOUT_MS}ms`
            : err instanceof Error
              ? err.message
              : "SendGrid request failed",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async sendBatch(
    msgs: OutboundEmail[],
    opts: { from: EmailSenderIdentity; idempotencyKey?: string }
  ): Promise<EmailSendResult[]> {
    const results: EmailSendResult[] = new Array(msgs.length);
    for (let i = 0; i < msgs.length; i += SEND_CONCURRENCY) {
      const chunk = msgs.slice(i, i + SEND_CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map((m) => this.sendOne(m, opts.from))
      );
      chunkResults.forEach((r, j) => {
        results[i + j] = r;
      });
    }
    return results;
  }

  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    const publicKeyB64 = this.config.webhookPublicKey;
    if (!publicKeyB64) return false;
    const signature = headers[SIGNATURE_HEADER];
    const timestamp = headers[TIMESTAMP_HEADER];
    if (!signature || !timestamp) return false;
    try {
      const publicKey = createPublicKey({
        key: Buffer.from(publicKeyB64, "base64"),
        format: "der",
        type: "spki",
      });
      return cryptoVerify(
        "sha256",
        Buffer.from(timestamp + rawBody),
        publicKey,
        Buffer.from(signature, "base64")
      );
    } catch {
      return false;
    }
  }

  parseWebhookEvents(rawBody: string): EmailWebhookEvent[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.map((raw) => {
      const e = (raw ?? {}) as Record<string, unknown>;
      const eventName = typeof e.event === "string" ? e.event : "";
      const type = EVENT_TYPE_MAP[eventName] ?? "unknown";
      // custom_args are flattened onto the event payload by SendGrid.
      const sendIdRaw = e.send_id;
      const sendId =
        typeof sendIdRaw === "number" && Number.isFinite(sendIdRaw)
          ? sendIdRaw
          : typeof sendIdRaw === "string" && /^\d+$/.test(sendIdRaw)
            ? Number(sendIdRaw)
            : null;
      const ts = e.timestamp;
      const occurredAt =
        typeof ts === "number" && Number.isFinite(ts)
          ? new Date(ts * 1000).toISOString()
          : null;
      return {
        type,
        providerEventId: typeof e.sg_event_id === "string" ? e.sg_event_id : null,
        providerMessageId:
          typeof e.sg_message_id === "string" ? e.sg_message_id : null,
        email: typeof e.email === "string" ? e.email : null,
        sendId,
        reason: typeof e.reason === "string" ? e.reason : null,
        url: typeof e.url === "string" ? e.url : null,
        occurredAt,
        raw,
      };
    });
  }
}
