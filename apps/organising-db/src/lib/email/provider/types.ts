/**
 * Email provider interface — modelled on `lib/sms/provider/types.ts`.
 *
 * First implementation is SendGrid; a mock provider covers local dev and
 * tests. The interface keeps a future
 * provider swap (SES, Postmark, etc.) cheap: consumers only ever see
 * `getEmailProvider()` from `@/lib/email/provider`.
 */

export interface EmailSenderIdentity {
  /** e.g. organise@offshore-alliance.au — must be on the authenticated domain. */
  fromEmail: string;
  /** Display name, e.g. "Offshore Alliance". */
  fromName: string;
  /** Defaults to fromEmail when empty. */
  replyTo?: string;
}

export interface OutboundEmail {
  to: string;
  toName?: string;
  subject: string;
  /** Fully resolved per-recipient HTML (merge fields + wrapper applied). */
  html: string;
  /** Plain-text alternative. */
  text?: string;
  /**
   * Correlation refs echoed back on webhook events. The dispatcher sets
   * `send_id` = email_send_log.send_id.
   */
  customArgs?: Record<string, string>;
  /** Extra SMTP headers (List-Unsubscribe etc.). */
  headers?: Record<string, string>;
  /** Provider-ready attachment payloads (base64 encoded). */
  attachments?: Array<{
    content: string;
    filename: string;
    type?: string;
    disposition?: "attachment" | "inline";
    contentId?: string;
  }>;
}

export type EmailSendResultStatus = "success" | "error";

export interface EmailSendResult {
  to: string;
  status: EmailSendResultStatus;
  /** Provider message id (SendGrid X-Message-Id). */
  providerMessageId: string | null;
  error?: string;
}

/** Normalised Event Webhook event types we act on. */
export type EmailWebhookEventType =
  | "processed"
  | "delivered"
  | "deferred"
  | "bounce"
  | "dropped"
  | "spam_report"
  | "unsubscribe"
  | "open"
  | "click"
  | "unknown";

export interface EmailWebhookEvent {
  type: EmailWebhookEventType;
  /** Provider-unique event id (SendGrid sg_event_id) — idempotency handle. */
  providerEventId: string | null;
  /**
   * Provider message id (SendGrid sg_message_id — its first dot-segment
   * matches the X-Message-Id returned at send time).
   */
  providerMessageId: string | null;
  /** Recipient address the event is about. */
  email: string | null;
  /** Our correlation ref (custom_args.send_id) when present. */
  sendId: number | null;
  /** Bounce/drop reason when present. */
  reason: string | null;
  /** Target URL for click events. */
  url: string | null;
  occurredAt: string | null;
  raw: unknown;
}

export interface EmailProvider {
  readonly name: string;

  sendBatch(
    msgs: OutboundEmail[],
    opts: { from: EmailSenderIdentity; idempotencyKey?: string }
  ): Promise<EmailSendResult[]>;

  /** Verify a webhook's signature against the raw request body. */
  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean;

  /** Parse the Event Webhook body into normalised events. */
  parseWebhookEvents(rawBody: string): EmailWebhookEvent[];
}
