import { describe, expect, it } from "vitest";
import {
  MobileMessageProvider,
  syntheticInboundMessageId,
} from "../mobile-message-provider";

const provider = new MobileMessageProvider({
  username: "test",
  password: "test",
});

describe("MobileMessageProvider.parseWebhook", () => {
  it("maps inbound sender → from and synthesises a stable message id", () => {
    const payload = {
      to: "61485900133",
      message: "5",
      sender: "61428436924",
      received_at: "2026-08-12 00:24:27",
      type: "inbound",
      original_message_id: "3ca7ebc7-adc8-4d39-a05c-b718fa15b012",
      original_custom_ref: "survey-19",
    };
    const event = provider.parseWebhook(JSON.stringify(payload));
    const expectedId = syntheticInboundMessageId({
      to: payload.to,
      from: payload.sender,
      body: payload.message,
      receivedAt: payload.received_at,
      originalMessageId: payload.original_message_id,
    });
    expect(event).toMatchObject({
      type: "inbound",
      from: "61428436924",
      to: "61485900133",
      body: "5",
      providerMessageId: expectedId,
      originalMessageId: "3ca7ebc7-adc8-4d39-a05c-b718fa15b012",
      originalCustomRef: "survey-19",
    });
    // Retries with the same payload must collapse to the same id.
    expect(provider.parseWebhook(JSON.stringify(payload))).toMatchObject({
      providerMessageId: expectedId,
    });
  });

  it("prefers from when both from and sender are present", () => {
    const event = provider.parseWebhook(
      JSON.stringify({
        type: "inbound",
        from: "61411111111",
        sender: "61422222222",
        to: "61485900133",
        message: "yes",
      }),
    );
    expect(event).toMatchObject({ type: "inbound", from: "61411111111" });
  });

  it("maps unsubscribe sender → from", () => {
    const event = provider.parseWebhook(
      JSON.stringify({
        type: "unsubscribe",
        sender: "61428436924",
        to: "61485900133",
      }),
    );
    expect(event).toMatchObject({
      type: "unsubscribe",
      from: "61428436924",
      to: "61485900133",
    });
  });
});

/**
 * Delivery receipts produced no `sms_delivery_events` rows in production
 * while inbound worked, so the status leg is parsed defensively: the
 * documented shape, the plausible key/label variants, and a shape-based
 * fallback. Every case below must yield a status event — anything that
 * returns "unknown" is dropped by the route and reads as 0% delivered.
 */
describe("MobileMessageProvider.parseWebhook — delivery status", () => {
  it("parses the documented status shape", () => {
    const event = provider.parseWebhook(
      JSON.stringify({
        type: "status",
        message_id: "3ca7ebc7-adc8-4d39-a05c-b718fa15b012",
        custom_ref: "42",
        status: "delivered",
        occurred_at: "2026-08-12 00:24:27",
      }),
    );
    expect(event).toEqual({
      type: "status",
      providerMessageId: "3ca7ebc7-adc8-4d39-a05c-b718fa15b012",
      customRef: "42",
      status: "delivered",
      occurredAt: "2026-08-12 00:24:27",
    });
  });

  it.each([
    "delivery",
    "delivery_report",
    "delivery_receipt",
    "delivery_status",
    "dlr",
    "receipt",
    "status_update",
    "STATUS",
  ])("treats type %s as a delivery receipt", (type) => {
    const event = provider.parseWebhook(
      JSON.stringify({ type, message_id: "abc", status: "delivered" }),
    );
    expect(event).toMatchObject({
      type: "status",
      providerMessageId: "abc",
      status: "delivered",
    });
  });

  it("reads alternative field spellings for id, ref, status and time", () => {
    const event = provider.parseWebhook(
      JSON.stringify({
        type: "dlr",
        id: "msg-7",
        reference: "99",
        delivery_status: "DELIVRD",
        timestamp: "2026-08-12T00:24:27Z",
      }),
    );
    expect(event).toEqual({
      type: "status",
      providerMessageId: "msg-7",
      customRef: "99",
      status: "delivered",
      occurredAt: "2026-08-12T00:24:27Z",
    });
  });

  it.each([
    ["submitted", "sent"],
    ["undeliverable", "failed"],
    ["rejected", "failed"],
    ["expired", "failed"],
    ["Failed", "failed"],
    ["queued", "pending"],
    ["canceled", "cancelled"],
  ])("maps carrier status %s to %s", (raw, expected) => {
    const event = provider.parseWebhook(
      JSON.stringify({ type: "status", message_id: "x", status: raw }),
    );
    expect(event).toMatchObject({ status: expected });
  });

  it("infers a delivery receipt when the type discriminator is absent", () => {
    const event = provider.parseWebhook(
      JSON.stringify({
        message_id: "abc",
        status: "delivered",
        to: "61428436924",
      }),
    );
    expect(event).toMatchObject({
      type: "status",
      providerMessageId: "abc",
      status: "delivered",
    });
  });

  it("parses the documented MM status payload (body present, no type)", () => {
    // Live status webhooks look like this: no `type`, original SMS in
    // `message`, sender id, status + message_id. Must not be inbound.
    const event = provider.parseWebhook(
      JSON.stringify({
        to: "61412345678",
        message: "Hello, this is message 1",
        sender: "Mobile MSG",
        custom_ref: "tracking001",
        status: "delivered",
        message_id: "044b035f-0396-4a47-8428-12d5273ab04a",
        received_at: "2024-09-30 14:35:00",
        part_number: 1,
        total_parts: 1,
      }),
    );
    expect(event).toEqual({
      type: "status",
      providerMessageId: "044b035f-0396-4a47-8428-12d5273ab04a",
      customRef: "tracking001",
      status: "delivered",
      occurredAt: "2024-09-30 14:35:00",
    });
  });

  it("infers inbound — not status — when the payload carries a body", () => {
    // A reply whose body happens to be a status word must never be
    // mistaken for a receipt; the body is the discriminator.
    const event = provider.parseWebhook(
      JSON.stringify({
        sender: "61428436924",
        to: "61485900133",
        message: "delivered",
      }),
    );
    expect(event).toMatchObject({ type: "inbound", body: "delivered" });
  });

  it("leaves genuinely ambiguous payloads unknown", () => {
    expect(
      provider.parseWebhook(JSON.stringify({ foo: "bar" })),
    ).toMatchObject({ type: "unknown" });
    // A status value we cannot map is not enough to claim a receipt.
    expect(
      provider.parseWebhook(
        JSON.stringify({ message_id: "abc", status: "weird-carrier-code" }),
      ),
    ).toMatchObject({ type: "unknown" });
  });
});
