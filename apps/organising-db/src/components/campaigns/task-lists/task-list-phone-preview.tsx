"use client";

/**
 * Mobile-phone frame preview of the leader webform.
 *
 * Used when editing a task list so organisers can see how title, instructions,
 * membership ask, activity, and workers will appear on the leader's phone.
 * This is a read-only mock — it does not load a live tokenised webform.
 */

import { Badge } from "@/components/ui/badge";

export type PhonePreviewWorker = {
  worker_id: number;
  first_name: string;
  last_name: string;
  occupation?: string | null;
};

export type TaskListPhonePreviewProps = {
  campaignName: string | null;
  title: string;
  leaderInstructions: string;
  activityTitle: string | null;
  includeMembershipAsk: boolean;
  workers: PhonePreviewWorker[];
  className?: string;
};

export function TaskListPhonePreview({
  campaignName,
  title,
  leaderInstructions,
  activityTitle,
  includeMembershipAsk,
  workers,
  className,
}: TaskListPhonePreviewProps) {
  const displayTitle = title.trim() || "Untitled task list";
  const previewWorkers = workers.slice(0, 6);
  const overflow = Math.max(0, workers.length - previewWorkers.length);

  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground mb-2 text-center">
        Leader phone preview
      </p>
      <div
        className="mx-auto w-[280px] rounded-[2rem] border-[10px] border-zinc-800 bg-zinc-800 shadow-xl"
        aria-label="Mobile phone preview of the leader form"
      >
        {/* Notch */}
        <div className="relative bg-zinc-800 pb-1 pt-2">
          <div className="mx-auto h-4 w-24 rounded-full bg-zinc-950" />
        </div>

        <div className="h-[480px] overflow-y-auto rounded-b-[1.25rem] bg-background text-foreground">
          {/* Video placeholder — mirrors the leader webform header */}
          <div className="aspect-video max-h-28 w-full bg-gradient-to-br from-zinc-900 via-zinc-800 to-amber-900/40 flex items-center justify-center">
            <span className="text-[10px] uppercase tracking-wider text-zinc-400">
              Intro video
            </span>
          </div>

          <div className="space-y-3 px-3 py-3">
            {leaderInstructions.trim() ? (
              <div className="rounded-md border bg-muted/30 px-2.5 py-2 text-[11px] leading-snug whitespace-pre-wrap">
                {leaderInstructions}
              </div>
            ) : (
              <div className="rounded-md border border-dashed px-2.5 py-2 text-[11px] text-muted-foreground italic">
                No instructions for the leader yet
              </div>
            )}

            <header className="space-y-0.5">
              <h2 className="text-sm font-bold leading-tight">{displayTitle}</h2>
              {campaignName ? (
                <p className="text-[11px] text-muted-foreground">{campaignName}</p>
              ) : null}
              {activityTitle ? (
                <p className="text-[11px] font-medium pt-0.5">
                  {activityTitle}
                  <Badge variant="secondary" className="ml-1.5 align-middle text-[9px] px-1 py-0">
                    Assessment
                  </Badge>
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">
                  No assessment linked
                </p>
              )}
            </header>

            {includeMembershipAsk ? (
              <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[10px] text-emerald-800 dark:text-emerald-300">
                Membership ask column enabled
              </div>
            ) : null}

            <div className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-[11px] font-medium">
              0 / {workers.length} assessed
            </div>

            <div className="space-y-1.5">
              {previewWorkers.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic py-2">
                  No workers on this list yet
                </p>
              ) : (
                previewWorkers.map((w) => (
                  <div
                    key={w.worker_id}
                    className="rounded-lg border px-2.5 py-2 flex items-center gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold truncate">
                        {w.first_name} {w.last_name}
                      </div>
                      {w.occupation ? (
                        <div className="text-[10px] text-muted-foreground truncate">
                          {w.occupation}
                        </div>
                      ) : null}
                    </div>
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
                      —
                    </span>
                  </div>
                ))
              )}
              {overflow > 0 ? (
                <p className="text-[10px] text-muted-foreground text-center py-1">
                  +{overflow} more worker{overflow === 1 ? "" : "s"}
                </p>
              ) : null}
            </div>

            <div className="pt-1 pb-2">
              <div className="w-full rounded-md bg-primary px-3 py-2 text-center text-[11px] font-medium text-primary-foreground">
                Submit
              </div>
            </div>
          </div>
        </div>

        {/* Home indicator */}
        <div className="bg-zinc-800 py-2">
          <div className="mx-auto h-1 w-16 rounded-full bg-zinc-600" />
        </div>
      </div>
    </div>
  );
}
