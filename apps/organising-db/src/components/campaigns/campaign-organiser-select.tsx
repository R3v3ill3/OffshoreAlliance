"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  campaignOrganiserPickerValueForUser,
  defaultCampaignOrganiserPickerValue,
  staffOptionLabel,
  type StaffProfileRow,
} from "@/lib/campaign/resolve-campaign-organiser";

export function CampaignOrganiserSelect({
  id,
  label = "Campaign organiser",
  value,
  onChange,
  allowNone = true,
  autoDefaultToCurrentUser = true,
  /** Increment when the surrounding form is reset (e.g. dialog reopened) so default applies again. */
  resetKey = 0,
  showStaffHint = true,
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (v: string) => void;
  allowNone?: boolean;
  autoDefaultToCurrentUser?: boolean;
  resetKey?: number;
  showStaffHint?: boolean;
}) {
  const supabase = createClient();
  const { user, profile } = useAuth();
  const defaultedRef = useRef(false);

  useEffect(() => {
    defaultedRef.current = false;
  }, [resetKey]);

  const { data: staff = [] } = useQuery({
    queryKey: ["user-profiles-staff-organiser-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("user_id, display_name, work_role, organiser_id, role")
        .in("role", ["admin", "user"])
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as StaffProfileRow[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!autoDefaultToCurrentUser || defaultedRef.current || !user || !profile) return;
    if (value !== "" && value !== "__none__") return;
    defaultedRef.current = true;
    onChange(defaultCampaignOrganiserPickerValue(profile, user.id));
  }, [autoDefaultToCurrentUser, user, profile, value, onChange]);

  return (
    <div className="space-y-2">
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <Select value={value || (allowNone ? "__none__" : undefined)} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select organiser" />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="__none__">None</SelectItem>}
          {staff.map((row) => (
            <SelectItem key={row.user_id} value={campaignOrganiserPickerValueForUser(row.user_id)}>
              {staffOptionLabel(row)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showStaffHint ? (
        <p className="text-xs text-muted-foreground">
          All staff accounts are listed. The campaign record still uses an organiser entry; one is created
          automatically for you when needed.
        </p>
      ) : null}
    </div>
  );
}
