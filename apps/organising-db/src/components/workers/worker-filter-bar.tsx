"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, ListFilter } from "lucide-react";

export interface WorkerFilters {
  worksite_id: number | null;
  employer_id: number | null;
  union_membership_type_id: number | null;
  member_role_type_id: number | null;
  campaign_id: number | null;
  is_active: boolean | null;
}

export const EMPTY_FILTERS: WorkerFilters = {
  worksite_id: null,
  employer_id: null,
  union_membership_type_id: null,
  member_role_type_id: null,
  campaign_id: null,
  is_active: null,
};

interface WorkerFilterBarProps {
  filters: WorkerFilters;
  onChange: (filters: WorkerFilters) => void;
}

export function WorkerFilterBar({ filters, onChange }: WorkerFilterBarProps) {
  const supabase = createClient();
  const { user } = useAuth();

  const { data: employers = [] } = useQuery({
    queryKey: ["filter-employers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("employers")
        .select("employer_id, employer_name")
        .order("employer_name");
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: worksites = [] } = useQuery({
    queryKey: ["filter-worksites"],
    queryFn: async () => {
      const { data } = await supabase
        .from("worksites")
        .select("worksite_id, worksite_name")
        .order("worksite_name");
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: membershipTypes = [] } = useQuery({
    queryKey: ["filter-union-membership-types"],
    queryFn: async () => {
      const { data } = await supabase
        .from("union_membership_types")
        .select("id, display_name")
        .order("display_name");
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: roleTypes = [] } = useQuery({
    queryKey: ["filter-member-role-types"],
    queryFn: async () => {
      const { data } = await supabase
        .from("member_role_types")
        .select("role_type_id, display_name")
        .order("display_name");
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ["filter-campaigns"],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaigns")
        .select("campaign_id, campaign_name")
        .in("status", ["Active", "Planning"])
        .order("campaign_name");
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const set = (patch: Partial<WorkerFilters>) =>
    onChange({ ...filters, ...patch });

  const selectVal = (v: number | null) => (v != null ? String(v) : "__all__");
  const parseId = (v: string) => (v === "__all__" ? null : Number(v));

  const hasFilters = Object.values(filters).some((v) => v !== null);

  const activeLabels: { key: keyof WorkerFilters; label: string }[] = [];
  if (filters.employer_id != null) {
    const e = employers.find(
      (x: { employer_id: number }) => x.employer_id === filters.employer_id
    );
    if (e) activeLabels.push({ key: "employer_id", label: `Employer: ${(e as { employer_name: string }).employer_name}` });
  }
  if (filters.worksite_id != null) {
    const w = worksites.find(
      (x: { worksite_id: number }) => x.worksite_id === filters.worksite_id
    );
    if (w) activeLabels.push({ key: "worksite_id", label: `Worksite: ${(w as { worksite_name: string }).worksite_name}` });
  }
  if (filters.union_membership_type_id != null) {
    const m = membershipTypes.find(
      (x: { id: number }) => x.id === filters.union_membership_type_id
    );
    if (m) activeLabels.push({ key: "union_membership_type_id", label: `Membership: ${(m as { display_name: string }).display_name}` });
  }
  if (filters.member_role_type_id != null) {
    const r = roleTypes.find(
      (x: { role_type_id: number }) => x.role_type_id === filters.member_role_type_id
    );
    if (r) activeLabels.push({ key: "member_role_type_id", label: `Role: ${(r as { display_name: string }).display_name}` });
  }
  if (filters.campaign_id != null) {
    const c = campaigns.find(
      (x: { campaign_id: number }) => x.campaign_id === filters.campaign_id
    );
    if (c) activeLabels.push({ key: "campaign_id", label: `Campaign: ${(c as { campaign_name: string }).campaign_name}` });
  }
  if (filters.is_active != null) {
    activeLabels.push({
      key: "is_active",
      label: filters.is_active ? "Active" : "Inactive",
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <ListFilter className="h-4 w-4 text-muted-foreground shrink-0" />

        <Select
          value={selectVal(filters.employer_id)}
          onValueChange={(v) => set({ employer_id: parseId(v) })}
        >
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Employer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All employers</SelectItem>
            {employers.map((e: { employer_id: number; employer_name: string }) => (
              <SelectItem key={e.employer_id} value={String(e.employer_id)}>
                {e.employer_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectVal(filters.worksite_id)}
          onValueChange={(v) => set({ worksite_id: parseId(v) })}
        >
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Worksite" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All worksites</SelectItem>
            {worksites.map((w: { worksite_id: number; worksite_name: string }) => (
              <SelectItem key={w.worksite_id} value={String(w.worksite_id)}>
                {w.worksite_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectVal(filters.union_membership_type_id)}
          onValueChange={(v) => set({ union_membership_type_id: parseId(v) })}
        >
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Membership" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All types</SelectItem>
            {membershipTypes.map((m: { id: number; display_name: string }) => (
              <SelectItem key={m.id} value={String(m.id)}>
                {m.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectVal(filters.member_role_type_id)}
          onValueChange={(v) => set({ member_role_type_id: parseId(v) })}
        >
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All roles</SelectItem>
            {roleTypes.map((r: { role_type_id: number; display_name: string }) => (
              <SelectItem key={r.role_type_id} value={String(r.role_type_id)}>
                {r.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectVal(filters.campaign_id)}
          onValueChange={(v) => set({ campaign_id: parseId(v) })}
        >
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Campaign" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All campaigns</SelectItem>
            {campaigns.map((c: { campaign_id: number; campaign_name: string }) => (
              <SelectItem key={c.campaign_id} value={String(c.campaign_id)}>
                {c.campaign_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.is_active != null ? String(filters.is_active) : "__all__"}
          onValueChange={(v) => {
            if (v === "__all__") set({ is_active: null });
            else set({ is_active: v === "true" });
          }}
        >
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onChange(EMPTY_FILTERS)}
          >
            Clear all
            <X className="ml-1 h-3 w-3" />
          </Button>
        )}
      </div>

      {activeLabels.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {activeLabels.map(({ key, label }) => (
            <Badge
              key={key}
              variant="secondary"
              className="gap-1 cursor-pointer text-xs"
              onClick={() => set({ [key]: null })}
            >
              {label}
              <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
