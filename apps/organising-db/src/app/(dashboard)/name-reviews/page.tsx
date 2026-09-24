"use client";

import { useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { describeDecision } from "@/lib/hooks/useDecideNameMatch";
import {
  useNameReviewImports,
  type NameReviewEntity,
  type NameReviewStatusFilter,
} from "@/lib/hooks/useNameMatchReviews";
import { ReviewList } from "./_components/review-list";
import { formatDate, type DecisionReport } from "./_components/review-row";

/**
 * DA0.3 — Name Reviews (docs/data-architecture/wp/da0.3.md §2.5).
 *
 * The queue of employer and worksite strings an import could not resolve.
 * Everyone signed in may read it (the wizards link organisers here); only
 * admins decide, and every decision goes through the decide route.
 */

const ENTITY_OPTIONS: { value: NameReviewEntity; label: string }[] = [
  { value: "employer", label: "Employers" },
  { value: "worksite", label: "Worksites" },
];

const STATUS_OPTIONS: { value: NameReviewStatusFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "auto", label: "Auto-matched" },
  { value: "decided", label: "Decided" },
  { value: "all", label: "All" },
];

const ALL_IMPORTS = "all";

export default function NameReviewsPage() {
  const { isAdmin } = useAuth();
  const [entity, setEntity] = useState<NameReviewEntity>("employer");
  const [status, setStatus] = useState<NameReviewStatusFilter>("open");
  const [importId, setImportId] = useState<number | null>(null);
  const [lastDecision, setLastDecision] = useState<DecisionReport | null>(null);
  const imports = useNameReviewImports();

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Name Reviews</h1>
        <p className="text-sm text-muted-foreground">
          Employer and worksite names from imports that did not match an existing record. Map each
          one to an existing {entity} (or its alias); create a new one only when nothing fits.
        </p>
      </div>

      {!isAdmin && (
        <p className="text-sm text-muted-foreground">Match decisions can only be made by admins.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {ENTITY_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            size="sm"
            variant={entity === opt.value ? "default" : "outline"}
            onClick={() => setEntity(opt.value)}
            aria-pressed={entity === opt.value}
          >
            {opt.label}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground mx-2">|</span>
        {STATUS_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            size="sm"
            variant={status === opt.value ? "default" : "outline"}
            onClick={() => setStatus(opt.value)}
            aria-pressed={status === opt.value}
          >
            {opt.label}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground mx-2">|</span>
        <Select
          value={importId == null ? ALL_IMPORTS : String(importId)}
          onValueChange={(v) => setImportId(v === ALL_IMPORTS ? null : Number(v))}
        >
          <SelectTrigger className="h-8 w-[260px]" aria-label="Import">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_IMPORTS}>All imports</SelectItem>
            {(imports.data ?? []).map((imp) => (
              <SelectItem key={imp.import_id} value={String(imp.import_id)}>
                {imp.file_name} · {formatDate(imp.imported_at)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {lastDecision && (
        <div
          className="flex items-start justify-between gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950"
          role="status"
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-700 dark:text-green-300" />
            <div>
              <div>
                <span className="font-medium">{lastDecision.rawName}</span>:{" "}
                {describeDecision(lastDecision.action, lastDecision.result)}
              </div>
              {lastDecision.result.universeSyncError && (
                <div className="text-destructive">
                  Campaign lists were not refreshed: {lastDecision.result.universeSyncError}
                </div>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLastDecision(null)}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <ReviewList
        filters={{ entity, status, importId }}
        isAdmin={isAdmin}
        onDecided={setLastDecision}
      />
    </div>
  );
}
