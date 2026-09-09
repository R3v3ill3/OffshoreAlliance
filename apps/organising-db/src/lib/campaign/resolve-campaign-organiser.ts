import type { SupabaseClient } from "@supabase/supabase-js";

export const CAMPAIGN_ORGANISER_USER_PREFIX = "user:";

/** Select value for "assigned to this staff member" (stable; resolves to organisers row on save). */
export function campaignOrganiserPickerValueForUser(userId: string): string {
  return `${CAMPAIGN_ORGANISER_USER_PREFIX}${userId}`;
}

/** Default picker value for the signed-in account. */
export function defaultCampaignOrganiserPickerValue(
  profile: { organiser_id: number | null } | null | undefined,
  userId: string
): string {
  return campaignOrganiserPickerValueForUser(userId);
}

function formatWorkRole(role: string | null | undefined): string {
  if (!role) return "";
  return role.replace(/_/g, " ");
}

export type StaffProfileRow = {
  user_id: string;
  display_name: string;
  work_role: string | null;
  organiser_id: number | null;
  role: string;
};

export function staffOptionLabel(row: StaffProfileRow): string {
  const wr = formatWorkRole(row.work_role);
  return wr ? `${row.display_name} (${wr})` : row.display_name;
}

/**
 * Turn a campaign organiser picker value into campaigns.organiser_id (FK).
 *
 * When the target staff member has no organisers row yet, one is minted and
 * linked through the `link_organiser_for_profile` RPC (WP1.6). The RPC is the
 * authority — it allows self, admins and lead/coordinator work roles
 * (decision 8) — and `canLinkOtherOrganisers` is only the client-side
 * pre-check that gives a friendlier message. The client can no longer write
 * `user_profiles.organiser_id` directly: the WP1.6 privileged-column guard
 * rejects that for non-admins.
 */
export async function resolveCampaignOrganiserId(
  supabase: SupabaseClient,
  pickerValue: string,
  options: { currentUserId: string; canLinkOtherOrganisers: boolean }
): Promise<number | null> {
  if (!pickerValue || pickerValue === "__none__") return null;

  let targetUserId: string;
  if (pickerValue.startsWith(CAMPAIGN_ORGANISER_USER_PREFIX)) {
    targetUserId = pickerValue.slice(CAMPAIGN_ORGANISER_USER_PREFIX.length);
  } else {
    const n = Number(pickerValue);
    if (!Number.isFinite(n)) return null;
    const { data: byOrg } = await supabase
      .from("user_profiles")
      .select("user_id")
      .eq("organiser_id", n)
      .limit(1)
      .maybeSingle();
    if (byOrg?.user_id) {
      targetUserId = byOrg.user_id as string;
    } else {
      return n;
    }
  }

  const { data: target, error } = await supabase
    .from("user_profiles")
    .select("display_name, organiser_id")
    .eq("user_id", targetUserId)
    .single();

  if (error || !target) {
    throw new Error("Could not load staff profile for organiser assignment.");
  }

  if (target.organiser_id != null) {
    return target.organiser_id as number;
  }

  if (targetUserId !== options.currentUserId && !options.canLinkOtherOrganisers) {
    throw new Error(
      "This team member does not have an organiser record yet. An admin or lead organiser can link them under Administration; after that anyone can select them."
    );
  }

  // SECURITY DEFINER RPC: creates the organisers row and links
  // user_profiles.organiser_id in one step, under the database's own gate.
  const { data: linked, error: linkErr } = await supabase.rpc("link_organiser_for_profile", {
    p_user_id: targetUserId,
  });

  if (linkErr) {
    if (typeof linkErr.message === "string" && linkErr.message.includes("not_authorized")) {
      throw new Error(
        "This team member does not have an organiser record yet. An admin or lead organiser can link them under Administration; after that anyone can select them."
      );
    }
    throw linkErr;
  }

  const oid = Number(linked);
  if (!Number.isFinite(oid)) {
    throw new Error("Could not link an organiser record for this staff member.");
  }

  return oid;
}
