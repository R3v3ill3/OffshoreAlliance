"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { format } from "date-fns";
import { resolveTemplateVariables, translateToActionNetwork } from "@/lib/comms/template-variables";
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
  tag_name: string;
  contacts_tagged: number;
  contacts_created: number;
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
  const numericId = Number(campaignId);

  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  const { data: drafts = [], isLoading } = useQuery({
    queryKey: ["campaign-comms-drafts", numericId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_comms_drafts")
        .select("*")
        .eq("campaign_id", numericId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DraftRow[];
    },
    enabled: !!user,
  });

  const { data: campaignCtx } = useQuery({
    queryKey: ["campaign-send-context", numericId],
    queryFn: async () => {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("name, agreement_id, organiser_id")
        .eq("campaign_id", numericId)
        .single();

      let agreementName: string | undefined;
      let employerName: string | undefined;
      if (campaign?.agreement_id) {
        const { data: agreement } = await supabase
          .from("agreements")
          .select("agreement_name, employer_id")
          .eq("agreement_id", campaign.agreement_id)
          .single();
        agreementName = agreement?.agreement_name ?? undefined;
        if (agreement?.employer_id) {
          const { data: employer } = await supabase
            .from("employers")
            .select("employer_name")
            .eq("employer_id", agreement.employer_id)
            .single();
          employerName = employer?.employer_name ?? undefined;
        }
      }

      let organiserName: string | undefined;
      let organiserPhone: string | undefined;
      if (campaign?.organiser_id) {
        const { data: organiser } = await supabase
          .from("organisers")
          .select("organiser_name, phone")
          .eq("organiser_id", campaign.organiser_id)
          .single();
        organiserName = organiser?.organiser_name ?? undefined;
        organiserPhone = organiser?.phone ?? undefined;
      }

      const { data: worksiteLinks } = await supabase
        .from("campaign_worksites")
        .select("worksite_id")
        .eq("campaign_id", numericId)
        .limit(1);
      let worksiteName: string | undefined;
      if (worksiteLinks?.[0]?.worksite_id) {
        const { data: ws } = await supabase
          .from("worksites")
          .select("worksite_name")
          .eq("worksite_id", worksiteLinks[0].worksite_id)
          .single();
        worksiteName = ws?.worksite_name ?? undefined;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("display_name, phone, role")
        .eq("user_id", user!.id)
        .single();

      return {
        campaign_name: campaign?.name ?? undefined,
        agreement_name: agreementName,
        employer_name: employerName,
        worksite_name: worksiteName,
        organiser_name: organiserName,
        organiser_phone: organiserPhone,
        staff_name: profile?.display_name ?? user?.email ?? undefined,
        staff_email: user?.email ?? undefined,
        staff_phone: profile?.phone ?? undefined,
        staff_role: profile?.role ?? undefined,
        date: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
      } as Record<string, string | undefined>;
    },
    enabled: !!user,
  });

  const selectedDraft = drafts.find((d) => d.draft_id === selectedDraftId) ?? null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDraft) return;
      const { error } = await supabase
        .from("campaign_comms_drafts")
        .update({
          subject: editSubject || null,
          body: editBody,
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

  const approveMutation = useMutation({
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

  const sendAnMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDraft) throw new Error("No draft selected");
      const ctx = campaignCtx ?? {};
      const resolvedSubject = translateToActionNetwork(
        resolveTemplateVariables(selectedDraft.subject || selectedDraft.title || "No subject", ctx)
      );
      const resolvedBody = translateToActionNetwork(
        resolveTemplateVariables(selectedDraft.body_html || selectedDraft.body, ctx)
      );
      const messagePayload: Record<string, unknown> = {
        subject: resolvedSubject,
        body: resolvedBody,
        from: "Offshore Alliance",
        reply_to: "info@offshorealliance.org.au",
      };
      if (preparedTag?.tag_href) {
        messagePayload.targets = [{ href: preparedTag.tag_href }];
      }
      const createRes = await fetch("/api/action-network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_message",
          message: messagePayload,
        }),
      });
      const createData = await createRes.json();
      if (!createData.success) throw new Error(createData.error);

      const messageHref =
        createData.data?._links?.self?.href ?? "";
      const messageId = messageHref.split("/").pop() || "";

      const { error } = await supabase
        .from("campaign_comms_drafts")
        .update({
          status: "sent",
          sent_via: "action_network",
          external_message_id: messageId,
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

  const sendSmsMutation = useMutation({
    mutationFn: async (recipients: { to: string; message: string }[]) => {
      if (!selectedDraft) throw new Error("No draft selected");
      const res = await fetch("/api/yabbr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_bulk_sms",
          recipients,
          from: "OffshoreAlliance",
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const { error } = await supabase
        .from("campaign_comms_drafts")
        .update({
          status: "sent",
          sent_via: "yabbr",
          send_stats: {
            recipients_count: recipients.length,
            sent_at: new Date().toISOString(),
          },
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

  const pollStatsMutation = useMutation({
    mutationFn: async (draftId: number) => {
      const res = await fetch(`/api/campaigns/${numericId}/sync-an`, {
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
                            title="Select recipients in List Builder first"
                          >
                            <Send className="h-3.5 w-3.5" />
                            Send via Yabbr
                          </Button>
                        )}
                        {selectedDraft.platform === "phone_script" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              window.print();
                            }}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Print Script
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Error display */}
                {(sendAnMutation.isError || sendSmsMutation.isError) && (
                  <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3">
                    <p className="text-sm text-red-700 dark:text-red-400">
                      {sendAnMutation.error?.message ??
                        sendSmsMutation.error?.message ??
                        "Send failed"}
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
