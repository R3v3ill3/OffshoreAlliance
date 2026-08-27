import type {
  EmailProvider,
  EmailSenderIdentity,
  EmailSendResult,
  EmailWebhookEvent,
  OutboundEmail,
} from "./types";

export interface RecordedEmailSend {
  message: OutboundEmail;
  from: EmailSenderIdentity;
  result: EmailSendResult;
  idempotencyKey: string | null;
  sentAt: string;
}

/**
 * In-memory provider for local dev and tests: records every send and can
 * synthesise webhook events so the queue/webhook flows are testable
 * without a SendGrid account (shape of MockSmsProvider).
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = "mock";

  readonly sends: RecordedEmailSend[] = [];
  private counter = 0;

  async sendBatch(
    msgs: OutboundEmail[],
    opts: { from: EmailSenderIdentity; idempotencyKey?: string }
  ): Promise<EmailSendResult[]> {
    return msgs.map((message) => {
      this.counter++;
      const result: EmailSendResult = {
        to: message.to,
        status: "success",
        providerMessageId: `mock-email-${this.counter}`,
      };
      this.sends.push({
        message,
        from: opts.from,
        result,
        idempotencyKey: opts.idempotencyKey ?? null,
        sentAt: new Date().toISOString(),
      });
      return result;
    });
  }

  verifyWebhook(): boolean {
    return true;
  }

  parseWebhookEvents(rawBody: string): EmailWebhookEvent[] {
    try {
      const parsed = JSON.parse(rawBody);
      return Array.isArray(parsed) ? (parsed as EmailWebhookEvent[]) : [];
    } catch {
      return [];
    }
  }

  /** Synthesise a delivery event for a recorded send (tests). */
  synthesiseEvent(
    providerMessageId: string,
    type: "delivered" | "bounce" | "open" | "click" | "unsubscribe"
  ): EmailWebhookEvent {
    const send = this.sends.find(
      (s) => s.result.providerMessageId === providerMessageId
    );
    return {
      type,
      providerEventId: `mock-event-${++this.counter}`,
      providerMessageId,
      email: send?.message.to ?? null,
      sendId: send?.message.customArgs?.send_id
        ? Number(send.message.customArgs.send_id)
        : null,
      reason: type === "bounce" ? "Mock bounce" : null,
      url: null,
      occurredAt: new Date().toISOString(),
      raw: null,
    };
  }

  reset(): void {
    this.sends.length = 0;
    this.counter = 0;
  }
}
