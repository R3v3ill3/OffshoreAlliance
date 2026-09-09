"use client";

// WP1.3 — the Needs attention list and the deferred role-check probes.
//
// `NeedsAttentionList` renders whatever `buildNeedsAttention()` decided (pure,
// tested). `RoleCheckProbe` is the one expensive source handled honestly:
// there is no role-check count endpoint — `useRoleCheckCount` shares its key
// and whole payload with `RoleCheckTab`, and /api/campaigns/[id]/role-check
// runs five sequential queries to produce a number. So the probes are
// mounted only after `mine` has resolved, capped at six campaigns, and
// nothing on the page waits for them: items appear as they land and the
// pure builder keeps the order deterministic. The fix is a real count
// endpoint (WP1.6 or later).

import { useEffect } from "react";
import Link from "next/link";
import { Mail, Phone, UserCheck, Users } from "lucide-react";
import { useRoleCheckCount } from "@/components/campaigns/role-check-tab";
import type { NeedsAttentionItem, NeedsAttentionKind } from "@/lib/campaign/needs-attention";

export const MAX_ROLE_CHECK_PROBES = 6;

const KIND_ICON: Record<NeedsAttentionKind, typeof Users> = {
  pending_review: Users,
  role_check: UserCheck,
  phone_resume: Phone,
  email_resume: Mail,
};

export function NeedsAttentionList({ items }: { items: readonly NeedsAttentionItem[] }) {
  // N7 — no heading for an empty list.
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="needs-attention-heading" className="space-y-3">
      <h2 id="needs-attention-heading" className="text-lg font-semibold">
        Needs attention
      </h2>
      <ul className="divide-y rounded-xl border bg-card">
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind];
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-muted-foreground"> — {item.campaignName}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RoleCheckProbeItem({
  campaignId,
  onCount,
}: {
  campaignId: number;
  onCount: (campaignId: number, count: number) => void;
}) {
  // One retry, not the client default: a hint nobody waits on must not
  // re-run a five-query endpoint three times on a bad connection.
  const { data } = useRoleCheckCount(campaignId, { retry: 1 });
  useEffect(() => {
    if (data != null) onCount(campaignId, data);
  }, [campaignId, data, onCount]);
  return null;
}

/** Invisible. Mount only once `mine` has resolved. */
export function RoleCheckProbe({
  campaignIds,
  onCount,
}: {
  campaignIds: readonly number[];
  onCount: (campaignId: number, count: number) => void;
}) {
  return (
    <>
      {campaignIds.slice(0, MAX_ROLE_CHECK_PROBES).map((id) => (
        <RoleCheckProbeItem key={id} campaignId={id} onCount={onCount} />
      ))}
    </>
  );
}
