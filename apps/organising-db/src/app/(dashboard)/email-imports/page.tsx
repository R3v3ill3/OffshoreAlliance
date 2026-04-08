"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  Mail,
  Sparkles,
  Loader2,
  Check,
  Eye,
  ArrowRight,
  Inbox,
  Tag,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/supabase/auth-context";
import {
  useEmailImports,
  useEmailImportDetail,
  useAnalyseEmailImport,
  useUpdateEmailImport,
  useImportAsTemplate,
  type EmailImportRow,
  type EmailAnalysis,
} from "@/lib/hooks/useEmailImports";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";

const STATUS_META: Record<
  string,
  { label: string; variant: "default" | "secondary" | "info" | "destructive" }
> = {
  pending: { label: "Pending", variant: "secondary" },
  analysed: { label: "Analysed", variant: "info" },
  reviewed: { label: "Reviewed", variant: "default" },
  imported: { label: "Imported", variant: "default" },
  failed: { label: "Failed", variant: "destructive" },
};

const STAGE_NAMES: Record<number, string> = {
  1: "Contact ID & Mapping",
  2: "Intro Comms & Education",
  3: "Member Mobilisation",
  4: "Develop Claims / MSD",
  5: "Endorsement & Commence Bargaining",
  6: "Bargaining to Win",
};

const TONE_LABELS: Record<string, string> = {
  informative: "Informative",
  urgency: "Urgency",
  shared_responsibility: "Shared Responsibility",
  success_story: "Success Story",
  solidarity: "Solidarity",
  fairness: "Fairness",
  worker_voice: "Worker Voice",
  job_security: "Job Security",
};

const AUDIENCE_LABELS: Record<string, string> = {
  existing_members: "Existing Members",
  lapsed_members: "Lapsed Members",
  non_members_known: "Non-Members (Known)",
  non_members_unknown: "Non-Members (Unknown)",
  all_workers: "All Workers",
  bargaining_reps: "Bargaining Reps",
  hsrs: "HSRs",
  delegates: "Delegates",
  marine_workers: "Marine Workers",
  catering_workers: "Catering Workers",
};

const ACTIVITY_LABELS: Record<string, string> = {
  first_contact: "First Contact",
  education: "Education",
  mobilisation: "Mobilisation",
  bargaining_update: "Bargaining Update",
  action_alert: "Action Alert",
  survey: "Survey",
  meeting_invite: "Meeting Invite",
  membership_check: "Membership Check",
  general_update: "General Update",
};

export default function EmailImportsPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: imports, isLoading } = useEmailImports(statusFilter);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Email Imports</h1>
          <p className="text-muted-foreground mt-1">
            Forward emails to{" "}
            <code className="bg-muted px-1.5 py-0.5 rounded text-sm">
              templates@mail.oa.uconstruct.app
            </code>{" "}
            to import them as campaign templates.
          </p>
        </div>
      </div>

      <Tabs
        value={statusFilter ?? "all"}
        onValueChange={(v) => setStatusFilter(v === "all" ? undefined : v)}
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="analysed">Analysed</TabsTrigger>
          <TabsTrigger value="reviewed">Reviewed</TabsTrigger>
          <TabsTrigger value="imported">Imported</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <EurekaLoadingSpinner />
        </div>
      ) : !imports?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold">No emails imported yet</h3>
            <p className="text-muted-foreground mt-1 max-w-md">
              Forward a sample campaign email to{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-sm">
                templates@mail.oa.uconstruct.app
              </code>{" "}
              with a subject tag like{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-sm">
                [initiate-bargaining]
              </code>{" "}
              to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {imports.map((item) => (
            <ImportCard
              key={item.import_id}
              item={item}
              onSelect={() => setSelectedId(item.import_id)}
            />
          ))}
        </div>
      )}

      {selectedId && (
        <ImportDetailDialog
          importId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function ImportCard({
  item,
  onSelect,
}: {
  item: EmailImportRow;
  onSelect: () => void;
}) {
  const analyse = useAnalyseEmailImport();
  const meta = STATUS_META[item.analysis_status] ?? STATUS_META.pending;
  const analysis = item.ai_analysis as EmailAnalysis | null;

  return (
    <Card
      className="cursor-pointer hover:border-primary/30 transition-colors"
      onClick={onSelect}
    >
      <CardContent className="flex items-center gap-4 py-4">
        <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{item.subject}</span>
            {item.subject_tag && (
              <Badge variant="secondary" className="shrink-0">
                <Tag className="h-3 w-3 mr-1" />
                {item.subject_tag}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span>{item.from_address || "Unknown sender"}</span>
            <span>{format(new Date(item.created_at), "d MMM yyyy HH:mm")}</span>
            {analysis?.stage_number && (
              <span>
                Stage {analysis.stage_number}:{" "}
                {STAGE_NAMES[analysis.stage_number]}
              </span>
            )}
          </div>
        </div>
        <Badge variant={meta.variant}>{meta.label}</Badge>
        {item.analysis_status === "pending" && (
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              analyse.mutate(item.import_id);
            }}
            disabled={analyse.isPending}
          >
            {analyse.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="ml-1.5">Analyse</span>
          </Button>
        )}
        {item.analysis_status === "imported" && (
          <Badge variant="default">
            <Check className="h-3 w-3 mr-1" />
            Template #{item.imported_template_id}
          </Badge>
        )}
        <Eye className="h-4 w-4 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function ImportDetailDialog({
  importId,
  onClose,
}: {
  importId: number;
  onClose: () => void;
}) {
  const { data: detail, isLoading } = useEmailImportDetail(importId);
  const analyse = useAnalyseEmailImport();
  const updateImport = useUpdateEmailImport();
  const importAsTemplate = useImportAsTemplate();

  const [editMode, setEditMode] = useState(false);
  const [editedAnalysis, setEditedAnalysis] = useState<Partial<EmailAnalysis>>(
    {}
  );

  const analysis = detail?.ai_analysis as EmailAnalysis | null;
  const currentAnalysis = editMode
    ? { ...analysis, ...editedAnalysis }
    : analysis;

  const handleSaveReview = async () => {
    if (!detail || !editedAnalysis) return;

    const merged = { ...(detail.ai_analysis as object), ...editedAnalysis };
    await updateImport.mutateAsync({
      importId,
      updates: {
        ai_analysis: merged as EmailAnalysis,
        analysis_status: "reviewed",
      },
    });
    setEditMode(false);
  };

  const handleImport = () => {
    if (!detail) return;
    importAsTemplate.mutate(
      {
        importId,
        overrides: editMode
          ? {
              title: (editedAnalysis as EmailAnalysis).suggested_title,
              stage_number:
                (editedAnalysis as EmailAnalysis).stage_number ?? undefined,
              tone_tags: (editedAnalysis as EmailAnalysis).tone_tags,
              audience_segment: (editedAnalysis as EmailAnalysis)
                .audience_segment,
              activity_type: (editedAnalysis as EmailAnalysis).activity_type,
            }
          : undefined,
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {detail?.subject ?? "Loading..."}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !detail ? (
          <div className="flex justify-center py-12">
            <EurekaLoadingSpinner />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Email Preview */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Email Preview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground mb-2">
                    <span className="font-medium">From:</span>{" "}
                    {detail.from_address || "Unknown"}
                  </div>
                  <div className="text-sm text-muted-foreground mb-3">
                    <span className="font-medium">Subject:</span>{" "}
                    {detail.subject}
                  </div>
                  {detail.body_html ? (
                    <div
                      className="border rounded-lg p-4 bg-white text-sm overflow-auto max-h-[500px]"
                      dangerouslySetInnerHTML={{ __html: detail.body_html }}
                    />
                  ) : (
                    <div className="border rounded-lg p-4 bg-muted/30 text-sm whitespace-pre-wrap max-h-[500px] overflow-auto">
                      {detail.body_text || "No content available"}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right: Analysis */}
            <div className="space-y-4">
              {!analysis && detail.analysis_status === "pending" && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-8">
                    <AlertCircle className="h-8 w-8 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground mb-4">
                      This email hasn&apos;t been analysed yet.
                    </p>
                    <Button
                      onClick={() => analyse.mutate(importId)}
                      disabled={analyse.isPending}
                    >
                      {analyse.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      Run AI Analysis
                    </Button>
                  </CardContent>
                </Card>
              )}

              {currentAnalysis && (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Campaign Context Analysis
                      </CardTitle>
                      {!editMode &&
                        detail.analysis_status !== "imported" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditedAnalysis({ ...analysis });
                              setEditMode(true);
                            }}
                          >
                            Edit
                          </Button>
                        )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Suggested Title */}
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Template Title
                      </Label>
                      {editMode ? (
                        <Input
                          value={
                            (editedAnalysis as EmailAnalysis).suggested_title ??
                            currentAnalysis.suggested_title ??
                            ""
                          }
                          onChange={(e) =>
                            setEditedAnalysis((prev) => ({
                              ...prev,
                              suggested_title: e.target.value,
                            }))
                          }
                          className="mt-1"
                        />
                      ) : (
                        <p className="text-sm font-medium mt-0.5">
                          {currentAnalysis.suggested_title}
                        </p>
                      )}
                    </div>

                    {/* Stage */}
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Campaign Stage
                      </Label>
                      {editMode ? (
                        <Select
                          value={String(
                            (editedAnalysis as EmailAnalysis).stage_number ??
                              currentAnalysis.stage_number ??
                              ""
                          )}
                          onValueChange={(v) =>
                            setEditedAnalysis((prev) => ({
                              ...prev,
                              stage_number: v ? Number(v) : null,
                            }))
                          }
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select stage" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STAGE_NAMES).map(([n, name]) => (
                              <SelectItem key={n} value={n}>
                                {n}. {name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm mt-0.5">
                          {currentAnalysis.stage_number
                            ? `Stage ${currentAnalysis.stage_number}: ${STAGE_NAMES[currentAnalysis.stage_number]}`
                            : "Not determined"}
                        </p>
                      )}
                      {currentAnalysis.stage_rationale && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {currentAnalysis.stage_rationale}
                        </p>
                      )}
                    </div>

                    {/* Tone Tags */}
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Tone
                      </Label>
                      {editMode ? (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {Object.entries(TONE_LABELS).map(([key, label]) => {
                            const selected = (
                              (editedAnalysis as EmailAnalysis).tone_tags ??
                              currentAnalysis.tone_tags ??
                              []
                            ).includes(key);
                            return (
                              <Badge
                                key={key}
                                variant={selected ? "default" : "outline"}
                                className="cursor-pointer"
                                onClick={() => {
                                  const current =
                                    (editedAnalysis as EmailAnalysis)
                                      .tone_tags ??
                                    currentAnalysis.tone_tags ??
                                    [];
                                  setEditedAnalysis((prev) => ({
                                    ...prev,
                                    tone_tags: selected
                                      ? current.filter((t) => t !== key)
                                      : [...current, key],
                                  }));
                                }}
                              >
                                {label}
                              </Badge>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {(currentAnalysis.tone_tags ?? []).map((t) => (
                            <Badge key={t} variant="secondary">
                              {TONE_LABELS[t] ?? t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Audience */}
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Target Audience
                      </Label>
                      {editMode ? (
                        <Select
                          value={
                            (editedAnalysis as EmailAnalysis)
                              .audience_segment ??
                            currentAnalysis.audience_segment ??
                            ""
                          }
                          onValueChange={(v) =>
                            setEditedAnalysis((prev) => ({
                              ...prev,
                              audience_segment: v,
                            }))
                          }
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select audience" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(AUDIENCE_LABELS).map(
                              ([key, label]) => (
                                <SelectItem key={key} value={key}>
                                  {label}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm mt-0.5">
                          {AUDIENCE_LABELS[
                            currentAnalysis.audience_segment ?? ""
                          ] ?? currentAnalysis.audience_segment}
                        </p>
                      )}
                      {currentAnalysis.target_audience_description && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {currentAnalysis.target_audience_description}
                        </p>
                      )}
                    </div>

                    {/* Activity Type */}
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Activity Type
                      </Label>
                      {editMode ? (
                        <Select
                          value={
                            (editedAnalysis as EmailAnalysis).activity_type ??
                            currentAnalysis.activity_type ??
                            ""
                          }
                          onValueChange={(v) =>
                            setEditedAnalysis((prev) => ({
                              ...prev,
                              activity_type: v,
                            }))
                          }
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select activity" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(ACTIVITY_LABELS).map(
                              ([key, label]) => (
                                <SelectItem key={key} value={key}>
                                  {label}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm mt-0.5">
                          {ACTIVITY_LABELS[
                            currentAnalysis.activity_type ?? ""
                          ] ?? currentAnalysis.activity_type}
                        </p>
                      )}
                    </div>

                    {/* Key Themes */}
                    {(currentAnalysis.key_themes?.length ?? 0) > 0 && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Key Themes
                        </Label>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {currentAnalysis.key_themes!.map((theme) => (
                            <Badge
                              key={theme}
                              variant="outline"
                              className="text-xs"
                            >
                              {theme}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Call to Action */}
                    {currentAnalysis.call_to_action && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Call to Action
                        </Label>
                        <p className="text-sm mt-0.5">
                          {currentAnalysis.call_to_action}
                        </p>
                      </div>
                    )}

                    {/* Design Elements */}
                    {currentAnalysis.design_elements && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Design Elements
                        </Label>
                        <div className="mt-1 space-y-1 text-sm">
                          <p>
                            Layout:{" "}
                            {currentAnalysis.design_elements.layout_type?.replace(
                              /_/g,
                              " "
                            )}
                          </p>
                          {currentAnalysis.design_elements.font_families
                            ?.length > 0 && (
                            <p>
                              Fonts:{" "}
                              {currentAnalysis.design_elements.font_families.join(
                                ", "
                              )}
                            </p>
                          )}
                          {currentAnalysis.design_elements.primary_colors
                            ?.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <span>Colours:</span>
                              {currentAnalysis.design_elements.primary_colors.map(
                                (c) => (
                                  <span
                                    key={c}
                                    className="inline-block h-4 w-4 rounded border"
                                    style={{ backgroundColor: c }}
                                    title={c}
                                  />
                                )
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* WTP Suggestions */}
                    {(currentAnalysis.suggested_wtp_categories?.length ?? 0) > 0 && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Suggested Where to Play Mappings
                        </Label>
                        <div className="mt-1 space-y-1">
                          {currentAnalysis.suggested_wtp_categories!.map(
                            (wtp, i) => (
                              <div key={i} className="text-sm">
                                <span className="font-medium">
                                  {wtp.category}:
                                </span>{" "}
                                {wtp.option}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {/* Detected Variables */}
                    {(currentAnalysis.variables?.length ?? 0) > 0 && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Detected Variables
                        </Label>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {currentAnalysis.variables!.map((v) => (
                            <Badge
                              key={v}
                              variant="secondary"
                              className="font-mono text-xs"
                            >
                              {`{{${v}}}`}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                {editMode && (
                  <>
                    <Button
                      onClick={handleSaveReview}
                      disabled={updateImport.isPending}
                    >
                      {updateImport.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Check className="h-4 w-4 mr-2" />
                      )}
                      Save Review
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setEditMode(false)}
                    >
                      Cancel
                    </Button>
                  </>
                )}

                {detail.analysis_status !== "imported" &&
                  detail.analysis_status !== "pending" && (
                    <Button
                      variant={editMode ? "outline" : "default"}
                      onClick={handleImport}
                      disabled={importAsTemplate.isPending}
                    >
                      {importAsTemplate.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <ArrowRight className="h-4 w-4 mr-2" />
                      )}
                      Import as Template
                    </Button>
                  )}

                {detail.analysis_status === "imported" && (
                  <Badge variant="default" className="py-2 px-3 text-sm">
                    <Check className="h-4 w-4 mr-2" />
                    Imported as Template #{detail.imported_template_id}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
