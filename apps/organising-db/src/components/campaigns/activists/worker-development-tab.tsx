"use client";

/**
 * "Development" tab inside the shared WorkerDetailSheet: the worker's
 * activist register profile (or an add-to-register affordance) and
 * their 4A task history for this campaign.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import {
  ACTIVIST_PROFILE_SOURCES,
  ACTIVIST_TASK_STATUSES,
  FOUR_A_STAGES,
  ladderRungFor,
} from "@/lib/campaign/activist-constants";
import {
  useActivistProfile,
  useActivistTasks,
  useCreateActivistProfile,
} from "./use-activist-data";
import { ActivistProfileDialog } from "./activist-profile-dialog";
import { useActivistRegister } from "./use-activist-data";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}

export function WorkerDevelopmentTab({
  campaignId,
  workerId,
  canWrite,
}: {
  campaignId: string;
  workerId: number;
  canWrite: boolean;
}) {
  const { data: profile, isLoading } = useActivistProfile(campaignId, workerId);
  const { data: tasks = [] } = useActivistTasks(campaignId, workerId);
  const { data: registerRows = [] } = useActivistRegister(campaignId);
  const createMutation = useCreateActivistProfile(campaignId);
  const [editOpen, setEditOpen] = useState(false);

  const registerRow =
    registerRows.find((r) => r.worker_id === workerId) ?? null;

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <EurekaLoadingSpinner />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-3 py-4">
        <p className="text-sm text-muted-foreground">
          Not on the activist register for this campaign.
        </p>
        {canWrite && (
          <Button
            size="sm"
            onClick={() => createMutation.mutate(workerId)}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Adding…" : "Add to activist register"}
          </Button>
        )}
      </div>
    );
  }

  const stage = FOUR_A_STAGES.find((s) => s.value === profile.four_a_stage);
  const rung = ladderRungFor(profile.current_rung);
  const source = ACTIVIST_PROFILE_SOURCES[profile.source ?? "manual"];

  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{stage?.label ?? profile.four_a_stage}</Badge>
          {rung && <Badge variant="outline">{rung.shortLabel}</Badge>}
          {source?.auto && <Badge variant="secondary">{source.label}</Badge>}
          {profile.is_archived && <Badge variant="outline">Archived</Badge>}
        </div>
        {canWrite && registerRow && (
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            Edit profile
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Domain" value={profile.domain} />
        <Field label="Identified via" value={profile.identified_via} />
        <Field label="Recruited by" value={profile.recruited_by_text} />
        <Field label="Recruited on" value={profile.recruited_at} />
        <Field label="Last contact" value={profile.last_contact_date} />
        <Field label="Next contact" value={profile.next_contact_date} />
      </div>

      <div className="space-y-3">
        <Field
          label="Followers test — who moves when they move?"
          value={profile.followers_evidence}
        />
        <Field label="SKAB / training needs" value={profile.skab_notes} />
        {profile.notes && <Field label="Notes" value={profile.notes} />}
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          4A task history ({tasks.length})
        </p>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => {
              const statusLabel =
                ACTIVIST_TASK_STATUSES.find((s) => s.value === t.status)?.label ??
                t.status;
              return (
                <li key={t.activist_task_id} className="rounded-md border p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug">
                      {t.responsibility}
                    </p>
                    <Badge variant="outline" className="shrink-0">
                      {statusLabel}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      t.rung ? `Rung ${t.rung}` : null,
                      t.due_date ? `due ${t.due_date}` : null,
                      t.outcome ? `outcome: ${t.outcome}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ActivistProfileDialog
        campaignId={campaignId}
        row={registerRow}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </div>
  );
}
