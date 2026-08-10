"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { useCampaignPhoneScriptContext } from "@/lib/hooks/useCampaignPhoneScriptContext";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import {
  fetchApi,
  API_FETCH_TIMEOUT_LLM_MS,
} from "@/lib/api/fetch-api";
import { format } from "date-fns";
import { resolveTemplateVariables, translateToActionNetwork } from "@/lib/comms/template-variables";
import { toAnEditUrl } from "@/lib/api/action-network";
import { toast } from "sonner";
import {
  Mail,
  MessageSquare,
  Phone,
  Send,
  CheckCircle,
  FileText,
  ChevronLeft,
  Pencil,
  Save,
  RefreshCw,
  BarChart3,
  Loader2,
  Users,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CommsPlatform, DraftStatus } from "@/types/planner-types";

export interface PreparedTag {
  tag_id: string;
  tag_href: string;
  /**
   * AN UI URL for the tag's edit page (browser_url from the tag resource).
   * Used to deep-link the user from our success card straight to the tag
   * they just pushed to — the simplest way to disambiguate "you might be
   * looking at the wrong tag" issues.
   */
  tag_browser_url?: string | null;
  tag_name: string;
  contacts_tagged: number;
  contacts_created: number;
  /**
   * Server-confirmed tagging writes — collected from the response of each
   * POST /tags/{id}/taggings call. AUTHORITATIVE: this is what AN's write
   * primary acknowledged. Use this in preference to verified_tag_count
   * when both are present, because AN's read replicas can lag behind the
   * primary by 1-2 minutes.
   */
  write_confirmed_count?: number | null;
  /**
   * Number of people AN reports as currently tagged with this tag, read
   * back via GET /tags/{id}/taggings after the push completes. Subject to
   * read-replica lag — when this is lower than write_confirmed_count it
   * just means the read API hasn't caught up yet, NOT that anything failed.
   * Null when verification was skipped or failed (network error, throttle,
   * etc).
   */
  verified_tag_count?: number | null;
  /**
   * Human-readable warning string when the AN-side count is lower than
   * what we expected, or when the verification call itself failed. Drives
   * the amber banner on the send UI.
   */
  verification_warning?: string | null;
}

interface CampaignSendPanelProps {
  campaignId: string | number;
  canWrite: boolean;
  preparedTag?: PreparedTag | null;
}

interface DraftRow {
  draft_id: number;
  campaign_id: number;
  stage_number: number;
  platform: CommsPlatform;
  title: string | null;
  subject: string | null;
  body: string;
  body_html: string | null;
  tone: string | null;
  audience_segment: string | null;
  status: DraftStatus;
  approved_by: string | null;
  approved_at: string | null;
  sent_via: string | null;
  external_message_id: string | null;
  send_stats: Record<string, unknown> | null;
  structured_script_id: number | null;
  created_at: string;
  updated_at: string;
}

const PLATFORM_CONFIG: Record<
  CommsPlatform,
  {
    label: string;
    icon: typeof Mail;
    variant: "default" | "info" | "success" | "warning" | "secondary";
  }
> = {
  email: { label: "Email", icon: Mail, variant: "info" },
  sms: { label: "SMS", icon: MessageSquare, variant: "success" },
  phone_script: { label: "Phone Script", icon: Phone, variant: "warning" },
};

const STATUS_CONFIG: Record<
  DraftStatus,
  { label: string; variant: "secondary" | "info" | "success" | "warning" | "destructive" }
> = {
  generating: { label: "Generating", variant: "secondary" },
  draft: { label: "Draft", variant: "info" },
  approved: { label: "Approved", variant: "success" },
  sent: { label: "Sent", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
};

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd MMM yyyy HH:mm");
  } catch {
    return d;
  }
}

function groupByStage(drafts: DraftRow[]): Map<number, DraftRow[]> {
  const map = new Map<number, DraftRow[]>();
  for (const d of drafts) {
    const list = map.get(d.stage_number) ?? [];
    list.push(d);
    map.set(d.stage_number, list);
  }
  return map;
}

export function CampaignSendPanel({
  campaignId,
  canWrite,
  preparedTag,
}: CampaignSendPanelProps) {
  const supabase = createClient();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const numericId = Number(campaignId);

  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [isStructuring, setIsStructuring] = useState(false);

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ["campaign-comms-drafts", numericId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_comms_drafts")
        .select("*, structured_script_id")
        .eq("campaign_id", numericId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DraftRow[];
    },
    enabled: !!user,
  });

  const { data: campaignCtx } = useCampaignPhoneScriptContext(
    Number.isFinite(numericId) && numericId > 0 ? numericId : null
  );

  const selectedDraft = drafts.find((d) => d.draft_id === selectedDraftId) ?? null;

  const saveMutation = useAuthAwareMutation({
    mutationFn: async () => {
      if (!selectedDraft) return;
      const { error } = await supabase
        .from("campaign_comms_drafts")
        .update({
          subject: editSubject || null,
          body: editBody,
          // Clear the AI-generated HTML body so the send flow falls back to
          // the edited plain-text body rather than serving stale HTML.
          body_html: null,
        })
        .eq("draft_id", selectedDraft.draft_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["campaign-comms-drafts", numericId],
      });
      setEditing(false);
    },
  });

  const approveMutation = useAuthAwareMutation({
    mutationFn: async () => {
      if (!selectedDraft || !user) return;
      const { error } = await supabase
        .from("campaign_comms_drafts")
        .update({
          status: "approved",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq("draft_id", selectedDraft.draft_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["campaign-comms-drafts", numericId],
      });
    },
  });

  const sendAnMutation = useAuthAwareMutation({
    mutationFn: async () => {
      if (!selectedDraft) throw new Error("No draft selected");
      const ctx = campaignCtx ?? {};
      const resolvedSubject = translateToActionNetwork(
        resolveTemplateVariables(selectedDraft.subject || selectedDraft.title || "No subject", ctx)
      );
      const resolvedBody = translateToActionNetwork(
        resolveTemplateVariables(selectedDraft.body_html || selectedDraft.body, ctx)
      );
      // Note: AN's `targets` array expects saved-query hrefs, not tag hrefs
      // (see https://actionnetwork.org/docs/v2/messages). Sending a tag href
      // here was silently ignored. Instead, surface the tag in the message
      // `name` (administrative title) so the organiser can see which tag to
      // include when they open the draft in AN to set targeting.
      const adminTitle = preparedTag?.tag_name
        ? `${resolvedSubject || "Untitled"} — push tag ${preparedTag.tag_name}`
        : resolvedSubject || "Untitled";
      const messagePayload: Record<string, unknown> = {
        name: adminTitle,
        subject: resolvedSubject,
        body: resolvedBody,
        from: "Offshore Alliance",
        reply_to: "info@offshorealliance.org.au",
      };
      const createRes = await fetchApi("/api/action-network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_message",
          message: messagePayload,
        }),
        timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
      });
      const createData = await createRes.json();
      if (!createData.success) throw new Error(createData.error);

      const messageHref =
        createData.data?._links?.self?.href ?? "";
      const messageId = messageHref.split("/").pop() || "";
      // Rewrite to /write so the user lands on the edit/compose page
      // (where they can fix targeting + send) rather than /statistics.
      const administrativeUrl = toAnEditUrl(
        (createData.data?.administrative_url as string | undefined) ?? null,
      );

      const sendStatsUpdate: Record<string, unknown> = administrativeUrl
        ? { administrative_url: administrativeUrl, an_tag_name: preparedTag?.tag_name ?? null }
        : { an_tag_name: preparedTag?.tag_name ?? null };

      const { error } = await supabase
        .from("campaign_comms_drafts")
        .update({
          status: "sent",
          sent_via: "action_network",
          external_message_id: messageId,
          send_stats: sendStatsUpdate,
        })
        .eq("draft_id", selectedDraft.draft_id);
      if (error) throw error;

      return messageId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["campaign-comms-drafts", numericId],
      });
    },
  });

  const pollStatsMutation = useAuthAwareMutation({
    mutationFn: async (draftId: number) => {
      const res = await fetchApi(`/api/campaigns/${numericId}/sync-an`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "poll_stats", draft_id: draftId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to refresh stats");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["campaign-comms-drafts", numericId],
      });
    },
  });

  async function handleStructureForCalling() {
    if (!selectedDraft) return;
    setIsStructuring(true);
    try {
      const structureRes = await fetchApi(`/api/campaigns/${numericId}/call-scripts/structure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: selectedDraft.draft_id }),
        timeoutMs: API_FETCH_TIMEOUT_LLM_MS,
      });
      if (!structureRes.ok) {
        const err = await structureRes.json().catch(() => ({ error: "Structure failed" }));
        throw new Error(err.error || "Failed to structure script");
      }
      const { sections } = await structureRes.json();

      const createRes = await fetchApi(`/api/campaigns/${numericId}/call-scripts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selectedDraft.title || "Phone Script",
          draft_id: selectedDraft.draft_id,
          sections: sections || [],
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({ error: "Create failed" }));
        throw new Error(err.error || "Failed to create script");
      }
      const newScript = await createRes.json();
      toast.success(`Script structured into ${sections?.length || 0} SOC sections`);
      queryClient.invalidateQueries({ queryKey: ["campaign-comms-drafts", numericId] });
      router.push(`/campaigns/${numericId}/phone/scripts/${newScript.script_id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to structure script");
    } finally {
      setIsStructuring(false);
    }
  }

  const startEditing = () => {
    if (!selectedDraft) return;
    setEditSubject(selectedDraft.subject ?? "");
    setEditBody(selectedDraft.body);
    setEditing(true);
  };

  const grouped = groupByStage(drafts);
  const stageNumbers = Array.from(grouped.keys()).sort((a, b) => a - b);

  if (selectedDraft) {
    const platform = PLATFORM_CONFIG[selectedDraft.platform];
    const statusCfg = STATUS_CONFIG[selectedDraft.status];
    const PlatformIcon = platform.icon;

    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSelectedDraftId(null);
            setEditing(false);
          }}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to drafts
        </Button>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <PlatformIcon className="h-4 w-4 shrink-0" />
                <CardTitle className="text-base truncate">
                  {selectedDraft.title || selectedDraft.subject || "Untitled draft"}
                </CardTitle>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={platform.variant}>{platform.label}</Badge>
                <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
              <span>Stage {selectedDraft.stage_number}</span>
              {selectedDraft.tone && <span>Tone: {selectedDraft.tone}</span>}
              {selectedDraft.audience_segment && (
                <span>Audience: {selectedDraft.audience_segment}</span>
              )}
              <span>Created {formatDate(selectedDraft.created_at)}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <>
                {selectedDraft.platform === "email" && (
                  <div className="space-y-2">
                    <Label className="text-xs">Subject</Label>
                    <Input
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-xs">Body</Label>
                  <Textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={12}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saveMutation.isPending ? "Saving…" : "Save Changes"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                {selectedDraft.subject && (
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Subject
                    </Label>
                    <p className="text-sm font-medium">{selectedDraft.subject}</p>
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground">Body</Label>
                  <div className="mt-1 rounded-md border bg-muted/30 p-4 text-sm whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                    {selectedDraft.body}
                  </div>
                </div>

                {/* Sent status info */}
                {selectedDraft.status === "sent" && (
                  <div className="rounded-md border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                        <CheckCircle className="h-4 w-4" />
                        Sent successfully
                      </div>
                      {canWrite && selectedDraft.external_message_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={pollStatsMutation.isPending}
                          onClick={() =>
                            pollStatsMutation.mutate(selectedDraft.draft_id)
                          }
                        >
                          {pollStatsMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          Refresh Stats
                        </Button>
                      )}
                    </div>
                    {selectedDraft.sent_via && (
                      <p className="text-xs text-muted-foreground">
                        Via {selectedDraft.sent_via.replace(/_/g, " ")}
                      </p>
                    )}
                    {selectedDraft.external_message_id && (
                      <p className="text-xs text-muted-foreground">
                        Message ID: {selectedDraft.external_message_id}
                      </p>
                    )}
                    {selectedDraft.send_stats && (() => {
                      const stats = selectedDraft.send_stats as Record<string, unknown>;
                      const targeted = stats.total_targeted as number | undefined;
                      const opened = stats.verified_opened as number | undefined;
                      const recipientsCount = stats.recipients_count as number | undefined;
                      const hasEngagementStats =
                        typeof targeted === "number" && targeted > 0;

                      return (
                        <div className="space-y-1">
                          {recipientsCount != null && !hasEngagementStats && (
                            <p className="text-xs text-muted-foreground">
                              Recipients: {recipientsCount}
                            </p>
                          )}
                          {hasEngagementStats && (
                            <div className="flex items-center gap-4 pt-1">
                              <div className="flex items-center gap-1.5 text-xs">
                                <BarChart3 className="h-3.5 w-3.5 text-blue-500" />
                                <span className="text-muted-foreground">
                                  Targeted:
                                </span>
                                <span className="font-medium">
                                  {targeted!.toLocaleString()}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-xs">
                                <Mail className="h-3.5 w-3.5 text-green-500" />
                                <span className="text-muted-foreground">
                                  Opened:
                                </span>
                                <span className="font-medium">
                                  {opened?.toLocaleString() ?? 0}
                                  {targeted! > 0 && (
                                    <span className="text-muted-foreground ml-1">
                                      (
                                      {Math.round(
                                        ((opened ?? 0) / targeted!) * 100
                                      )}
                                      %)
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                          )}
                          {stats.polled_at ? (
                            <p className="text-xs text-muted-foreground/70">
                              Stats updated:{" "}
                              {formatDate(stats.polled_at as string)}
                            </p>
                          ) : null}
                        </div>
                      );
                    })()}
                    {pollStatsMutation.isError && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {pollStatsMutation.error?.message ?? "Failed to refresh stats"}
                      </p>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                {canWrite && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    {selectedDraft.status === "draft" && (
                      <>
                        <Button variant="outline" size="sm" onClick={startEditing}>
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => approveMutation.mutate()}
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          {approveMutation.isPending
                            ? "Approving…"
                            : "Mark as Approved"}
                        </Button>
                        {selectedDraft.platform === "phone_script" && !selectedDraft.structured_script_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleStructureForCalling}
                            disabled={isStructuring}
                          >
                            {isStructuring ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Wand2 className="h-3.5 w-3.5" />
                            )}
                            {isStructuring ? "Structuring…" : "Structure for Calling"}
                          </Button>
                        )}
                      </>
                    )}
                    {selectedDraft.status === "approved" && (
                      <>
                        <Button variant="outline" size="sm" onClick={startEditing}>
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        {selectedDraft.platform === "email" && (
                          <div className="flex items-center gap-2">
                            {preparedTag && (
                              <Badge variant="secondary" className="text-xs">
                                <Users className="h-3 w-3 mr-1" />
                                {preparedTag.tag_name} ({preparedTag.contacts_tagged + preparedTag.contacts_created} contacts)
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              onClick={() => sendAnMutation.mutate()}
                              disabled={sendAnMutation.isPending}
                            >
                              <Send className="h-3.5 w-3.5" />
                              {sendAnMutation.isPending
                                ? "Pushing…"
                                : preparedTag
                                  ? "Push to AN with List"
                                  : "Push to Action Network"}
                            </Button>
                          </div>
                        )}
                        {selectedDraft.platform === "sms" && (
                          <Button
                            size="sm"
                            disabled
                            title="SMS sending arrives with the SMS module"
                          >
                            <Send className="h-3.5 w-3.5" />
                            Send SMS
                          </Button>
                        )}
                        {selectedDraft.platform === "phone_script" && (
                          <div className="flex flex-wrap gap-2">
                            {selectedDraft.structured_script_id ? (
                              <Button
                                size="sm"
                                onClick={() => router.push(`/campaigns/${numericId}/phone/scripts/${selectedDraft.structured_script_id}`)}
                              >
                                <Phone className="h-3.5 w-3.5" />
                                Open Script Editor
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                onClick={handleStructureForCalling}
                                disabled={isStructuring}
                              >
                                {isStructuring ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Wand2 className="h-3.5 w-3.5" />
                                )}
                                {isStructuring ? "Structuring…" : "Structure for Calling"}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const sid = selectedDraft.structured_script_id;
                                const q = sid ? `?script_id=${sid}` : "";
                                router.push(`/campaigns/${numericId}/phone/lists/new${q}`);
                              }}
                            >
                              <Users className="h-3.5 w-3.5" />
                              Create Call List
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push(`/campaigns/${numericId}/phone`)}
                            >
                              <Phone className="h-3.5 w-3.5" />
                              Phone Operations
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Error display */}
                {sendAnMutation.isError && (
                  <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3">
                    <p className="text-sm text-red-700 dark:text-red-400">
                      {sendAnMutation.error?.message ?? "Send failed"}
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Draft list view
  if (isLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Loading drafts…
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <div className="rounded-full bg-muted/50 p-4">
          <FileText className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-lg">No drafts yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Generate communication drafts from the Campaign Plan to see them
            here. Drafts can be reviewed, approved, and sent via email or SMS.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {stageNumbers.map((stageNum) => {
        const stageDrafts = grouped.get(stageNum) ?? [];
        return (
          <div key={stageNum} className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Stage {stageNum}
            </h3>
            <div className="grid gap-3">
              {stageDrafts.map((draft) => {
                const platform = PLATFORM_CONFIG[draft.platform];
                const statusCfg = STATUS_CONFIG[draft.status];
                const PlatformIcon = platform.icon;

                return (
                  <Card
                    key={draft.draft_id}
                    className="cursor-pointer hover:border-foreground/20 transition-colors"
                    onClick={() => setSelectedDraftId(draft.draft_id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <PlatformIcon className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {draft.title || draft.subject || "Untitled draft"}
                            </span>
                            <Badge
                              variant={platform.variant}
                              className="text-xs shrink-0"
                            >
                              {platform.label}
                            </Badge>
                            <Badge
                              variant={statusCfg.variant}
                              className="text-xs shrink-0"
                            >
                              {statusCfg.label}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {draft.tone && <span>Tone: {draft.tone}</span>}
                            {draft.audience_segment && (
                              <span>Audience: {draft.audience_segment}</span>
                            )}
                            <span>{formatDate(draft.created_at)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {draft.body.slice(0, 150)}
                            {draft.body.length > 150 ? "…" : ""}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
