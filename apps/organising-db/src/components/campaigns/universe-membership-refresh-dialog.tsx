"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { structureErrorMessage } from "@/lib/campaign/structure-error-message";
import {
  applyUniverseRefresh,
  loadUniverseRefreshReview,
  workerDisplayName,
  type NoEmployerAction,
  type NoEmployerChoice,
  type UniverseRefreshReview,
} from "@/lib/workers/refresh-campaign-universe-membership";
import { toast } from "sonner";

type DraftChoice = {
  action: NoEmployerAction | "";
  employerId: number | null;
};

function emptyChoice(defaultEmployerId: number | null): DraftChoice {
  return { action: "", employerId: defaultEmployerId };
}

function invalidateMembershipQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  campaignId: number
) {
  const cidStr = String(campaignId);
  queryClient.invalidateQueries({ queryKey: ["campaign-members-full", cidStr] });
  queryClient.invalidateQueries({ queryKey: ["campaign-members", cidStr] });
  queryClient.invalidateQueries({ queryKey: ["campaign-member-ids", cidStr] });
  queryClient.invalidateQueries({ queryKey: ["campaign-worker-ou", cidStr] });
  queryClient.invalidateQueries({ queryKey: ["campaign-list-builder-workers", campaignId] });
  queryClient.invalidateQueries({ queryKey: ["campaign-ou-coverage", cidStr] });
  queryClient.invalidateQueries({ queryKey: ["campaign-rating-summary", cidStr] });
  queryClient.invalidateQueries({ queryKey: ["campaign-settings", campaignId] });
  queryClient.invalidateQueries({ queryKey: ["campaign-settings-scope", campaignId] });
  queryClient.invalidateQueries({ queryKey: ["workers"] });
  queryClient.invalidateQueries({ queryKey: ["call-list-items"] });
}

export function UniverseMembershipRefreshDialog({
  campaignId,
  open,
  onOpenChange,
}: {
  campaignId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [choices, setChoices] = useState<Record<number, DraftChoice>>({});

  const reviewQuery = useQuery({
    queryKey: ["campaign-universe-refresh-review", campaignId],
    queryFn: () => loadUniverseRefreshReview(supabase, campaignId),
    enabled: open && Number.isFinite(campaignId),
  });

  const review = reviewQuery.data;
  const defaultEmployerId =
    review?.campaignEmployers.length === 1 ? review.campaignEmployers[0].employerId : null;

  useEffect(() => {
    if (!open || !review) return;
    const next: Record<number, DraftChoice> = {};
    for (const member of review.noEmployer) {
      next[member.workerId] = emptyChoice(defaultEmployerId);
    }
    setChoices(next);
  }, [open, review, defaultEmployerId]);

  const applyMutation = useAuthAwareMutation({
    mutationFn: async (noEmployerChoices: NoEmployerChoice[]) =>
      applyUniverseRefresh(supabase, { campaignId, noEmployerChoices }),
    onSuccess: (result) => {
      const bits = [];
      if (result.removed > 0) {
        bits.push(
          `${result.removed} worker${result.removed === 1 ? "" : "s"} removed`
        );
      }
      if (result.employersSet > 0) {
        bits.push(
          `${result.employersSet} worker${result.employersSet === 1 ? "" : "s"} set to the campaign employer`
        );
      }
      toast.success(bits.length > 0 ? bits.join(". ") + "." : "Membership already matches.");
      invalidateMembershipQueries(queryClient, campaignId);
      queryClient.removeQueries({ queryKey: ["campaign-universe-refresh-review", campaignId] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(structureErrorMessage(err, "Could not refresh campaign membership"));
    },
  });

  const planned = useMemo(() => {
    if (!review) return { ready: false, remove: 0, set: 0 };
    const noEmployerChoices: NoEmployerChoice[] = [];
    for (const member of review.noEmployer) {
      const draft = choices[member.workerId];
      if (!draft?.action) return { ready: false, remove: review.wrongEmployer.length, set: 0 };
      if (draft.action === "set_employer") {
        const employerId = draft.employerId ?? defaultEmployerId;
        if (employerId == null) return { ready: false, remove: review.wrongEmployer.length, set: 0 };
        noEmployerChoices.push({ workerId: member.workerId, action: "set_employer", employerId });
      } else {
        noEmployerChoices.push({ workerId: member.workerId, action: "remove" });
      }
    }
    const set = noEmployerChoices.filter((c) => c.action === "set_employer").length;
    const remove =
      review.wrongEmployer.length + noEmployerChoices.filter((c) => c.action === "remove").length;
    return { ready: true, remove, set, noEmployerChoices };
  }, [review, choices, defaultEmployerId]);

  const setAll = (action: NoEmployerAction, employerId: number | null) => {
    setChoices((prev) => {
      const next = { ...prev };
      for (const workerId of Object.keys(next)) {
        next[Number(workerId)] = { action, employerId };
      }
      return next;
    });
  };

  const nothingToDo =
    review != null &&
    !review.blockedReason &&
    review.wrongEmployer.length === 0 &&
    review.noEmployer.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Refresh campaign membership</DialogTitle>
          <DialogDescription>
            Uses the employers already saved on this campaign. Workers with another
            employer are removed. Workers with no employer stay until you choose
            remove or set their employer.
          </DialogDescription>
        </DialogHeader>

        {reviewQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Reviewing allocated workers…</p>
        ) : reviewQuery.isError ? (
          <p className="text-sm text-destructive">
            {reviewQuery.error instanceof Error
              ? reviewQuery.error.message
              : "Could not review campaign membership."}
          </p>
        ) : review ? (
          <ReviewBody
            review={review}
            choices={choices}
            defaultEmployerId={defaultEmployerId}
            nothingToDo={nothingToDo}
            onChoice={(workerId, next) =>
              setChoices((prev) => ({ ...prev, [workerId]: { ...prev[workerId], ...next } }))
            }
            onSetAll={setAll}
          />
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              !review ||
              !!review.blockedReason ||
              nothingToDo ||
              !planned.ready ||
              (planned.remove === 0 && planned.set === 0) ||
              applyMutation.isPending
            }
            onClick={() => {
              if (!planned.ready || !planned.noEmployerChoices) return;
              applyMutation.mutate(planned.noEmployerChoices);
            }}
          >
            {applyMutation.isPending
              ? "Refreshing…"
              : planned.set > 0
                ? "Apply refresh"
                : planned.remove > 0
                  ? `Remove ${planned.remove} worker${planned.remove === 1 ? "" : "s"}`
                  : "Apply refresh"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewBody({
  review,
  choices,
  defaultEmployerId,
  nothingToDo,
  onChoice,
  onSetAll,
}: {
  review: UniverseRefreshReview;
  choices: Record<number, DraftChoice>;
  defaultEmployerId: number | null;
  nothingToDo: boolean;
  onChoice: (workerId: number, next: Partial<DraftChoice>) => void;
  onSetAll: (action: NoEmployerAction, employerId: number | null) => void;
}) {
  if (review.blockedReason) {
    return <p className="text-sm text-destructive">{review.blockedReason}</p>;
  }

  if (nothingToDo) {
    return (
      <p className="text-sm text-muted-foreground">
        All {review.keepCount} allocated worker{review.keepCount === 1 ? "" : "s"} already
        {review.keepCount === 1 ? " has" : " have"} a campaign employer.
      </p>
    );
  }

  const singleEmployerName = review.campaignEmployers[0]?.employerName ?? "the campaign employer";

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {review.keepCount} allocated worker{review.keepCount === 1 ? "" : "s"} already
        {review.keepCount === 1 ? " has" : " have"} a campaign employer
        {review.campaignEmployers.length === 1 ? ` (${singleEmployerName})` : ""}.
      </p>

      {review.wrongEmployer.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">
            Other employers — {review.wrongEmployer.length} will be removed
          </h3>
          <p className="text-sm text-muted-foreground">
            These workers have an employer that is not saved on this campaign.
          </p>
          <MemberTable rows={review.wrongEmployer} showEmployer />
        </section>
      )}

      {review.noEmployer.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium">
                No employer — {review.noEmployer.length} need a choice
              </h3>
              <p className="text-sm text-muted-foreground">
                Remove them from the campaign, or set their employer to a campaign employer.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onSetAll("remove", defaultEmployerId)}
              >
                Remove all
              </Button>
              {review.campaignEmployers.length === 1 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onSetAll("set_employer", defaultEmployerId)}
                >
                  Set all to {singleEmployerName}
                </Button>
              ) : (
                <Select
                  onValueChange={(value) => onSetAll("set_employer", Number(value))}
                >
                  <SelectTrigger className="h-8 w-[220px] text-xs" aria-label="Set all to a campaign employer">
                    <SelectValue placeholder="Set all to…" />
                  </SelectTrigger>
                  <SelectContent>
                    {review.campaignEmployers.map((e) => (
                      <SelectItem key={e.employerId} value={String(e.employerId)}>
                        Set all to {e.employerName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Worker</TableHead>
                  <TableHead>Worksite</TableHead>
                  <TableHead>Choice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {review.noEmployer.map((row) => {
                  const draft = choices[row.workerId] ?? emptyChoice(defaultEmployerId);
                  return (
                    <TableRow key={row.workerId}>
                      <TableCell className="font-medium">{workerDisplayName(row)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.worksiteName ?? "—"}
                      </TableCell>
                      <TableCell>
                        <RadioGroup
                          className="flex flex-col gap-2 sm:flex-row sm:items-center"
                          value={draft.action}
                          onValueChange={(value) =>
                            onChoice(row.workerId, { action: value as NoEmployerAction })
                          }
                        >
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="remove" id={`refresh-remove-${row.workerId}`} />
                            <Label htmlFor={`refresh-remove-${row.workerId}`} className="font-normal">
                              Remove
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem
                              value="set_employer"
                              id={`refresh-set-${row.workerId}`}
                            />
                            <Label htmlFor={`refresh-set-${row.workerId}`} className="font-normal">
                              Set employer
                            </Label>
                            {review.campaignEmployers.length > 1 ? (
                              <Select
                                value={draft.employerId != null ? String(draft.employerId) : ""}
                                onValueChange={(value) =>
                                  onChoice(row.workerId, {
                                    action: "set_employer",
                                    employerId: Number(value),
                                  })
                                }
                              >
                                <SelectTrigger
                                  className="h-8 w-[160px] text-xs"
                                  aria-label={`Campaign employer for ${workerDisplayName(row)}`}
                                >
                                  <SelectValue placeholder="Employer" />
                                </SelectTrigger>
                                <SelectContent>
                                  {review.campaignEmployers.map((e) => (
                                    <SelectItem key={e.employerId} value={String(e.employerId)}>
                                      {e.employerName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {singleEmployerName}
                              </span>
                            )}
                          </div>
                        </RadioGroup>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}

function MemberTable({
  rows,
  showEmployer,
}: {
  rows: UniverseRefreshReview["wrongEmployer"];
  showEmployer?: boolean;
}) {
  return (
    <div className="rounded-md border max-h-56 overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Worker</TableHead>
            {showEmployer ? <TableHead>Employer</TableHead> : null}
            <TableHead>Worksite</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.workerId}>
              <TableCell className="font-medium">{workerDisplayName(row)}</TableCell>
              {showEmployer ? (
                <TableCell className="text-muted-foreground">{row.employerName ?? "—"}</TableCell>
              ) : null}
              <TableCell className="text-muted-foreground">{row.worksiteName ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
