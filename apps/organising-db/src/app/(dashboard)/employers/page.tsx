"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import type { Employer, EmployerCategory } from "@/types/database";
import type { Database } from "@oa/db-types";
import {
  DataTable,
  type Column,
  type DataTableSelection,
} from "@/components/data-tables/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Star, GitMerge } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const EMPLOYER_CATEGORIES: EmployerCategory[] = [
  "Principal_Employer",
  "Producer",
  "Major_Contractor",
  "Subcontractor",
  "Labour_Hire",
  "Specialist",
];

const AU_STATES = ["WA", "NT", "QLD", "SA", "NSW", "VIC", "TAS", "ACT"];

function buildAliasLines(
  selected: Employer[],
  survivorId: number,
  canonical: string
): string {
  const canon = canonical.trim().toLowerCase();
  const lines = new Set<string>();
  for (const e of selected) {
    const name = e.employer_name?.trim();
    if (name && name.toLowerCase() !== canon) lines.add(name);
    const tr = e.trading_name?.trim();
    if (tr && tr.toLowerCase() !== canon) lines.add(tr);
  }
  return [...lines].sort().join("\n");
}

type ParentMode = "none" | "existing" | "create_new";

const INITIAL_FORM = {
  employer_name: "",
  trading_name: "",
  abn: "",
  employer_category: "" as string,
  parent_company: "",
  website: "",
  phone: "",
  email: "",
  address: "",
  state: "" as string,
  postcode: "",
  // parent company fields
  parentMode: "none" as ParentMode,
  parent_employer_id: "" as string,
  new_parent_name: "",
};

type CategoryFilter = "all" | "Principal_Employer" | "other";

export default function EmployersPage() {
  const router = useRouter();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { canWrite, isAdmin } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [mergeSelectedIds, setMergeSelectedIds] = useState<Set<string>>(
    () => new Set()
  );
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeSurvivorId, setMergeSurvivorId] = useState<number | null>(null);
  const [mergeCanonicalName, setMergeCanonicalName] = useState("");
  const [mergeAliasesText, setMergeAliasesText] = useState("");
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeSubmitting, setMergeSubmitting] = useState(false);

  const { data: employers = [], isLoading, isError } = useQuery({
    queryKey: ["employers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employers")
        .select("*")
        .order("employer_category", { ascending: false })
        .order("employer_name");
      if (error) throw error;
      return data as Employer[];
    },
  });

  const { data: allScopes = [] } = useQuery({
    queryKey: ["work-scopes-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_scopes")
        .select("scope_id, scope_name, parent_scope_id, is_whole_of_project")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: employerScopeLinks = [] } = useQuery({
    queryKey: ["employer-scope-links"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employer_scopes")
        .select("employer_id, scope_id")
        .eq("is_current", true);
      if (error) throw error;
      return data as { employer_id: number; scope_id: number }[];
    },
  });

  const filteredEmployers = useMemo(() => {
    let list = employers;
    if (categoryFilter === "Principal_Employer") {
      list = list.filter((e) => e.employer_category === "Principal_Employer");
    } else if (categoryFilter === "other") {
      list = list.filter((e) => e.employer_category !== "Principal_Employer");
    }
    if (scopeFilter !== "all") {
      const scopeId = Number(scopeFilter);
      const ids = new Set(
        employerScopeLinks
          .filter((l) => l.scope_id === scopeId)
          .map((l) => l.employer_id)
      );
      list = list.filter((e) => ids.has(e.employer_id));
    }
    return list;
  }, [employers, categoryFilter, scopeFilter, employerScopeLinks]);

  const principalEmployers = useMemo(
    () => employers.filter((e) => e.employer_category === "Principal_Employer"),
    [employers]
  );

  const mergeSelectionEmployers = useMemo(() => {
    const ids = new Set(
      [...mergeSelectedIds]
        .map((s) => Number(s))
        .filter((n) => !Number.isNaN(n))
    );
    return employers.filter((e) => ids.has(e.employer_id));
  }, [employers, mergeSelectedIds]);

  const openMergeDialog = useCallback(() => {
    const sel = mergeSelectionEmployers;
    if (sel.length < 2) return;

    // Prefer a "root" employer — one whose parent is not in the selected set.
    // This avoids the parent_child_conflict guard in merge_employers, which
    // fires when the default survivor (lowest ID) is a child of another selected row.
    const selectedIds = new Set(sel.map((e) => e.employer_id));
    const roots = sel.filter(
      (e) => e.parent_employer_id == null || !selectedIds.has(e.parent_employer_id)
    );
    const candidates = roots.length > 0 ? roots : sel;
    const surv = [...candidates].sort((a, b) => a.employer_id - b.employer_id)[0];

    setMergeSurvivorId(surv.employer_id);
    setMergeCanonicalName(surv.employer_name);
    setMergeAliasesText(buildAliasLines(sel, surv.employer_id, surv.employer_name));
    setMergeError(null);
    setMergeDialogOpen(true);
  }, [mergeSelectionEmployers]);

  const tableSelection = useMemo<
    DataTableSelection<Employer & Record<string, unknown>> | undefined
  >(() => {
    if (!isAdmin) return undefined;
    return {
      rowId: (item) => String(item.employer_id),
      selectedIds: mergeSelectedIds,
      onToggleRow: (id, selected) => {
        setMergeSelectedIds((prev) => {
          const n = new Set(prev);
          if (selected) n.add(id);
          else n.delete(id);
          return n;
        });
      },
      onToggleAllVisible: (visibleRowIds, selected) => {
        setMergeSelectedIds((prev) => {
          const n = new Set(prev);
          for (const id of visibleRowIds) {
            if (selected) n.add(id);
            else n.delete(id);
          }
          return n;
        });
      },
    };
  }, [isAdmin, mergeSelectedIds]);

  const handleMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mergeSurvivorId == null) return;
    const victims = mergeSelectionEmployers
      .filter((row) => row.employer_id !== mergeSurvivorId)
      .map((row) => row.employer_id);
    if (victims.length < 1) {
      setMergeError("Choose at least two employers and a different canonical row.");
      return;
    }
    const canonical = mergeCanonicalName.trim();
    if (!canonical) {
      setMergeError("Canonical employer name is required.");
      return;
    }
    const alias_names = mergeAliasesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const surv = mergeSelectionEmployers.find(
      (row) => row.employer_id === mergeSurvivorId
    );
    setMergeSubmitting(true);
    setMergeError(null);
    try {
      const res = await fetch("/api/employers/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survivor_employer_id: mergeSurvivorId,
          victim_employer_ids: victims,
          canonical_employer_name: canonical,
          alias_names,
          expected_survivor_updated_at: surv?.updated_at ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMergeError(
          typeof data.message === "string"
            ? data.message
            : data.error ?? "Merge failed."
        );
        return;
      }
      if (data && data.success === false) {
        setMergeError(
          typeof data.message === "string" ? data.message : "Merge failed."
        );
        return;
      }
      setMergeDialogOpen(false);
      setMergeSelectedIds(new Set());
      setMergeSurvivorId(null);
      await queryClient.invalidateQueries({ queryKey: ["employers"] });
      await queryClient.invalidateQueries({ queryKey: ["employer-scope-links"] });
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : "Merge failed.");
    } finally {
      setMergeSubmitting(false);
    }
  };

  const columns: Column<Employer>[] = useMemo(
    () => [
      {
        key: "employer_name",
        header: "Name",
        render: (item) => (
          <span className="flex items-center gap-2">
            {item.employer_category === "Principal_Employer" && (
              <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
            )}
            {item.employer_name}
          </span>
        ),
      },
      { key: "trading_name", header: "Trading Name" },
      {
        key: "employer_category",
        header: "Category",
        render: (item) =>
          item.employer_category ? (
            <Badge
              variant={
                item.employer_category === "Principal_Employer"
                  ? "warning"
                  : "secondary"
              }
            >
              {item.employer_category.replace(/_/g, " ")}
            </Badge>
          ) : (
            "—"
          ),
      },
      {
        key: "parent_employer_id",
        header: "Parent Company",
        render: (item) => {
          if (!item.parent_employer_id) return "—";
          const parent = employers.find(
            (e) => e.employer_id === item.parent_employer_id
          );
          return parent ? parent.employer_name : "—";
        },
      },
      { key: "abn", header: "ABN" },
      {
        key: "is_active",
        header: "Active",
        render: (item) => (
          <Badge variant={item.is_active ? "success" : "destructive"}>
            {item.is_active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [employers]
  );

  const handleFieldChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetDialog = () => {
    setForm(INITIAL_FORM);
    setError(null);
    setSubmitting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employer_name.trim()) {
      setError("Employer name is required.");
      return;
    }
    if (form.parentMode === "create_new" && !form.new_parent_name.trim()) {
      setError("New parent company name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    let resolvedParentId: number | null = null;

    // Create new parent company if requested
    if (form.parentMode === "create_new" && form.new_parent_name.trim()) {
      const { data: newParent, error: parentError } = await supabase
        .from("employers")
        .insert({ employer_name: form.new_parent_name.trim(), is_active: true })
        .select("employer_id")
        .single();
      if (parentError) {
        setError(`Failed to create parent company: ${parentError.message}`);
        setSubmitting(false);
        return;
      }
      resolvedParentId = newParent.employer_id;
    } else if (form.parentMode === "existing" && form.parent_employer_id) {
      resolvedParentId = Number(form.parent_employer_id);
    }

    const payload: Database["public"]["Tables"]["employers"]["Insert"] = {
      employer_name: form.employer_name.trim(),
    };
    if (form.trading_name) payload.trading_name = form.trading_name.trim();
    if (form.abn) payload.abn = form.abn.trim();
    if (form.employer_category) payload.employer_category = form.employer_category;
    if (form.parent_company) payload.parent_company = form.parent_company.trim();
    if (resolvedParentId) payload.parent_employer_id = resolvedParentId;
    if (form.website) payload.website = form.website.trim();
    if (form.phone) payload.phone = form.phone.trim();
    if (form.email) payload.email = form.email.trim();
    if (form.address) payload.address = form.address.trim();
    if (form.state) payload.state = form.state;
    if (form.postcode) payload.postcode = form.postcode.trim();

    const { error: insertError } = await supabase
      .from("employers")
      .insert(payload);

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: ["employers"] });
    setDialogOpen(false);
    resetDialog();
  };

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">Failed to load employers. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Employers</h1>
          <p className="text-muted-foreground">
            Manage employers, contractors, and labour hire companies.
          </p>
        </div>
        <div className="flex items-center gap-2">
        {isAdmin && (
          <Button
            type="button"
            variant="outline"
            disabled={mergeSelectedIds.size < 2}
            onClick={openMergeDialog}
          >
            <GitMerge className="h-4 w-4" />
            Merge employers
            {mergeSelectedIds.size > 0 && (
              <Badge variant="secondary" className="ml-1">
                {mergeSelectedIds.size}
              </Badge>
            )}
          </Button>
        )}
        {canWrite && (
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) resetDialog();
            }}
          >
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Employer
            </Button>
            <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Employer</DialogTitle>
                <DialogDescription>
                  Create a new employer record.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="employer_name">
                      Employer Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="employer_name"
                      value={form.employer_name}
                      onChange={(e) =>
                        handleFieldChange("employer_name", e.target.value)
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trading_name">Trading Name</Label>
                    <Input
                      id="trading_name"
                      value={form.trading_name}
                      onChange={(e) =>
                        handleFieldChange("trading_name", e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="abn">ABN</Label>
                    <Input
                      id="abn"
                      value={form.abn}
                      onChange={(e) => handleFieldChange("abn", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="employer_category">Category</Label>
                    <Select
                      value={form.employer_category}
                      onValueChange={(v) =>
                        handleFieldChange("employer_category", v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {EMPLOYER_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Parent Company selector */}
                  <div className="col-span-1 sm:col-span-2 space-y-2">
                    <Label>Parent Company</Label>
                    <Select
                      value={form.parentMode}
                      onValueChange={(v) =>
                        handleFieldChange("parentMode", v)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Standalone — no parent company</SelectItem>
                        <SelectItem value="existing">Select existing employer as parent</SelectItem>
                        <SelectItem value="create_new">Create a new parent company</SelectItem>
                      </SelectContent>
                    </Select>
                    {form.parentMode === "existing" && (
                      <Select
                        value={form.parent_employer_id}
                        onValueChange={(v) =>
                          handleFieldChange("parent_employer_id", v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select parent employer" />
                        </SelectTrigger>
                        <SelectContent>
                          {employers
                            .filter((e) => e.employer_name !== form.employer_name)
                            .map((emp) => (
                              <SelectItem
                                key={emp.employer_id}
                                value={String(emp.employer_id)}
                              >
                                {emp.employer_name}
                                {emp.employer_category === "Principal_Employer" && " ★"}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                    {form.parentMode === "create_new" && (
                      <Input
                        placeholder="New parent company name"
                        value={form.new_parent_name}
                        onChange={(e) =>
                          handleFieldChange("new_parent_name", e.target.value)
                        }
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      value={form.website}
                      onChange={(e) =>
                        handleFieldChange("website", e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(e) =>
                        handleFieldChange("phone", e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        handleFieldChange("email", e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Select
                      value={form.state}
                      onValueChange={(v) => handleFieldChange("state", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {AU_STATES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 sm:col-span-2 space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      value={form.address}
                      onChange={(e) =>
                        handleFieldChange("address", e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postcode">Postcode</Label>
                    <Input
                      id="postcode"
                      value={form.postcode}
                      onChange={(e) =>
                        handleFieldChange("postcode", e.target.value)
                      }
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Saving..." : "Save Employer"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      {isAdmin && (
        <Dialog
          open={mergeDialogOpen}
          onOpenChange={(open) => {
            setMergeDialogOpen(open);
            if (!open) {
              setMergeError(null);
              setMergeSubmitting(false);
            }
          }}
        >
          <DialogContent className="max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Merge employers</DialogTitle>
              <DialogDescription>
                One record stays as the canonical employer. All worksites, workers,
                enterprise agreements, and scopes from the other selected records
                move to it. Subsidiary relationships should stay as separate rows
                linked via parent company; do not merge a parent with its child
                unless you intend to collapse them.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleMergeSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Canonical employer (surviving database row)</Label>
                <div className="space-y-2 rounded-md border p-3">
                  {mergeSelectionEmployers
                    .slice()
                    .sort((a, b) => a.employer_id - b.employer_id)
                    .map((emp) => (
                      <label
                        key={emp.employer_id}
                        className="flex cursor-pointer items-start gap-2 text-sm"
                      >
                        <input
                          type="radio"
                          name="merge-survivor"
                          className="mt-1"
                          checked={mergeSurvivorId === emp.employer_id}
                          onChange={() => {
                            setMergeSurvivorId(emp.employer_id);
                            setMergeCanonicalName(emp.employer_name);
                            setMergeAliasesText(
                              buildAliasLines(
                                mergeSelectionEmployers,
                                emp.employer_id,
                                emp.employer_name
                              )
                            );
                          }}
                        />
                        <span>
                          <span className="font-medium">{emp.employer_name}</span>
                          {emp.trading_name ? (
                            <span className="text-muted-foreground">
                              {" "}
                              ({emp.trading_name})
                            </span>
                          ) : null}
                          <span className="text-muted-foreground">
                            {" "}
                            · id {emp.employer_id}
                          </span>
                        </span>
                      </label>
                    ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="merge-canonical-name">Canonical name</Label>
                <Input
                  id="merge-canonical-name"
                  value={mergeCanonicalName}
                  onChange={(e) => setMergeCanonicalName(e.target.value)}
                  placeholder="Legal or preferred display name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="merge-aliases">Alias names</Label>
                <Textarea
                  id="merge-aliases"
                  rows={6}
                  value={mergeAliasesText}
                  onChange={(e) => setMergeAliasesText(e.target.value)}
                  placeholder="One alternate name per line (e.g. names from EBAs or trading names)"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Aliases are stored for matching and display. The canonical name
                  above is not repeated as an alias.
                </p>
              </div>
              {mergeError && (
                <p className="text-sm text-destructive">{mergeError}</p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMergeDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={mergeSubmitting}>
                  {mergeSubmitting ? "Merging…" : "Merge permanently"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Category filter tabs + work scope */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: "all", label: `All (${employers.length})` },
              {
                key: "Principal_Employer",
                label: `Principal Employers (${principalEmployers.length})`,
              },
              {
                key: "other",
                label: `Other (${employers.length - principalEmployers.length})`,
              },
            ] as { key: CategoryFilter; label: string }[]
          ).map(({ key, label }) => (
            <Button
              key={key}
              variant={categoryFilter === key ? "default" : "outline"}
              size="sm"
              onClick={() => setCategoryFilter(key)}
            >
              {key === "Principal_Employer" && (
                <Star className="h-3 w-3 mr-1 fill-current" />
              )}
              {label}
            </Button>
          ))}
        </div>
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-48 h-9">
            <SelectValue placeholder="All scopes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scopes</SelectItem>
            {allScopes
              .filter((s) => !s.is_whole_of_project)
              .map((s) => (
                <SelectItem key={s.scope_id} value={String(s.scope_id)}>
                  {s.scope_name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        data={filteredEmployers as (Employer & Record<string, unknown>)[]}
        columns={columns as Column<Employer & Record<string, unknown>>[]}
        searchPlaceholder="Search employers..."
        searchKeys={["employer_name", "trading_name", "abn"]}
        onRowClick={(item) =>
          router.push(`/employers/${item.employer_id}`)
        }
        loading={isLoading}
        selection={tableSelection}
      />
    </div>
  );
}
