/**
 * Inbound addresses for weekly membership files vs campaign-template
 * forwards. Both can live on the same Resend receiving domain
 * (mail.oa.uconstruct.app); routing is by the To: local-part once a
 * dedicated membership inbox is configured.
 */

export const DEFAULT_TEMPLATES_INBOX = "templates@mail.oa.uconstruct.app";

export function templatesInbox(): string {
  return process.env.NEXT_PUBLIC_TEMPLATES_INBOX?.trim() || DEFAULT_TEMPLATES_INBOX;
}

export function membershipUpdateInbox(): string {
  return (
    process.env.MEMBERSHIP_UPDATE_INBOX?.trim() ||
    process.env.NEXT_PUBLIC_MEMBERSHIP_UPDATE_INBOX?.trim() ||
    DEFAULT_TEMPLATES_INBOX
  );
}

/** "Name <addr@host>" / spaces / case → addr@host */
export function normaliseInboxAddress(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const angled = trimmed.match(/<([^>]+)>/);
  return (angled?.[1] ?? trimmed).replace(/^mailto:/, "").trim();
}

export function recipientsIncludeInbox(
  to: string[] | string | null | undefined,
  inbox: string
): boolean {
  const target = normaliseInboxAddress(inbox);
  if (!target) return false;
  const list = Array.isArray(to) ? to : to ? [to] : [];
  return list.some((addr) => normaliseInboxAddress(addr) === target);
}

/**
 * Once NEXT_PUBLIC_MEMBERSHIP_UPDATE_INBOX is a different address from
 * the templates inbox, only mail To: that address is filed as a weekly
 * update. While they still share templates@, filename routing stays on
 * so existing forwards keep working.
 */
export function hasDedicatedMembershipInbox(): boolean {
  return normaliseInboxAddress(membershipUpdateInbox()) !== normaliseInboxAddress(templatesInbox());
}

export function shouldFileAsMembershipUpdate(to: string[] | string | null | undefined): boolean {
  if (!hasDedicatedMembershipInbox()) return true;
  return recipientsIncludeInbox(to, membershipUpdateInbox());
}
