"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import type { Employer, EmployerCategory } from "@/types/database";
import { DataTable, type Column } from "@/components/data-tables/data-table";
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
import { Plus, Star } from "lucide-react";

const EMPLOYER_CATEGORIES: EmployerCategory[] = [
  "Principal_Employer",
  "Producer",
  "Major_Contractor",
  "Subcontractor",
  "Labour_Hire",
  "Specialist",
];

const AU_STATES = ["WA", "NT", "QLD", "SA", "NSW", "VIC", "TAS", "ACT"];

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
  const { canWrite } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

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

  const filteredEmployers = useMemo(() => {
    if (categoryFilter === "Principal_Employer") {
      return employers.filter((e) => e.employer_category === "Principal_Employer");
    }
    if (categoryFilter === "other") {
      return employers.filter((e) => e.employer_category !== "Principal_Employer");
    }
    return employers;
  }, [employers, categoryFilter]);

  const principalEmployers = useMemo(
    () => employers.filter((e) => e.employer_category === "Principal_Employer"),
    [employers]
  );

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

    const payload: Record<string, unknown> = {
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
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Employer</DialogTitle>
                <DialogDescription>
                  Create a new employer record.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                  <div className="col-span-2 space-y-2">
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
                  <div className="col-span-2 space-y-2">
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

      {/* Category filter tabs */}
      <div className="flex gap-2">
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

      <DataTable
        data={filteredEmployers as (Employer & Record<string, unknown>)[]}
        columns={columns as Column<Employer & Record<string, unknown>>[]}
        searchPlaceholder="Search employers..."
        searchKeys={["employer_name", "trading_name", "abn"]}
        onRowClick={(item) =>
          router.push(`/employers/${item.employer_id}`)
        }
        loading={isLoading}
      />
    </div>
  );
}
