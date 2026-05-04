"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { format } from "date-fns";
import { Download, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";

// ── Types ──────────────────────────────────────────────────────────────────────

export type DocumentType =
  | "flyer"
  | "social"
  | "legal-correspondence"
  | "company-correspondence"
  | "media-article"
  | "research"
  | "other";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  flyer: "Flyer",
  social: "Social",
  "legal-correspondence": "Legal",
  "company-correspondence": "Company",
  "media-article": "Media",
  research: "Research",
  other: "Other",
};

export const DOCUMENT_TYPE_VARIANTS: Record<
  DocumentType,
  "default" | "secondary" | "info" | "warning" | "success" | "destructive" | "outline"
> = {
  flyer: "info",
  social: "success",
  "legal-correspondence": "destructive",
  "company-correspondence": "warning",
  "media-article": "secondary",
  research: "default",
  other: "outline",
};

interface DocumentRow {
  document_id: number;
  title: string;
  document_type: string;
  file_path: string;
  created_at: string;
}

interface Props {
  campaignId: number;
  canWrite: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(d: string) {
  try {
    return format(new Date(d), "dd MMM yyyy");
  } catch {
    return d;
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export function CampaignLibraryDocuments({ campaignId, canWrite }: Props) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filterType, setFilterType] = useState<DocumentType | "all">("all");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadType, setUploadType] = useState<DocumentType>("other");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["campaign-documents", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("document_id, title, document_type, file_path, created_at")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocumentRow[];
    },
    enabled: !!user && !!campaignId,
  });

  // ── Upload mutation ───────────────────────────────────────────────────────────

  const uploadMutation = useAuthAwareMutation({
    mutationFn: async (file: File) => {
      if (!uploadTitle.trim()) throw new Error("Title is required");
      const ext = file.name.split(".").pop() ?? "";
      const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const storagePath = `${campaignId}/${safeName}`;

      const { error: storageError } = await supabase.storage
        .from("campaign-documents")
        .upload(storagePath, file, { upsert: false });
      if (storageError) throw storageError;

      const { error: dbError } = await supabase.from("documents").insert({
        campaign_id: campaignId,
        title: uploadTitle.trim(),
        document_type: uploadType,
        file_path: storagePath,
        uploaded_by: user?.id ?? null,
      });
      if (dbError) {
        // Roll back the storage upload if the DB insert fails.
        await supabase.storage.from("campaign-documents").remove([storagePath]);
        throw dbError;
      }
      // Suppress unused variable warning for ext
      void ext;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-documents", campaignId] });
      setUploadTitle("");
      setUploadType("other");
      setUploadError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError(msg);
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    uploadMutation.mutate(file);
  }

  // ── Delete handler ────────────────────────────────────────────────────────────

  async function handleDelete(doc: DocumentRow) {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    setDeletingId(doc.document_id);
    try {
      await supabase.storage
        .from("campaign-documents")
        .remove([doc.file_path]);
      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("document_id", doc.document_id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["campaign-documents", campaignId] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      alert(msg);
    } finally {
      setDeletingId(null);
    }
  }

  // ── Download helper ───────────────────────────────────────────────────────────

  async function handleDownload(doc: DocumentRow) {
    const { data, error } = await supabase.storage
      .from("campaign-documents")
      .createSignedUrl(doc.file_path, 60);
    if (error || !data?.signedUrl) {
      alert("Could not generate download link");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  // ── Filtered list ─────────────────────────────────────────────────────────────

  const filtered =
    filterType === "all"
      ? documents
      : documents.filter((d) => d.document_type === filterType);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Upload panel */}
      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="doc-title">Title *</Label>
                <Input
                  id="doc-title"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. May Day flyer draft"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={uploadType}
                  onValueChange={(v) => setUploadType(v as DocumentType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map(
                      (t) => (
                        <SelectItem key={t} value={t}>
                          {DOCUMENT_TYPE_LABELS[t]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                disabled={!uploadTitle.trim() || uploadMutation.isPending}
              />
              <Button
                variant="outline"
                onClick={() => {
                  if (!uploadTitle.trim()) {
                    setUploadError("Enter a title before choosing a file.");
                    return;
                  }
                  fileInputRef.current?.click();
                }}
                disabled={uploadMutation.isPending}
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploadMutation.isPending ? "Uploading…" : "Choose file…"}
              </Button>
              {uploadError && (
                <p className="text-sm text-destructive">{uploadError}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={filterType === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterType("all")}
        >
          All{" "}
          {documents.length > 0 && (
            <span className="ml-1 opacity-70">({documents.length})</span>
          )}
        </Button>
        {(Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map((t) => {
          const count = documents.filter((d) => d.document_type === t).length;
          if (count === 0) return null;
          return (
            <Button
              key={t}
              variant={filterType === t ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterType(t)}
            >
              {DOCUMENT_TYPE_LABELS[t]}{" "}
              <span className="ml-1 opacity-70">({count})</span>
            </Button>
          );
        })}
      </div>

      {/* Document list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <EurekaLoadingSpinner />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          {documents.length === 0
            ? "No documents uploaded yet."
            : "No documents match the selected filter."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => {
            const typeKey = doc.document_type as DocumentType;
            const label = DOCUMENT_TYPE_LABELS[typeKey] ?? doc.document_type;
            const variant = DOCUMENT_TYPE_VARIANTS[typeKey] ?? "outline";
            return (
              <div
                key={doc.document_id}
                className="flex items-center gap-3 rounded-md border px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(doc.created_at)}
                  </p>
                </div>
                <Badge variant={variant}>{label}</Badge>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDownload(doc)}
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </Button>
                {canWrite && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(doc)}
                    disabled={deletingId === doc.document_id}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
