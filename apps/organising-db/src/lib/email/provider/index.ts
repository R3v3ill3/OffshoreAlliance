import { createAdminClient } from "@/lib/supabase/admin";
import { SendGridProvider } from "./sendgrid-provider";
import { MockEmailProvider } from "./mock-provider";
import type { EmailProvider, EmailSenderIdentity } from "./types";

export * from "./types";
export { SendGridProvider } from "./sendgrid-provider";
export { MockEmailProvider } from "./mock-provider";

const SETTINGS_KEYS = [
  "email_provider",
  "sendgrid_api_key",
  "sendgrid_webhook_public_key",
  "email_from_address",
  "email_from_name",
  "email_reply_to",
] as const;

// Module-level singleton so dev/test code inspecting recorded sends sees
// the same instance the app used (the MockSmsProvider pattern).
let mockProvider: MockEmailProvider | null = null;

export function getMockEmailProvider(): MockEmailProvider {
  if (!mockProvider) mockProvider = new MockEmailProvider();
  return mockProvider;
}

async function loadSettings(): Promise<Record<string, string>> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_settings")
      .select("key, value")
      .in("key", [...SETTINGS_KEYS]);
    return Object.fromEntries(
      (data ?? []).map((r: { key: string; value: string | null }) => [
        r.key,
        r.value ?? "",
      ])
    );
  } catch {
    // No admin client (e.g. local tooling) — env fallback still applies.
    return {};
  }
}

/**
 * Resolve the configured email provider.
 *
 * Credential source of truth is `app_settings` (admin-managed) with env
 * fallback — the SMS provider pattern. Falls back to the mock provider
 * when nothing is configured; throws when `sendgrid` is explicitly
 * selected but the API key is missing.
 */
export async function getEmailProvider(): Promise<EmailProvider> {
  const settings = await loadSettings();

  const provider = settings.email_provider || process.env.EMAIL_PROVIDER || "";
  const apiKey = settings.sendgrid_api_key || process.env.SENDGRID_API_KEY || "";

  if (provider === "sendgrid") {
    if (!apiKey) {
      throw new Error(
        "SendGrid API key not configured — set it in Administration → Settings"
      );
    }
    return new SendGridProvider({
      apiKey,
      webhookPublicKey:
        settings.sendgrid_webhook_public_key ||
        process.env.SENDGRID_WEBHOOK_PUBLIC_KEY ||
        undefined,
    });
  }

  if (provider && provider !== "mock") {
    console.warn(
      `Unknown email_provider value "${provider}" — falling back to mock provider`
    );
  }
  return getMockEmailProvider();
}

/**
 * The platform sender identity (from / reply-to). Throws when the from
 * address is not configured — callers surface that as a setup error
 * rather than sending from a bogus identity.
 */
export async function getEmailSenderIdentity(): Promise<EmailSenderIdentity> {
  const settings = await loadSettings();
  const fromEmail =
    settings.email_from_address || process.env.EMAIL_FROM_ADDRESS || "";
  if (!fromEmail) {
    throw new Error(
      "Platform email from-address not configured — set it in Administration → Settings"
    );
  }
  return {
    fromEmail,
    fromName:
      settings.email_from_name ||
      process.env.EMAIL_FROM_NAME ||
      "Offshore Alliance",
    replyTo: settings.email_reply_to || process.env.EMAIL_REPLY_TO || fromEmail,
  };
}
