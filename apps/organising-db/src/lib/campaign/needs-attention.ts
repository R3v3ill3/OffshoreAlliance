// WP1.3 — the Needs attention list, pure.
//
// Items come from the existing pending-review and role-check queues and the
// phone/email resume banners (plan 5.3). No SMS item exists: `SmsResumeBanner`
// is a stub until the SMS module's Phase 10 and nothing is invented here.
// The hook fetches; this file decides what to show, in what order, with
// which link — so the list cannot reshuffle as the deferred role-check probes
// land, and never points at a campaign the user cannot see.

import {
  emailResumeHref,
  phoneResumeHref,
  type EmailResumeRow,
  type PhoneResumeRow,
} from "./resume-links";

export type NeedsAttentionKind = "pending_review" | "role_check" | "phone_resume" | "email_resume";

export interface NeedsAttentionItem {
  /** N8 — stable across refetches so React does not remount rows. */
  key: string;
  kind: NeedsAttentionKind;
  campaignId: number;
  campaignName: string;
  label: string;
  href: string;
  count?: number;
}

export interface NeedsAttentionInput {
  campaigns: readonly { campaign_id: number; name: string }[];
  pendingReview: readonly { campaign_id: number }[];
  roleCheckCounts: ReadonlyMap<number, number>;
  phoneActions: readonly PhoneResumeRow[];
  emailDrafts: readonly (EmailResumeRow & { subject: string | null })[];
}

/** The exact string `pending-review-widget.tsx` links to. */
export function pendingReviewHref(campaignId: number): string {
  return `/campaigns/${campaignId}?tab=plan&sub=pending-review`;
}

/** `plan` is a VALID_TABS entry and `role-check` is an existing TabsContent value. */
export function roleCheckHref(campaignId: number): string {
  return `/campaigns/${campaignId}?tab=plan&sub=role-check`;
}

const KIND_ORDER: Record<NeedsAttentionKind, number> = {
  phone_resume: 0,
  email_resume: 1,
  pending_review: 2,
  role_check: 3,
};

function itemKey(kind: NeedsAttentionKind, campaignId: number, id?: number): string {
  return `${kind}:${campaignId}:${id ?? ""}`;
}

export function buildNeedsAttention(input: NeedsAttentionInput): NeedsAttentionItem[] {
  // N5 — rows outside `campaigns` are dropped, whatever the cache says.
  const nameById = new Map(input.campaigns.map((c) => [c.campaign_id, c.name]));
  const items: NeedsAttentionItem[] = [];

  // N3 — one item per in-progress phone action.
  for (const a of input.phoneActions) {
    const name = nameById.get(a.campaign_id);
    if (name == null) continue;
    items.push({
      key: itemKey("phone_resume", a.campaign_id, a.action_id),
      kind: "phone_resume",
      campaignId: a.campaign_id,
      campaignName: name,
      label: "Finish the call action you started",
      href: phoneResumeHref(a),
    });
  }

  // N4 — one item per draft, subject appended when present.
  for (const d of input.emailDrafts) {
    const name = nameById.get(d.campaign_id);
    if (name == null) continue;
    const subject = d.subject?.trim();
    items.push({
      key: itemKey("email_resume", d.campaign_id, d.draft_id),
      kind: "email_resume",
      campaignId: d.campaign_id,
      campaignName: name,
      label: subject
        ? `Finish the email you started — "${subject}"`
        : "Finish the email you started",
      href: emailResumeHref(d),
    });
  }

  // N1 — pending review, grouped to one item per campaign.
  const pendingByCampaign = new Map<number, number>();
  for (const r of input.pendingReview) {
    if (!nameById.has(r.campaign_id)) continue;
    pendingByCampaign.set(r.campaign_id, (pendingByCampaign.get(r.campaign_id) ?? 0) + 1);
  }
  for (const [campaignId, n] of pendingByCampaign) {
    items.push({
      key: itemKey("pending_review", campaignId),
      kind: "pending_review",
      campaignId,
      campaignName: nameById.get(campaignId)!,
      label: n === 1 ? "1 person to review" : `${n} people to review`,
      href: pendingReviewHref(campaignId),
      count: n,
    });
  }

  // N2 — role check, only when the probe has landed with a count > 0.
  for (const [campaignId, n] of input.roleCheckCounts) {
    if (!(n > 0)) continue;
    const name = nameById.get(campaignId);
    if (name == null) continue;
    items.push({
      key: itemKey("role_check", campaignId),
      kind: "role_check",
      campaignId,
      campaignName: name,
      label: n === 1 ? "1 leader to check" : `${n} leaders to check`,
      href: roleCheckHref(campaignId),
      count: n,
    });
  }

  // N6 — resume items first, then pending review, then role check; within a
  // kind by campaign name, then key so equal names are still deterministic.
  items.sort((a, b) => {
    const k = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (k !== 0) return k;
    const n = a.campaignName.localeCompare(b.campaignName);
    if (n !== 0) return n;
    return a.key.localeCompare(b.key);
  });

  return items;
}
