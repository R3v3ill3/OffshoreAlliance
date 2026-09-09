// WP1.3 — where an in-progress phone action or email draft resumes, pure.
//
// These two switches used to live inline in `ResumeBanner.tsx` and
// `EmailResumeBanner.tsx`. Both banners and the My campaigns Needs-attention
// list now call them, so the three surfaces cannot emit different URLs, and
// every branch has a test.

import type { EmailEntryBranch } from "@/types/email-action";
import type { EntryBranch as PhoneEntryBranch } from "@/types/phone-call-action";

export interface PhoneResumeRow {
  campaign_id: number;
  action_id: number;
  entry_branch: PhoneEntryBranch | null;
  script_id: number | null;
  list_ids: number[] | null;
}

export interface EmailResumeRow {
  campaign_id: number;
  draft_id: number;
  entry_branch: EmailEntryBranch | null;
  email_list_id: number | null;
}

export function phoneResumeHref(a: PhoneResumeRow): string {
  const { campaign_id: cid, action_id, entry_branch, script_id, list_ids } = a;
  const lid = Array.isArray(list_ids) ? list_ids[0] : undefined;

  switch (entry_branch) {
    case "script_first":
      return script_id
        ? `/campaigns/phone-wizard?campaign_id=${cid}&action_id=${action_id}&script_id=${script_id}`
        : `/campaigns/phone-wizard?campaign_id=${cid}&action_id=${action_id}`;
    case "list_first":
      return `/campaigns/${cid}/phone/lists/new?action_id=${action_id}`;
    case "assessment_first":
      return `/campaigns/${cid}/phone/assessment-setup?action_id=${action_id}`;
    case "assessment_list_first":
      return `/campaigns/${cid}/phone/lists/new?action_id=${action_id}&pathway=assessment_only`;
    case "build_list":
      // Wall-chart Build List Fire: the call list is already created and
      // linked. Resume on the list management page so the user can attach a
      // script and start dialling.
      if (lid != null) return `/campaigns/${cid}/phone/lists/${lid}?action_id=${action_id}`;
      return `/campaigns/${cid}/phone`;
    default:
      // Unknown branch values fall through to the Phone Ops tab so the user
      // at least sees their session listed.
      return `/campaigns/${cid}/phone`;
  }
}

export function emailResumeHref(d: EmailResumeRow): string {
  const { campaign_id: cid, draft_id, entry_branch, email_list_id } = d;

  switch (entry_branch) {
    case "ai_first":
    case "paste_first":
      // Setup-first: the draft exists but the body may still be empty.
      return `/campaigns/${cid}/email/wizard?draft_id=${draft_id}&entry_branch=${entry_branch}`;
    case "ai_list_first":
    case "paste_list_first":
      // List-first: if the list is not built yet, back to lists/new.
      if (email_list_id == null) {
        return `/campaigns/${cid}/email/lists/new?draft_id=${draft_id}&entry_branch=${entry_branch}`;
      }
      return `/campaigns/${cid}/email/wizard?draft_id=${draft_id}&entry_branch=${entry_branch}`;
    case "build_list":
      // Build-list fire: the email_list is already attached.
      return `/campaigns/${cid}/email/wizard?draft_id=${draft_id}&entry_branch=build_list`;
    default:
      return `/campaigns/${cid}`;
  }
}
