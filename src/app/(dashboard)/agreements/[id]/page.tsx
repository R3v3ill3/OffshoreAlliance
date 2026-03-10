"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AgreementStatus, DuesIncreaseType } from "@/types/database";

interface AgreementDetail {
  agreement_id: number;
  decision_no: string;
  agreement_name: string;
  short_name: string | null;
  sector_id: number | null;
  employer_id: number | null;
  industry_classification: string | null;
  date_of_decision: string | null;
  commencement_date: string | null;
  expiry_date: string | null;
  status: AgreementStatus;
  is_greenfield: boolean;
  is_variation: boolean;
  fwc_link: string | null;
  supersedes_id: number | null;
  variation_of_id: number | null;
  notes: string | null;
  sector: { sector_name: string } | null;
  employer: { employer_name: string } | null;
  agreement_unions: { union: { union_id: number; union_code: string; union_name: string } | null }[];
  dues_increases: DuesIncreaseRow[];
}

interface DuesIncreaseRow {
  increase_id: number;
  increase_number: number;
  effective_date: string | null;
  increase_type: DuesIncreaseType | null;
  percentage: number | null;
  minimum_pct: number | null;
  maximum_pct: number | null;
  raw_description: string | null;
}

interface WorksiteLink {
  worksite: {
    worksite_id: number;
    worksite_name: string;
    worksite_type: string;
    is_offshore: boolean;
  } | null;
}

interface WorkerLink {
  worker: {
    worker_id: number;
    first_name: string;
    last_name: string;
    email: string | null;
    occupation: string | null;
  } | null;
}

interface SuccessorAgreement {
  agreement_id: number;
  decision_no: string;
  agreement_name: string;
  short_name: string | null;
  status: AgreementStatus;
}

const STATUS_VARIANT: Record<AgreementStatus, "success" | "destructive" | "info" | "secondary"> = {
  Current: "success",
  Expired: "destructive",
  Under_Negotiation: "info",
  Terminated: "secondary",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd MMM yyyy");
  } catch {
    return d;
  }
}

function pct(v: number | null) {
  if (v == null) return "—";
  return `${v}%`;
}

export default function AgreementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, canWrite } = useAuth();
  const supabase = createClient();
  const id = params.id as string;

  const { data: agreement, isLoading } = useQuery({
    queryKey: ["agreement", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select(
          `*, sector:sectors(sector_name),
           employer:employers(employer_name),
           agreement_unions(union:unions(union_id, union_code, union_name)),
           dues_increases(*)`
        )
        .eq("agreement_id", id)
        .single();

      if (error) throw error;
      return data as unknown as AgreementDetail;
    },
    enabled: !!user,
  });

  const { data: worksites = [] } = useQuery({
    queryKey: ["agreement-worksites", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreement_worksites")
        .select("worksite:worksites(worksite_id, worksite_name, worksite_type, is_offshore)")
        .eq("agreement_id", id);
      if (error) throw error;
      return (data ?? []) as unknown as WorksiteLink[];
    },
    enabled: !!user,
  });

  const { data: workers = [] } = useQuery({
    queryKey: ["agreement-workers", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_agreements")
        .select("worker:workers(worker_id, first_name, last_name, email, occupation)")
        .eq("agreement_id", id);
      if (error) throw error;
      return (data ?? []) as unknown as WorkerLink[];
    },
    enabled: !!user,
  });

  const { data: predecessorAgreement } = useQuery({
    queryKey: ["agreement-predecessor", agreement?.supersedes_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select("agreement_id, decision_no, agreement_name, short_name, status")
        .eq("agreement_id", agreement!.supersedes_id!)
        .single();
      if (error) throw error;
      return data as unknown as SuccessorAgreement;
    },
    enabled: !!user && !!agreement?.supersedes_id,
  });

  const { data: successors = [] } = useQuery({
    queryKey: ["agreement-successors", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select("agreement_id, decision_no, agreement_name, short_name, status")
        .eq("supersedes_id", id);
      if (error) throw error;
      return (data ?? []) as unknown as SuccessorAgreement[];
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading agreement…</p>
      </div>
    );
  }

  if (!agreement) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Agreement not found.</p>
      </div>
    );
  }

  const sortedDues = [...(agreement.dues_increases ?? [])].sort(
    (a, b) => a.increase_number - b.increase_number
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/agreements")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">
              {agreement.short_name || agreement.agreement_name}
            </h1>
            <Badge variant={STATUS_VARIANT[agreement.status]}>
              {agreement.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Decision No: {agreement.decision_no}
            {agreement.short_name && (
              <span className="ml-4">{agreement.agreement_name}</span>
            )}
          </p>
        </div>
        {canWrite && (
          <Button variant="outline">
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Agreement Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4 text-sm">
            <div>
              <span className="text-muted-foreground">Sector</span>
              <p className="font-medium">{agreement.sector?.sector_name ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Employer</span>
              <p className="font-medium">{agreement.employer?.employer_name ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Industry Classification</span>
              <p className="font-medium">{agreement.industry_classification ?? "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Date of Decision</span>
              <p className="font-medium">{formatDate(agreement.date_of_decision)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Commencement</span>
              <p className="font-medium">{formatDate(agreement.commencement_date)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Expiry</span>
              <p className="font-medium">{formatDate(agreement.expiry_date)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">FWC Link</span>
              {agreement.fwc_link ? (
                <a
                  href={agreement.fwc_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline flex items-center gap-1"
                >
                  View on FWC <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <p className="font-medium">—</p>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">Greenfield</span>
              <p className="font-medium">{agreement.is_greenfield ? "Yes" : "No"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Variation</span>
              <p className="font-medium">{agreement.is_variation ? "Yes" : "No"}</p>
            </div>
            <div className="col-span-full">
              <span className="text-muted-foreground">Union Coverage</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {agreement.agreement_unions?.length ? (
                  agreement.agreement_unions.map((au) =>
                    au.union ? (
                      <Badge key={au.union.union_id} variant="outline">
                        {au.union.union_code} — {au.union.union_name}
                      </Badge>
                    ) : null
                  )
                ) : (
                  <p className="font-medium">—</p>
                )}
              </div>
            </div>
            {agreement.notes && (
              <div className="col-span-full">
                <span className="text-muted-foreground">Notes</span>
                <p className="font-medium whitespace-pre-wrap">{agreement.notes}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {sortedDues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dues Increase Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Effective Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Percentage</TableHead>
                    <TableHead>Min</TableHead>
                    <TableHead>Max</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedDues.map((d) => (
                    <TableRow key={d.increase_id}>
                      <TableCell>{d.increase_number}</TableCell>
                      <TableCell>{formatDate(d.effective_date)}</TableCell>
                      <TableCell>
                        {d.increase_type ? (
                          <Badge variant="outline">{d.increase_type}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{pct(d.percentage)}</TableCell>
                      <TableCell>{pct(d.minimum_pct)}</TableCell>
                      <TableCell>{pct(d.maximum_pct)}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {d.raw_description ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="worksites">
        <TabsList>
          <TabsTrigger value="worksites">Worksites</TabsTrigger>
          <TabsTrigger value="workers">Workers</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="worksites">
          <Card>
            <CardContent className="pt-6">
              {worksites.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No worksites linked to this agreement.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Worksite</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Location</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {worksites.map((ws) =>
                        ws.worksite ? (
                          <TableRow
                            key={ws.worksite.worksite_id}
                            className="cursor-pointer"
                            onClick={() =>
                              router.push(`/worksites/${ws.worksite!.worksite_id}`)
                            }
                          >
                            <TableCell className="font-medium">
                              {ws.worksite.worksite_name}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {ws.worksite.worksite_type.replace(/_/g, " ")}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {ws.worksite.is_offshore ? "Offshore" : "Onshore"}
                            </TableCell>
                          </TableRow>
                        ) : null
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workers">
          <Card>
            <CardContent className="pt-6">
              {workers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No workers linked to this agreement.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Occupation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workers.map((wl) =>
                        wl.worker ? (
                          <TableRow
                            key={wl.worker.worker_id}
                            className="cursor-pointer"
                            onClick={() =>
                              router.push(`/workers/${wl.worker!.worker_id}`)
                            }
                          >
                            <TableCell className="font-medium">
                              {wl.worker.first_name} {wl.worker.last_name}
                            </TableCell>
                            <TableCell>{wl.worker.email ?? "—"}</TableCell>
                            <TableCell>{wl.worker.occupation ?? "—"}</TableCell>
                          </TableRow>
                        ) : null
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center py-8">
                Upload and manage documents here.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {predecessorAgreement && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Supersedes
                  </h3>
                  <button
                    onClick={() =>
                      router.push(`/agreements/${predecessorAgreement.agreement_id}`)
                    }
                    className="flex items-center gap-3 p-3 rounded-md border hover:bg-muted/50 transition-colors w-full text-left"
                  >
                    <div className="flex-1">
                      <p className="font-medium">
                        {predecessorAgreement.short_name ||
                          predecessorAgreement.agreement_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {predecessorAgreement.decision_no}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[predecessorAgreement.status]}>
                      {predecessorAgreement.status.replace(/_/g, " ")}
                    </Badge>
                  </button>
                </div>
              )}

              {successors.length > 0 && (
                <div>
                  {predecessorAgreement && <Separator className="my-4" />}
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Superseded By
                  </h3>
                  <div className="space-y-2">
                    {successors.map((s) => (
                      <button
                        key={s.agreement_id}
                        onClick={() =>
                          router.push(`/agreements/${s.agreement_id}`)
                        }
                        className="flex items-center gap-3 p-3 rounded-md border hover:bg-muted/50 transition-colors w-full text-left"
                      >
                        <div className="flex-1">
                          <p className="font-medium">
                            {s.short_name || s.agreement_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {s.decision_no}
                          </p>
                        </div>
                        <Badge variant={STATUS_VARIANT[s.status]}>
                          {s.status.replace(/_/g, " ")}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!predecessorAgreement && successors.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No agreement history available.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
