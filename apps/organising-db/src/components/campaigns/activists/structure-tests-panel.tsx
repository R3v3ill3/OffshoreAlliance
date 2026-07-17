"use client";

/**
 * Structure Tests — escalating public actions measured crew-by-crew
 * (McAlevey): the honest measure of coverage. Each test records
 * per-unit eligible / participated / pass against a target, and can
 * optionally create a backing binary activity (+ event) so per-worker
 * participation can be captured through the existing assessment
 * machinery and surface on the Assessments tab.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { createClient } from "@/lib/supabase/client";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { useOuOptions } from "./use-woc-data";
import { useActivistRegister } from "./use-activist-data";
import type { StructureTestResultRow, StructureTestRow } from "./types";

const NONE = "__none__";

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------

function useStructureTests(campaignId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["structure-tests", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("structure_tests")
        .select("*")
        .eq("campaign_id", Number(campaignId))
        .order("test_date", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as StructureTestRow[];
    },
  });
}

function useStructureTestResults(campaignId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["structure-test-results", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("structure_test_results")
        .select("*, structure_tests!inner(campaign_id)")
        .eq("structure_tests.campaign_id", Number(campaignId));
      if (error) throw error;
      return (data ?? []) as unknown as StructureTestResultRow[];
    },
  });
}

// ---------------------------------------------------------------------------
// Create/edit test dialog
// ---------------------------------------------------------------------------

function StructureTestDialog({
  campaignId,
  test,
  nextNumber,
  open,
  onOpenChange,
}: {
  campaignId: string;
  test: StructureTestRow | null;
  nextNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!open) return null;
  return (
    <StructureTestDialogInner
      key={test?.structure_test_id ?? "new"}
      campaignId={campaignId}
      test={test}
      nextNumber={nextNumber}
      onOpenChange={onOpenChange}
    />
  );
}

function StructureTestDialogInner({
  campaignId,
  test,
  nextNumber,
  onOpenChange,
}: {
  campaignId: string;
  test: StructureTestRow | null;
  nextNumber: number;
  onOpenChange: (open: boolean) => void;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(test?.title ?? "");
  const [testDate, setTestDate] = useState(test?.test_date ?? "");
  const [testNumber, setTestNumber] = useState(
    String(test?.test_number ?? nextNumber)
  );
  const [description, setDescription] = useState(test?.description ?? "");
  const [target, setTarget] = useState(test?.target_description ?? "");
  const [threshold, setThreshold] = useState(
    test?.pass_threshold_pct != null ? String(test.pass_threshold_pct) : ""
  );
  const [learnings, setLearnings] = useState(test?.learnings ?? "");
  const [createActivity, setCreateActivity] = useState(false);

  const saveMutation = useAuthAwareMutation({
    mutationFn: async () => {
      let activityId = test?.activity_id ?? null;
      let eventId = test?.event_id ?? null;
      if (createActivity && activityId == null) {
        const activityTitle = `Structure test — ${title}`;
        const { data: activity, error: actError } = await supabase
          .from("campaign_activities")
          .insert({
            campaign_id: Number(campaignId),
            title: activityTitle,
            activity_kind: "assessment",
            template_key: "structure_test",
            is_binary: true,
            description:
              "Auto-created from a structure test to capture per-worker participation.",
          })
          .select("activity_id")
          .single();
        if (actError) throw actError;
        activityId = activity.activity_id;
        if (testDate) {
          const { data: event, error: eventError } = await supabase
            .from("activity_events")
            .insert({
              activity_id: activityId,
              name: activityTitle,
              event_kind: "action",
              scheduled_at: new Date(`${testDate}T00:00:00`).toISOString(),
            })
            .select("event_id")
            .single();
          if (eventError) throw eventError;
          eventId = event.event_id;
        }
      }

      const values = {
        campaign_id: Number(campaignId),
        title: title.trim(),
        test_date: testDate || null,
        test_number: testNumber ? Number(testNumber) : null,
        description: description || null,
        target_description: target || null,
        pass_threshold_pct: threshold ? Number(threshold) : null,
        learnings: learnings || null,
        activity_id: activityId,
        event_id: eventId,
      };

      if (test) {
        const { error } = await supabase
          .from("structure_tests")
          .update(values)
          .eq("structure_test_id", test.structure_test_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("structure_tests").insert(values);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["structure-tests", campaignId] });
      toast.success(test ? "Structure test updated" : "Structure test created");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(`Failed to save test: ${e.message}`),
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {test ? "Edit structure test" : "New structure test"}
          </DialogTitle>
          <DialogDescription>
            Escalate deliberately: petition → sticker day → crew photo → turnout
            → majority sign-up. Record results honestly, crew by crew.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="st-title">Test *</Label>
            <Input
              id="st-title"
              placeholder='e.g. Crew photo with "Vote No" shirts'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="st-number">Test #</Label>
            <Input
              id="st-number"
              type="number"
              value={testNumber}
              onChange={(e) => setTestNumber(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="st-date">Date</Label>
            <Input
              id="st-date"
              type="date"
              value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="st-target">Target (what counts as a pass)</Label>
            <Input
              id="st-target"
              placeholder="e.g. ≥70% of crew on shift"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="st-threshold">Pass threshold %</Label>
            <Input
              id="st-threshold"
              type="number"
              min={0}
              max={100}
              placeholder="70"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="st-desc">Description</Label>
            <Textarea
              id="st-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="st-learnings">What it showed / next test</Label>
            <Textarea
              id="st-learnings"
              rows={2}
              value={learnings}
              onChange={(e) => setLearnings(e.target.value)}
            />
          </div>
          {!test && (
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <Checkbox
                checked={createActivity}
                onCheckedChange={(v) => setCreateActivity(v === true)}
                className="mt-0.5"
              />
              <span>
                Also create an assessable activity so per-worker participation can
                be recorded and charted on the Assessments tab.
              </span>
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!title.trim() || saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Per-unit results editor
// ---------------------------------------------------------------------------

function ResultRow({
  campaignId,
  test,
  ouId,
  ouName,
  defaultEligible,
  result,
  leaderOptions,
  canWrite,
}: {
  campaignId: string;
  test: StructureTestRow;
  ouId: number;
  ouName: string;
  defaultEligible: number | null;
  result: StructureTestResultRow | null;
  leaderOptions: Array<{ worker_id: number; name: string }>;
  canWrite: boolean;
}) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [eligible, setEligible] = useState(
    result?.eligible != null
      ? String(result.eligible)
      : defaultEligible != null
        ? String(defaultEligible)
        : ""
  );
  const [participated, setParticipated] = useState(
    result?.participated != null ? String(result.participated) : ""
  );
  const [leaderId, setLeaderId] = useState(
    result?.leader_worker_id != null ? String(result.leader_worker_id) : NONE
  );
  const [dirty, setDirty] = useState(false);

  const pct =
    eligible && participated && Number(eligible) > 0
      ? (Number(participated) / Number(eligible)) * 100
      : null;
  const passed =
    pct != null && test.pass_threshold_pct != null
      ? pct >= Number(test.pass_threshold_pct)
      : (result?.passed ?? null);

  const saveMutation = useAuthAwareMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("structure_test_results").upsert(
        {
          structure_test_id: test.structure_test_id,
          ou_id: ouId,
          eligible: eligible ? Number(eligible) : null,
          participated: participated ? Number(participated) : null,
          passed,
          leader_worker_id: leaderId === NONE ? null : Number(leaderId),
        },
        { onConflict: "structure_test_id,ou_id" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({
        queryKey: ["structure-test-results", campaignId],
      });
    },
    onError: (e: Error) => toast.error(`Failed to save result: ${e.message}`),
  });

  const hasData = result != null || dirty;

  return (
    <TableRow className={!hasData ? "opacity-70" : undefined}>
      <TableCell className="font-medium">{ouName}</TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          className="h-8 w-20"
          value={eligible}
          disabled={!canWrite}
          onChange={(e) => {
            setEligible(e.target.value);
            setDirty(true);
          }}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          className="h-8 w-20"
          value={participated}
          disabled={!canWrite}
          onChange={(e) => {
            setParticipated(e.target.value);
            setDirty(true);
          }}
        />
      </TableCell>
      <TableCell>
        {pct != null ? (
          <span className="text-sm tabular-nums">{pct.toFixed(0)}%</span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {passed == null ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : passed ? (
          <Badge
            variant="outline"
            className="border-emerald-500 text-emerald-700 dark:border-emerald-600 dark:text-emerald-400"
          >
            Pass
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-red-500 text-red-600 dark:border-red-600 dark:text-red-400"
          >
            Fail
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <Select
          value={leaderId}
          onValueChange={(v) => {
            setLeaderId(v);
            setDirty(true);
          }}
          disabled={!canWrite}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {leaderOptions.map((l) => (
              <SelectItem key={l.worker_id} value={String(l.worker_id)}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {canWrite && dirty && (
          <Button
            size="sm"
            className="h-7"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "…" : "Save"}
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function StructureTestsPanel({
  campaignId,
  canWrite,
}: {
  campaignId: string;
  canWrite: boolean;
}) {
  const { data: tests = [], isLoading } = useStructureTests(campaignId);
  const { data: results = [] } = useStructureTestResults(campaignId);
  const { data: ouOptions = [] } = useOuOptions(campaignId);
  const { data: registerRows = [] } = useActivistRegister(campaignId);

  const supabase = createClient();
  const { data: unitCounts = new Map<number, number>() } = useQuery({
    queryKey: ["structure-test-unit-counts", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_campaign_coverage_map")
        .select("ou_id, assigned_workers")
        .eq("campaign_id", Number(campaignId));
      if (error) throw error;
      const m = new Map<number, number>();
      for (const r of data ?? []) {
        if (r.ou_id != null) m.set(r.ou_id, r.assigned_workers ?? 0);
      }
      return m;
    },
  });

  const [dialogTest, setDialogTest] = useState<StructureTestRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const units = useMemo(
    () => ouOptions.filter((o) => !o.is_group_container),
    [ouOptions]
  );

  const leaderOptions = useMemo(
    () =>
      registerRows
        .filter((r) => !r.is_archived)
        .map((r) => ({ worker_id: r.worker_id!, name: r.worker_name ?? "" })),
    [registerRows]
  );

  const resultsByTest = useMemo(() => {
    const m = new Map<number, StructureTestResultRow[]>();
    for (const r of results) {
      const list = m.get(r.structure_test_id) ?? [];
      list.push(r);
      m.set(r.structure_test_id, list);
    }
    return m;
  }, [results]);

  const nextNumber =
    tests.reduce((max, t) => Math.max(max, t.test_number ?? 0), 0) + 1;

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <EurekaLoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Power is proven, not asserted — escalating public actions measure real
          coverage crew by crew, and develop the leaders who run them.
        </p>
        {canWrite && (
          <Button size="sm" onClick={() => { setDialogTest(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
            New structure test
          </Button>
        )}
      </div>

      {tests.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No structure tests yet. Start small — a petition or sticker day — and
            escalate.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tests.map((t) => {
            const testResults = resultsByTest.get(t.structure_test_id) ?? [];
            const resultByOu = new Map(testResults.map((r) => [r.ou_id, r]));
            const passCount = testResults.filter((r) => r.passed).length;
            const expanded = expandedId === t.structure_test_id;
            return (
              <Card key={t.structure_test_id}>
                <CardHeader
                  className="cursor-pointer py-4"
                  onClick={() =>
                    setExpandedId(expanded ? null : t.structure_test_id)
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {expanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      <CardTitle className="text-base">
                        {t.test_number != null && (
                          <span className="text-muted-foreground mr-1.5">
                            #{t.test_number}
                          </span>
                        )}
                        {t.title}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.test_date && (
                        <Badge variant="outline">{t.test_date}</Badge>
                      )}
                      {t.target_description && (
                        <Badge variant="secondary">{t.target_description}</Badge>
                      )}
                      {testResults.length > 0 && (
                        <Badge
                          variant="outline"
                          className={
                            passCount === testResults.length
                              ? "border-emerald-500 text-emerald-700 dark:text-emerald-400"
                              : "border-amber-500 text-amber-700 dark:text-amber-400"
                          }
                        >
                          {passCount}/{testResults.length} units passed
                        </Badge>
                      )}
                      {t.activity_id != null && (
                        <Badge variant="secondary" className="text-[10px]">
                          assessable
                        </Badge>
                      )}
                      {canWrite && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDialogTest(t);
                            setDialogOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                  {t.learnings && (
                    <CardDescription className="ml-6">
                      {t.learnings}
                    </CardDescription>
                  )}
                </CardHeader>
                {expanded && (
                  <CardContent>
                    {units.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Define campaign units first — results are recorded per
                        crew/unit.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Crew / unit</TableHead>
                            <TableHead>Eligible</TableHead>
                            <TableHead>Participated</TableHead>
                            <TableHead>%</TableHead>
                            <TableHead>Pass</TableHead>
                            <TableHead>Leader responsible</TableHead>
                            <TableHead className="w-16" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {units.map((u) => (
                            <ResultRow
                              key={`${t.structure_test_id}-${u.ou_id}`}
                              campaignId={campaignId}
                              test={t}
                              ouId={u.ou_id}
                              ouName={u.name}
                              defaultEligible={unitCounts.get(u.ou_id) ?? null}
                              result={resultByOu.get(u.ou_id) ?? null}
                              leaderOptions={leaderOptions}
                              canWrite={canWrite}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <StructureTestDialog
        campaignId={campaignId}
        test={dialogTest}
        nextNumber={nextNumber}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
