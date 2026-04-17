"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Sparkles,
  Pencil,
  XCircle,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
} from "lucide-react";
import { useAuth } from "@/lib/supabase/auth-context";
import {
  useTemplateLibrary,
  useCreateTemplate,
  useUpdateTemplate,
  useDeactivateTemplate,
  useAnalyseTemplate,
  type TemplateRow,
} from "@/lib/hooks/useTemplateLibrary";
import { TemplateEditor } from "@/components/templates/template-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";

const PLATFORM_META: Record<string, { label: string; icon: typeof Mail; variant: "default" | "info" | "secondary" }> = {
  email: { label: "Email", icon: Mail, variant: "info" },
  sms: { label: "SMS", icon: MessageSquare, variant: "default" },
  phone_script: { label: "Phone Script", icon: Phone, variant: "secondary" },
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

const ALL_TONES = Object.keys(TONE_LABELS);
const ALL_AUDIENCES = Object.keys(AUDIENCE_LABELS);
const ALL_ACTIVITIES = Object.keys(ACTIVITY_LABELS);

const INITIAL_FORM = {
  title: "",
  subject_line: "",
  body_text: "",
  platform: "email" as "email" | "sms" | "phone_script",
  stage_number: "" as string,
  tone_tags: [] as string[],
  audience_segment: "",
  activity_type: "",
};

function TemplateCard({
  template,
  canWrite,
  onEdit,
  onDeactivate,
}: {
  template: TemplateRow;
  canWrite: boolean;
  onEdit: (template: TemplateRow) => void;
  onDeactivate: (id: number) => void;
}) {
  const meta = PLATFORM_META[template.platform];
  const Icon = meta?.icon ?? Mail;

  return (
    <Card className="group">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm truncate">{template.title}</h3>
              <Badge variant={meta?.variant ?? "default"} className="shrink-0">
                <Icon className="h-3 w-3 mr-1" />
                {meta?.label ?? template.platform}
              </Badge>
              {template.stage_number && (
                <Badge variant="outline" className="shrink-0">
                  Stage {template.stage_number}
                </Badge>
              )}
            </div>

            {template.audience_segment && (
              <p className="text-xs text-muted-foreground mt-1">
                {AUDIENCE_LABELS[template.audience_segment] ?? template.audience_segment}
              </p>
            )}

            {template.tone_tags && template.tone_tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {template.tone_tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                    {TONE_LABELS[tag] ?? tag}
                  </Badge>
                ))}
              </div>
            )}

            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
              {template.body_text.slice(0, 150)}
              {template.body_text.length > 150 ? "…" : ""}
            </p>
          </div>

          {canWrite && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Edit template"
                onClick={() => onEdit(template)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                title="Deactivate template"
                onClick={() => onDeactivate(template.template_id)}
              >
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EditTemplateDialog({
  template,
  onClose,
}: {
  template: TemplateRow;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: template.title,
    subject_line: template.subject_line ?? "",
    body_text: template.body_text,
    platform: template.platform as "email" | "sms" | "phone_script",
    stage_number: template.stage_number ? String(template.stage_number) : "",
    tone_tags: template.tone_tags ?? ([] as string[]),
    audience_segment: template.audience_segment ?? "",
    activity_type: template.activity_type ?? "",
  });
  const [analysed, setAnalysed] = useState(false);

  const updateMutation = useUpdateTemplate();
  const analyseMutation = useAnalyseTemplate();

  const handleAnalyse = async () => {
    if (!form.body_text.trim()) return;
    const result = await analyseMutation.mutateAsync({
      content: form.body_text,
      platform: form.platform,
    });
    setForm((prev) => ({
      ...prev,
      stage_number: result.stage_number ? String(result.stage_number) : "",
      tone_tags: result.tone_tags ?? [],
      audience_segment: result.audience_segment ?? "",
      activity_type: result.activity_type ?? "",
      platform: result.platform ?? prev.platform,
    }));
    setAnalysed(true);
  };

  const handleSave = async () => {
    await updateMutation.mutateAsync({
      template_id: template.template_id,
      title: form.title,
      subject_line: form.platform === "email" && form.subject_line ? form.subject_line : undefined,
      body_text: form.body_text,
      platform: form.platform,
      stage_number: form.stage_number ? Number(form.stage_number) : undefined,
      tone_tags: form.tone_tags.length > 0 ? form.tone_tags : undefined,
      audience_segment: form.audience_segment || undefined,
      activity_type: form.activity_type || undefined,
      variables: extractVariables(form.body_text),
    });
    onClose();
  };

  const detectedVars = useMemo(() => {
    const matches = form.body_text.match(/\{\{(\w+)\}\}/g);
    if (!matches) return [];
    return [...new Set(matches)];
  }, [form.body_text]);

  const toggleTone = (tone: string) => {
    setForm((prev) => ({
      ...prev,
      tone_tags: prev.tone_tags.includes(tone)
        ? prev.tone_tags.filter((t) => t !== tone)
        : [...prev.tone_tags, tone],
    }));
  };

  return (
    <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Edit Template</DialogTitle>
      </DialogHeader>

      <div className="grid gap-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="edit-tmpl-title">Title *</Label>
          <Input
            id="edit-tmpl-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>Platform *</Label>
          <Select
            value={form.platform}
            onValueChange={(v) =>
              setForm({ ...form, platform: v as "email" | "sms" | "phone_script" })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="phone_script">Phone Script</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {form.platform === "email" && (
          <div className="space-y-2">
            <Label htmlFor="edit-tmpl-subject">Subject line</Label>
            <Input
              id="edit-tmpl-subject"
              value={form.subject_line}
              onChange={(e) => setForm({ ...form, subject_line: e.target.value })}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Template content *</Label>
          <TemplateEditor
            value={form.body_text}
            onChange={(v) => setForm({ ...form, body_text: v })}
            platform={form.platform}
          />
        </div>

        {detectedVars.length > 0 && (
          <div>
            <Label className="text-xs text-muted-foreground">Detected variables</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {detectedVars.map((v) => (
                <Badge key={v} variant="outline" className="font-mono text-xs">
                  {v}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleAnalyse}
            disabled={!form.body_text.trim() || analyseMutation.isPending}
            className="gap-2"
          >
            {analyseMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {analyseMutation.isPending ? "Analysing…" : "Analyse with AI"}
          </Button>
          {analysed && (
            <span className="text-xs text-emerald-600 font-medium">
              AI suggestions applied — adjust below if needed
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Stage</Label>
            <Select
              value={form.stage_number}
              onValueChange={(v) => setForm({ ...form, stage_number: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Stage 1 — Contact ID & Mapping</SelectItem>
                <SelectItem value="2">Stage 2 — Intro Comms & Education</SelectItem>
                <SelectItem value="3">Stage 3 — Member Mobilisation</SelectItem>
                <SelectItem value="4">Stage 4 — Develop Claims / MSD</SelectItem>
                <SelectItem value="5">Stage 5 — Endorsement & Commence Bargaining</SelectItem>
                <SelectItem value="6">Stage 6 — Bargaining to Win</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Audience</Label>
            <Select
              value={form.audience_segment}
              onValueChange={(v) => setForm({ ...form, audience_segment: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select audience" />
              </SelectTrigger>
              <SelectContent>
                {ALL_AUDIENCES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {AUDIENCE_LABELS[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Activity type</Label>
          <Select
            value={form.activity_type}
            onValueChange={(v) => setForm({ ...form, activity_type: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select activity type" />
            </SelectTrigger>
            <SelectContent>
              {ALL_ACTIVITIES.map((a) => (
                <SelectItem key={a} value={a}>
                  {ACTIVITY_LABELS[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Tone tags</Label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_TONES.map((tone) => (
              <Badge
                key={tone}
                variant={form.tone_tags.includes(tone) ? "default" : "outline"}
                className="cursor-pointer select-none"
                onClick={() => toggleTone(tone)}
              >
                {TONE_LABELS[tone]}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={!form.title || !form.body_text.trim() || updateMutation.isPending}
        >
          {updateMutation.isPending ? "Saving…" : "Update Template"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function extractVariables(text: string): Record<string, unknown> | undefined {
  const matches = text.match(/\{\{(\w+)\}\}/g);
  if (!matches || matches.length === 0) return undefined;
  const vars = [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")))];
  return { detected: vars };
}

function UploadTemplateDialog({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [analysed, setAnalysed] = useState(false);

  const createMutation = useCreateTemplate();
  const analyseMutation = useAnalyseTemplate();

  const handleAnalyse = async () => {
    if (!form.body_text.trim()) return;
    const result = await analyseMutation.mutateAsync({
      content: form.body_text,
      platform: form.platform,
    });

    setForm((prev) => ({
      ...prev,
      stage_number: result.stage_number ? String(result.stage_number) : "",
      tone_tags: result.tone_tags ?? [],
      audience_segment: result.audience_segment ?? "",
      activity_type: result.activity_type ?? "",
      platform: result.platform ?? prev.platform,
    }));
    setAnalysed(true);
  };

  const handleSave = async () => {
    await createMutation.mutateAsync({
      title: form.title,
      subject_line: form.platform === "email" && form.subject_line ? form.subject_line : undefined,
      body_text: form.body_text,
      platform: form.platform,
      stage_number: form.stage_number ? Number(form.stage_number) : undefined,
      tone_tags: form.tone_tags.length > 0 ? form.tone_tags : undefined,
      audience_segment: form.audience_segment || undefined,
      activity_type: form.activity_type || undefined,
      variables: extractVariables(form.body_text),
    });
    onClose();
  };

  const detectedVars = useMemo(() => {
    const matches = form.body_text.match(/\{\{(\w+)\}\}/g);
    if (!matches) return [];
    return [...new Set(matches)];
  }, [form.body_text]);

  const toggleTone = (tone: string) => {
    setForm((prev) => ({
      ...prev,
      tone_tags: prev.tone_tags.includes(tone)
        ? prev.tone_tags.filter((t) => t !== tone)
        : [...prev.tone_tags, tone],
    }));
  };

  return (
    <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Upload Template</DialogTitle>
      </DialogHeader>

      <div className="grid gap-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="tmpl-title">Title *</Label>
          <Input
            id="tmpl-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Stage 2 Education Email – NWS"
          />
        </div>

        <div className="space-y-2">
          <Label>Platform *</Label>
          <Select
            value={form.platform}
            onValueChange={(v) =>
              setForm({ ...form, platform: v as "email" | "sms" | "phone_script" })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="phone_script">Phone Script</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {form.platform === "email" && (
          <div className="space-y-2">
            <Label htmlFor="tmpl-subject">Subject line</Label>
            <Input
              id="tmpl-subject"
              value={form.subject_line}
              onChange={(e) => setForm({ ...form, subject_line: e.target.value })}
              placeholder="e.g. Important update about your EA"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Template content *</Label>
          <TemplateEditor
            value={form.body_text}
            onChange={(v) => setForm({ ...form, body_text: v })}
            platform={form.platform}
          />
        </div>

        {detectedVars.length > 0 && (
          <div>
            <Label className="text-xs text-muted-foreground">Detected variables</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {detectedVars.map((v) => (
                <Badge key={v} variant="outline" className="font-mono text-xs">
                  {v}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleAnalyse}
            disabled={!form.body_text.trim() || analyseMutation.isPending}
            className="gap-2"
          >
            {analyseMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {analyseMutation.isPending ? "Analysing…" : "Analyse with AI"}
          </Button>
          {analysed && (
            <span className="text-xs text-emerald-600 font-medium">
              AI suggestions applied — adjust below if needed
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Stage</Label>
            <Select
              value={form.stage_number}
              onValueChange={(v) => setForm({ ...form, stage_number: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Stage 1 — Contact ID & Mapping</SelectItem>
                <SelectItem value="2">Stage 2 — Intro Comms & Education</SelectItem>
                <SelectItem value="3">Stage 3 — Member Mobilisation</SelectItem>
                <SelectItem value="4">Stage 4 — Develop Claims / MSD</SelectItem>
                <SelectItem value="5">Stage 5 — Endorsement & Commence Bargaining</SelectItem>
                <SelectItem value="6">Stage 6 — Bargaining to Win</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Audience</Label>
            <Select
              value={form.audience_segment}
              onValueChange={(v) => setForm({ ...form, audience_segment: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select audience" />
              </SelectTrigger>
              <SelectContent>
                {ALL_AUDIENCES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {AUDIENCE_LABELS[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Activity type</Label>
          <Select
            value={form.activity_type}
            onValueChange={(v) => setForm({ ...form, activity_type: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select activity type" />
            </SelectTrigger>
            <SelectContent>
              {ALL_ACTIVITIES.map((a) => (
                <SelectItem key={a} value={a}>
                  {ACTIVITY_LABELS[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Tone tags</Label>
          <div className="flex flex-wrap gap-1.5">
            {ALL_TONES.map((tone) => (
              <Badge
                key={tone}
                variant={form.tone_tags.includes(tone) ? "default" : "outline"}
                className="cursor-pointer select-none"
                onClick={() => toggleTone(tone)}
              >
                {TONE_LABELS[tone]}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={!form.title || !form.body_text.trim() || createMutation.isPending}
        >
          {createMutation.isPending ? "Saving…" : "Save Template"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function TemplatesTab() {
  const { user, canWrite } = useAuth();
  const [platformFilter, setPlatformFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateRow | null>(null);

  const filters = useMemo(
    () => ({
      platform: platformFilter !== "all" ? platformFilter : undefined,
      stage_number: stageFilter !== "all" ? Number(stageFilter) : undefined,
      is_active: true,
    }),
    [platformFilter, stageFilter],
  );

  const { data: templates = [], isLoading } = useTemplateLibrary(filters);
  const deactivateMutation = useDeactivateTemplate();

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return templates;
    const q = searchQuery.toLowerCase();
    return templates.filter(
      (t) =>
        t.title.toLowerCase().includes(q) || t.body_text.toLowerCase().includes(q),
    );
  }, [templates, searchQuery]);

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        {canWrite && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Upload Template
              </Button>
            </DialogTrigger>
            {dialogOpen && (
              <UploadTemplateDialog onClose={() => setDialogOpen(false)} />
            )}
          </Dialog>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Tabs
          value={platformFilter}
          onValueChange={setPlatformFilter}
          className="w-auto"
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="email">
              <Mail className="h-3.5 w-3.5 mr-1" />
              Email
            </TabsTrigger>
            <TabsTrigger value="sms">
              <MessageSquare className="h-3.5 w-3.5 mr-1" />
              SMS
            </TabsTrigger>
            <TabsTrigger value="phone_script">
              <Phone className="h-3.5 w-3.5 mr-1" />
              Phone
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            <SelectItem value="1">Stage 1</SelectItem>
            <SelectItem value="2">Stage 2</SelectItem>
            <SelectItem value="3">Stage 3</SelectItem>
            <SelectItem value="4">Stage 4</SelectItem>
            <SelectItem value="5">Stage 5</SelectItem>
            <SelectItem value="6">Stage 6</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <EurekaLoadingSpinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <p className="text-muted-foreground">
            {searchQuery
              ? "No templates match your search."
              : "No templates found. Upload your first template to get started."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((template) => (
            <TemplateCard
              key={template.template_id}
              template={template}
              canWrite={!!canWrite}
              onEdit={(t) => setEditingTemplate(t)}
              onDeactivate={(id) => deactivateMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* Edit template dialog */}
      <Dialog
        open={!!editingTemplate}
        onOpenChange={(open) => { if (!open) setEditingTemplate(null); }}
      >
        {editingTemplate && (
          <EditTemplateDialog
            template={editingTemplate}
            onClose={() => setEditingTemplate(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
