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
import { Plus } from "lucide-react";

const EMPLOYER_CATEGORIES: EmployerCategory[] = [
  "Producer",
  "Major_Contractor",
  "Subcontractor",
  "Labour_Hire",
  "Specialist",
];

const AU_STATES = ["WA", "NT", "QLD", "SA", "NSW", "VIC", "TAS", "ACT"];

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
};

export default function EmployersPage() {
  const router = useRouter();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { canWrite } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: employers = [], isLoading, isError } = useQuery({
    queryKey: ["employers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employers")
        .select("*")
        .order("employer_name");
      if (error) throw error;
      return data as Employer[];
    },
  });

  const columns: Column<Employer>[] = useMemo(
    () => [
      { key: "employer_name", header: "Name" },
      { key: "trading_name", header: "Trading Name" },
      {
        key: "employer_category",
        header: "Category",
        render: (item) =>
          item.employer_category ? (
            <Badge variant="secondary">
              {item.employer_category.replace(/_/g, " ")}
            </Badge>
          ) : (
            "—"
          ),
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
    []
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

    setSubmitting(true);
    setError(null);

    const payload: Record<string, unknown> = {
      employer_name: form.employer_name.trim(),
    };
    if (form.trading_name) payload.trading_name = form.trading_name.trim();
    if (form.abn) payload.abn = form.abn.trim();
    if (form.employer_category) payload.employer_category = form.employer_category;
    if (form.parent_company) payload.parent_company = form.parent_company.trim();
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
                  <div className="space-y-2">
                    <Label htmlFor="parent_company">Parent Company</Label>
                    <Input
                      id="parent_company"
                      value={form.parent_company}
                      onChange={(e) =>
                        handleFieldChange("parent_company", e.target.value)
                      }
                    />
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

      <DataTable
        data={employers as (Employer & Record<string, unknown>)[]}
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
