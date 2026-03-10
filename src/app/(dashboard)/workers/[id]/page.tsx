"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Pencil } from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { format } from "date-fns";

interface WorkerDetail {
  worker_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  date_of_birth: string | null;
  gender: string | null;
  occupation: string | null;
  classification: string | null;
  member_number: string | null;
  join_date: string | null;
  resignation_date: string | null;
  engagement_score: number;
  engagement_level: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  employer: { employer_name: string } | null;
  worksite: { worksite_name: string } | null;
  member_role_type: { display_name: string } | null;
  union: { union_code: string; union_name: string } | null;
}

interface WorkerAgreement {
  agreement_id: number;
  agreement: {
    agreement_id: number;
    decision_no: string;
    agreement_name: string;
    status: string;
    expiry_date: string | null;
  };
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 py-2 border-b last:border-0">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm">{value || "—"}</dd>
    </div>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return format(new Date(dateStr), "dd MMM yyyy");
}

export default function WorkerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, canWrite } = useAuth();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);

  const { data: worker, isLoading } = useQuery({
    queryKey: ["worker", params.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workers")
        .select(
          `*, 
           employer:employers(employer_name),
           worksite:worksites(worksite_name),
           member_role_type:member_role_types(display_name),
           union:unions(union_code, union_name)`
        )
        .eq("worker_id", params.id)
        .single();

      if (error) throw error;
      return data as unknown as WorkerDetail;
    },
    enabled: !!user && !!params.id,
  });

  const { data: workerAgreements = [], isLoading: loadingAgreements } = useQuery({
    queryKey: ["worker-agreements", params.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_agreements")
        .select(
          `agreement_id,
           agreement:agreements(agreement_id, decision_no, agreement_name, status, expiry_date)`
        )
        .eq("worker_id", params.id);

      if (error) throw error;
      return (data ?? []) as unknown as WorkerAgreement[];
    },
    enabled: !!user && !!params.id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <EurekaLoadingSpinner size="lg" />
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Worker not found.</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  const engagementPct = Math.min(Math.max(worker.engagement_score, 0), 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {worker.first_name} {worker.last_name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Worker ID: {worker.worker_id}
            </p>
          </div>
          <Badge variant={worker.is_active ? "success" : "secondary"}>
            {worker.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
        {canWrite && (
          <Button
            variant={editing ? "default" : "outline"}
            onClick={() => setEditing(!editing)}
          >
            <Pencil className="h-4 w-4" />
            {editing ? "Done Editing" : "Edit"}
          </Button>
        )}
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="agreements">Agreements</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="communications">Communications</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <FieldRow label="Full Name" value={`${worker.first_name} ${worker.last_name}`} />
                <FieldRow label="Email" value={worker.email} />
                <FieldRow label="Phone" value={worker.phone} />
                <FieldRow label="Date of Birth" value={formatDate(worker.date_of_birth)} />
                <FieldRow label="Gender" value={worker.gender} />
                <FieldRow
                  label="Address"
                  value={
                    [worker.address, worker.suburb, worker.state, worker.postcode]
                      .filter(Boolean)
                      .join(", ") || null
                  }
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Employment</CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <FieldRow label="Employer" value={worker.employer?.employer_name} />
                <FieldRow label="Worksite" value={worker.worksite?.worksite_name} />
                <FieldRow label="Occupation" value={worker.occupation} />
                <FieldRow label="Classification" value={worker.classification} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Membership</CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <FieldRow label="Role" value={worker.member_role_type?.display_name} />
                <FieldRow
                  label="Union"
                  value={
                    worker.union
                      ? `${worker.union.union_code} — ${worker.union.union_name}`
                      : null
                  }
                />
                <FieldRow label="Member Number" value={worker.member_number} />
                <FieldRow label="Join Date" value={formatDate(worker.join_date)} />
                <FieldRow label="Resignation Date" value={formatDate(worker.resignation_date)} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Engagement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Engagement Score</span>
                <span className="text-sm font-bold">{worker.engagement_score}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${engagementPct}%` }}
                />
              </div>
              <FieldRow label="Engagement Level" value={worker.engagement_level} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agreements" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Worker Agreements</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingAgreements ? (
                <div className="flex justify-center py-4">
                  <EurekaLoadingSpinner size="sm" />
                </div>
              ) : workerAgreements.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No agreements linked to this worker.
                </p>
              ) : (
                <div className="space-y-3">
                  {workerAgreements.map((wa) => (
                    <div
                      key={wa.agreement_id}
                      className="flex items-center justify-between gap-2 rounded-md border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {wa.agreement.decision_no}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {wa.agreement.agreement_name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {wa.agreement.expiry_date && (
                          <span className="text-xs text-muted-foreground">
                            Expires {formatDate(wa.agreement.expiry_date)}
                          </span>
                        )}
                        <Badge
                          variant={
                            wa.agreement.status === "Current"
                              ? "success"
                              : wa.agreement.status === "Expired"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {wa.agreement.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Campaign Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Campaign activity will appear here.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="communications" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Communications Log</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Communication log will appear here.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
