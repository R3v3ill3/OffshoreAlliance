"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API_FETCH_TIMEOUT_UPLOAD_MS, fetchApi } from "@/lib/api/fetch-api";
import { MembershipImportWizard } from "@/components/import/membership-import-wizard";
import type { ParsedMembershipRow } from "@/lib/import/membership-import-types";
import {
  MEMBERSHIP_UPDATE_KIND_LABELS,
  MEMBERSHIP_UPDATE_KINDS,
  formatWeekEnding,
} from "@/lib/membership-updates/kinds";
import type {
  MembershipUpdateBatch,
  MembershipUpdateFileRow,
  MembershipUpdatesListResponse,
} from "@/lib/membership-updates/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Mail,
  Upload,
  Download,
  Play,
  X,
  Save,
} from "lucide-react";

const STATUS_BADGE: Record<
  MembershipUpdateBatch["status"],
  { label: string; variant: "secondary" | "info" | "success" | "outline" }
> = {
  receiving: { label: "Receiving", variant: "secondary" },
  ready: { label: "Ready", variant: "info" },
  imported: { label: "Imported", variant: "success" },
  dismissed: { label: "Dismissed", variant: "outline" },
};

interface PreparedWeeklyImport {
  batchId: number;
  rows: ParsedMembershipRow[];
  headers: string[];
  fileName: string;
}

export function WeeklyUpdatesTab() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoOpened = useRef<number | null>(null);

  const [notifyIds, setNotifyIds] = useState<string[] | null>(null);
  const [savingNotify, setSavingNotify] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyBatchId, setBusyBatchId] = useState<number | null>(null);
  const [prepared, setPrepared] = useState<PreparedWeeklyImport | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["membership-updates"],
    queryFn: async (): Promise<MembershipUpdatesListResponse> => {
      const res = await fetchApi("/api/membership-updates");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load weekly updates");
      return json;
    },
  });

  useEffect(() => {
    if (data && notifyIds === null) setNotifyIds(data.notifyUserIds);
  }, [data, notifyIds]);

  const filesByBatch = useMemo(() => {
    const map = new Map<number, MembershipUpdateFileRow[]>();
    for (const file of data?.files ?? []) {
      const list = map.get(file.batch_id) ?? [];
      list.push(file);
      map.set(file.batch_id, list);
    }
    return map;
  }, [data?.files]);

  const snapshotByBatch = useMemo(() => {
    const map = new Map<number, MembershipUpdatesListResponse["snapshots"][number]>();
    for (const snap of data?.snapshots ?? []) {
      if (snap.batch_id != null) map.set(snap.batch_id, snap);
    }
    return map;
  }, [data?.snapshots]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["membership-updates"] });
    await queryClient.invalidateQueries({ queryKey: ["membership-update-notifications"] });
  }

  async function startImport(batchId: number) {
    setActionError(null);
    setBusyBatchId(batchId);
    try {
      const res = await fetchApi(`/api/membership-updates/${batchId}/rows`, {
        timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load combined rows");
      setPrepared({
        batchId,
        rows: json.rows ?? [],
        headers: json.headers ?? [],
        fileName: json.fileName ?? "Weekly update",
      });
      setWizardOpen(true);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not start import");
    } finally {
      setBusyBatchId(null);
    }
  }

  useEffect(() => {
    const raw = searchParams.get("batch");
    if (!raw || !data) return;
    const batchId = Number(raw);
    if (!Number.isFinite(batchId) || autoOpened.current === batchId) return;
    const batch = data.batches.find((b) => b.batch_id === batchId);
    if (batch?.status === "ready") {
      autoOpened.current = batchId;
      void startImport(batchId);
    }
    // Open the wizard once when arriving from the login banner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, data]);

  async function dismissBatch(batchId: number) {
    setActionError(null);
    setBusyBatchId(batchId);
    try {
      const res = await fetchApi(`/api/membership-updates/${batchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not dismiss");
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not dismiss");
    } finally {
      setBusyBatchId(null);
    }
  }

  async function saveNotify() {
    if (!notifyIds) return;
    setSavingNotify(true);
    setActionError(null);
    try {
      const res = await fetchApi("/api/membership-updates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyUserIds: notifyIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save recipients");
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not save recipients");
    } finally {
      setSavingNotify(false);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    setUploadMessage(null);
    setActionError(null);
    try {
      const form = new FormData();
      for (const file of list) form.append("files", file);
      const res = await fetchApi("/api/membership-updates", {
        method: "POST",
        body: form,
        timeoutMs: API_FETCH_TIMEOUT_UPLOAD_MS,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      const filed = (json.filed as { filename: string }[] | undefined) ?? [];
      const skipped = (json.skipped as { filename: string; reason: string }[] | undefined) ?? [];
      const parts = [];
      if (filed.length) parts.push(`Filed ${filed.length} file${filed.length === 1 ? "" : "s"}`);
      if (skipped.length) {
        parts.push(
          `skipped ${skipped.map((s) => `${s.filename} (${s.reason})`).join("; ")}`
        );
      }
      setUploadMessage(parts.join(" — ") || "No files accepted");
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function toggleNotify(userId: string, checked: boolean) {
    setNotifyIds((prev) => {
      const current = prev ?? [];
      if (checked) return current.includes(userId) ? current : [...current, userId];
      return current.filter((id) => id !== userId);
    });
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="pt-4 text-sm text-destructive">
        {error instanceof Error ? error.message : "Could not load weekly updates"}
      </p>
    );
  }

  const inbound = data.inboundAddress;
  const selectedNotify = notifyIds ?? data.notifyUserIds;

  return (
    <div className="space-y-6 pt-4">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Weekly Updates</h2>
        <p className="text-sm text-muted-foreground max-w-3xl">
          The membership system emails four spreadsheets every week — New, Recommenced,
          Resigned and Unfinancial — named{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            OA - &lt;Kind&gt; Members - w-e DD-MM-YYYY.xlsx
          </code>
          . Forward them to{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{inbound}</code>
          . When all four arrive, chosen admins are told on their next visit. Importing
          the combined file uses the same campaign protection as Membership Import:
          workers in a live campaign keep their campaign employer, worksite and job title.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Who to tell when a week is ready</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Leave everyone unchecked to notify every admin. Only current admins receive
              the login banner.
            </p>
          </div>
          <Button size="sm" onClick={saveNotify} disabled={savingNotify}>
            {savingNotify ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save recipients
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.admins.map((admin) => (
            <label key={admin.user_id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selectedNotify.includes(admin.user_id)}
                onCheckedChange={(v) => toggleNotify(admin.user_id, v === true)}
              />
              <span>{admin.display_name?.trim() || admin.user_id.slice(0, 8)}</span>
            </label>
          ))}
          {data.admins.length === 0 && (
            <p className="text-xs text-muted-foreground">No admin users found.</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Upload the four files</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Use this if the email did not arrive. File names must still match the weekly
              pattern so they file against the week-ending date.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Upload files
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void uploadFiles(e.target.files);
            }}
          />
        </div>
        {uploadMessage && <p className="text-xs text-muted-foreground">{uploadMessage}</p>}
      </div>

      {actionError && (
        <p className="text-sm text-destructive">{actionError}</p>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Weeks</h3>
        {(data.batches ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No weekly files have been received yet. Email the four spreadsheets to {inbound}.
          </p>
        ) : (
          <div className="space-y-3">
            {data.batches.map((batch) => (
              <BatchCard
                key={batch.batch_id}
                batch={batch}
                files={filesByBatch.get(batch.batch_id) ?? []}
                snapshot={snapshotByBatch.get(batch.batch_id)}
                busy={busyBatchId === batch.batch_id}
                onImport={() => void startImport(batch.batch_id)}
                onDismiss={() => void dismissBatch(batch.batch_id)}
              />
            ))}
          </div>
        )}
      </div>

      {(data.snapshots ?? []).length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Membership movement</h3>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Week ending</th>
                  <th className="px-3 py-2 text-right font-medium">New</th>
                  <th className="px-3 py-2 text-right font-medium">Recommenced</th>
                  <th className="px-3 py-2 text-right font-medium">Resigned</th>
                  <th className="px-3 py-2 text-right font-medium">Unfinancial</th>
                  <th className="px-3 py-2 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {data.snapshots.map((snap) => (
                  <tr key={snap.snapshot_id} className="border-t">
                    <td className="px-3 py-2">{formatWeekEnding(snap.as_of)}</td>
                    <td className="px-3 py-2 text-right">{snap.new_members}</td>
                    <td className="px-3 py-2 text-right">{snap.recommenced_members}</td>
                    <td className="px-3 py-2 text-right">{snap.resigned_members}</td>
                    <td className="px-3 py-2 text-right">{snap.unfinancial_members}</td>
                    <td className={`px-3 py-2 text-right font-medium ${snap.net_movement >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {snap.net_movement > 0 ? `+${snap.net_movement}` : snap.net_movement}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <MembershipImportWizard
        open={wizardOpen}
        onOpenChange={(open) => {
          setWizardOpen(open);
          if (!open) setPrepared(null);
        }}
        onComplete={() => {
          void refresh();
        }}
        preparedRows={prepared?.rows}
        preparedHeaders={prepared?.headers}
        preparedFileName={prepared?.fileName}
        preparedType="weekly_update"
        weeklyBatchId={prepared?.batchId}
      />
    </div>
  );
}

function BatchCard({
  batch,
  files,
  snapshot,
  busy,
  onImport,
  onDismiss,
}: {
  batch: MembershipUpdateBatch;
  files: MembershipUpdateFileRow[];
  snapshot: MembershipUpdatesListResponse["snapshots"][number] | undefined;
  busy: boolean;
  onImport: () => void;
  onDismiss: () => void;
}) {
  const present = new Set(files.map((f) => f.kind));
  const missing = MEMBERSHIP_UPDATE_KINDS.filter((k) => !present.has(k));
  const meta = STATUS_BADGE[batch.status];
  const net = snapshot?.net_movement;
  const summary = batch.import_summary as
    | { created?: number; updated?: number; skipped?: number; protectedUpdates?: number }
    | null;

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm">Week ending {formatWeekEnding(batch.week_ending)}</p>
            <Badge variant={meta.variant}>{meta.label}</Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {batch.source === "email" ? "Emailed" : "Uploaded"}
            </span>
          </div>
          {batch.source_from && (
            <p className="text-xs text-muted-foreground">From {batch.source_from}</p>
          )}
          {net != null && (
            <p className="text-xs">
              Net movement{" "}
              <span className={net >= 0 ? "text-green-700 font-medium" : "text-red-700 font-medium"}>
                {net > 0 ? `+${net}` : net}
              </span>
              {" "}(new + recommenced) − (resigned + unfinancial)
            </p>
          )}
          {summary && batch.status === "imported" && (
            <p className="text-xs text-muted-foreground">
              {summary.created ?? 0} created · {summary.updated ?? 0} updated · {summary.skipped ?? 0} skipped
              {summary.protectedUpdates
                ? ` · ${summary.protectedUpdates} campaign fields kept`
                : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {batch.status === "ready" && (
            <>
              <Button size="sm" onClick={onImport} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                Review &amp; import
              </Button>
              <Button size="sm" variant="outline" onClick={onDismiss} disabled={busy}>
                <X className="h-4 w-4 mr-2" />
                Dismiss
              </Button>
            </>
          )}
          {files.length > 0 && (
            <Button size="sm" variant="outline" asChild>
              <a href={`/api/membership-updates/${batch.batch_id}/combined`}>
                <Download className="h-4 w-4 mr-2" />
                Combined file
              </a>
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {MEMBERSHIP_UPDATE_KINDS.map((kind) => {
          const file = files.find((f) => f.kind === kind);
          return (
            <div key={kind} className="rounded-md border px-3 py-2 text-xs">
              <p className="font-medium">{MEMBERSHIP_UPDATE_KIND_LABELS[kind]}</p>
              {file ? (
                <p className="text-muted-foreground mt-0.5">
                  {file.row_count ?? 0} row{(file.row_count ?? 0) === 1 ? "" : "s"}
                </p>
              ) : (
                <p className="text-amber-700 mt-0.5">Waiting</p>
              )}
            </div>
          );
        })}
      </div>
      {missing.length > 0 && batch.status === "receiving" && (
        <p className="text-xs text-muted-foreground">
          Still waiting for {missing.map((k) => MEMBERSHIP_UPDATE_KIND_LABELS[k]).join(", ")}.
        </p>
      )}
    </div>
  );
}
