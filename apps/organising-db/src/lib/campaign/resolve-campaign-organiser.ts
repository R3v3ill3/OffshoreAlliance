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
 * Creates an organisers row + links user_profiles when needed (self or admin).
 */
export async function resolveCampaignOrganiserId(
  supabase: SupabaseClient,
  pickerValue: string,
  options: { currentUserId: string; isAdmin: boolean }
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

  if (targetUserId !== options.currentUserId && !options.isAdmin) {
    throw new Error(
      "This team member does not have an organiser record yet. Only an admin can assign them until they are linked under Administration, or they can be selected after linking."
    );
  }

  const name = (target.display_name || "Staff").trim().slice(0, 100) || "Staff";
  const { data: created, error: insErr } = await supabase
    .from("organisers")
    .insert({ organiser_name: name, is_active: true })
    .select("organiser_id")
    .single();

  if (insErr) throw insErr;

  const oid = created.organiser_id as number;
  const { error: upErr } = await supabase
    .from("user_profiles")
    .update({ organiser_id: oid })
    .eq("user_id", targetUserId);

  if (upErr) throw upErr;

  return oid;
}
