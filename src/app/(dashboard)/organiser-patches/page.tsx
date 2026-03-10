"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Organiser, OrganiserPatch } from "@/types/database";
import {
  Plus,
  MapPin,
  User,
  Building2,
  FileText,
  Briefcase,
  Loader2,
  X,
} from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";

interface PatchWithOrganiser extends OrganiserPatch {
  organiser: { organiser_name: string } | null;
}

interface PatchAssignment {
  assignment_id: number;
  patch_id: number;
  entity_type: string;
  entity_id: number;
  entity_name?: string;
}

export default function OrganiserPatchesPage() {
  const { user, canWrite } = useAuth();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [selectedPatch, setSelectedPatch] = useState<PatchWithOrganiser | null>(
    null
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [patchName, setPatchName] = useState("");
  const [organiserId, setOrganiserId] = useState("");
  const [description, setDescription] = useState("");

  const [assignType, setAssignType] = useState<string>("worksite");
  const [assignEntityId, setAssignEntityId] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);

  const { data: organisers = [] } = useQuery({
    queryKey: ["organisers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organisers")
        .select("*")
        .eq("is_active", true)
        .order("organiser_name");
      if (error) throw error;
      return data as Organiser[];
    },
    enabled: !!user,
  });

  const { data: patches = [], isLoading } = useQuery({
    queryKey: ["organiser-patches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organiser_patches")
        .select(
          `patch_id, organiser_id, patch_name, description,
           organiser:organisers(organiser_name)`
        )
        .order("patch_name");
      if (error) throw error;
      return data as unknown as PatchWithOrganiser[];
    },
    enabled: !!user,
  });

  const { data: assignmentCounts = {} } = useQuery({
    queryKey: ["patch-assignment-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organiser_patch_assignments")
        .select("patch_id, entity_type");
      if (error) throw error;

      const counts: Record<number, { worksites: number; employers: number; agreements: number }> = {};
      for (const row of data ?? []) {
        if (!counts[row.patch_id]) {
          counts[row.patch_id] = { worksites: 0, employers: 0, agreements: 0 };
        }
        if (row.entity_type === "worksite") counts[row.patch_id].worksites++;
        else if (row.entity_type === "employer") counts[row.patch_id].employers++;
        else if (row.entity_type === "agreement") counts[row.patch_id].agreements++;
      }
      return counts;
    },
    enabled: !!user,
  });

  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ["patch-assignments", selectedPatch?.patch_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organiser_patch_assignments")
        .select("*")
        .eq("patch_id", selectedPatch!.patch_id);
      if (error) throw error;

      const enriched: PatchAssignment[] = [];
      for (const row of data ?? []) {
        let entityName = "";
        if (row.entity_type === "worksite") {
          const { data: ws } = await supabase
            .from("worksites")
            .select("worksite_name")
            .eq("worksite_id", row.entity_id)
            .single();
          entityName = ws?.worksite_name ?? `Worksite #${row.entity_id}`;
        } else if (row.entity_type === "employer") {
          const { data: emp } = await supabase
            .from("employers")
            .select("employer_name")
            .eq("employer_id", row.entity_id)
            .single();
          entityName = emp?.employer_name ?? `Employer #${row.entity_id}`;
        } else if (row.entity_type === "agreement") {
          const { data: agr } = await supabase
            .from("agreements")
            .select("agreement_name")
            .eq("agreement_id", row.entity_id)
            .single();
          entityName = agr?.agreement_name ?? `Agreement #${row.entity_id}`;
        }
        enriched.push({
          assignment_id: row.assignment_id,
          patch_id: row.patch_id,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          entity_name: entityName,
        });
      }
      return enriched;
    },
    enabled: !!selectedPatch,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("organiser_patches").insert({
        patch_name: patchName,
        organiser_id: parseInt(organiserId, 10),
        description: description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organiser-patches"] });
      setCreateOpen(false);
      setPatchName("");
      setOrganiserId("");
      setDescription("");
    },
  });

  // Fetch assignable entities based on type
  const { data: worksites = [] } = useQuery({
    queryKey: ["assignable-worksites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worksites")
        .select("worksite_id, worksite_name")
        .eq("is_active", true)
        .order("worksite_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: employers = [] } = useQuery({
    queryKey: ["assignable-employers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employers")
        .select("employer_id, employer_name")
        .eq("is_active", true)
        .order("employer_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: agreements = [] } = useQuery({
    queryKey: ["assignable-agreements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agreements")
        .select("agreement_id, agreement_name")
        .order("agreement_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("organiser_patch_assignments")
        .insert({
          patch_id: selectedPatch!.patch_id,
          entity_type: assignType,
          entity_id: parseInt(assignEntityId, 10),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["patch-assignments", selectedPatch?.patch_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["patch-assignment-counts"],
      });
      setAssignOpen(false);
      setAssignEntityId("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      const { error } = await supabase
        .from("organiser_patch_assignments")
        .delete()
        .eq("assignment_id", assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["patch-assignments", selectedPatch?.patch_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["patch-assignment-counts"],
      });
    },
  });

  function getEntityOptions() {
    if (assignType === "worksite") {
      return worksites.map((w) => ({
        id: w.worksite_id.toString(),
        name: w.worksite_name,
      }));
    }
    if (assignType === "employer") {
      return employers.map((e) => ({
        id: e.employer_id.toString(),
        name: e.employer_name,
      }));
    }
    return agreements.map((a) => ({
      id: a.agreement_id.toString(),
      name: a.agreement_name,
    }));
  }

  function renderAssignmentTable(entityType: string) {
    const filtered = assignments.filter((a) => a.entity_type === entityType);
    if (loadingAssignments) {
      return (
        <div className="flex items-center justify-center py-8">
          <EurekaLoadingSpinner size="md" />
        </div>
      );
    }
    if (filtered.length === 0) {
      return (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No {entityType}s assigned to this patch.
        </p>
      );
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-[80px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((a) => (
            <TableRow key={a.assignment_id}>
              <TableCell>{a.entity_name}</TableCell>
              <TableCell>
                {canWrite && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => removeMutation.mutate(a.assignment_id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Organiser Patches</h1>
        {canWrite && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Create Patch
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Patch</DialogTitle>
                <DialogDescription>
                  Define a new organiser patch and assign an organiser.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Patch Name</Label>
                  <Input
                    value={patchName}
                    onChange={(e) => setPatchName(e.target.value)}
                    placeholder="e.g. North West Shelf"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Organiser</Label>
                  <Select value={organiserId} onValueChange={setOrganiserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select organiser..." />
                    </SelectTrigger>
                    <SelectContent>
                      {organisers.map((o) => (
                        <SelectItem
                          key={o.organiser_id}
                          value={o.organiser_id.toString()}
                        >
                          {o.organiser_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional description..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={
                    !patchName || !organiserId || createMutation.isPending
                  }
                >
                  {createMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Create Patch
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <EurekaLoadingSpinner size="lg" />
        </div>
      ) : patches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-1">No patches yet</p>
            <p className="text-sm text-muted-foreground">
              Create your first organiser patch to start assigning worksites,
              employers, and agreements.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {patches.map((patch) => {
            const counts = assignmentCounts[patch.patch_id] ?? {
              worksites: 0,
              employers: 0,
              agreements: 0,
            };
            const isSelected = selectedPatch?.patch_id === patch.patch_id;
            return (
              <Card
                key={patch.patch_id}
                className={`cursor-pointer transition-shadow hover:shadow-lg ${
                  isSelected ? "ring-2 ring-primary" : ""
                }`}
                onClick={() =>
                  setSelectedPatch(isSelected ? null : patch)
                }
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPin className="h-4 w-4 text-primary" />
                    {patch.patch_name}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {patch.organiser?.organiser_name ?? "Unassigned"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {patch.description && (
                    <p className="text-sm text-muted-foreground mb-3">
                      {patch.description}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Badge variant="outline" className="gap-1">
                      <Building2 className="h-3 w-3" />
                      {counts.worksites} sites
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Briefcase className="h-3 w-3" />
                      {counts.employers} employers
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <FileText className="h-3 w-3" />
                      {counts.agreements} agreements
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedPatch && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>{selectedPatch.patch_name} — Assignments</CardTitle>
              <CardDescription>
                Manage worksites, employers, and agreements assigned to this
                patch.
              </CardDescription>
            </div>
            {canWrite && (
              <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4" />
                    Assign
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Assign to Patch</DialogTitle>
                    <DialogDescription>
                      Add a worksite, employer, or agreement to{" "}
                      {selectedPatch.patch_name}.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                      <Label>Type</Label>
                      <Select
                        value={assignType}
                        onValueChange={(v) => {
                          setAssignType(v);
                          setAssignEntityId("");
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="worksite">Worksite</SelectItem>
                          <SelectItem value="employer">Employer</SelectItem>
                          <SelectItem value="agreement">Agreement</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Entity</Label>
                      <Select
                        value={assignEntityId}
                        onValueChange={setAssignEntityId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          {getEntityOptions().map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              {opt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => assignMutation.mutate()}
                      disabled={!assignEntityId || assignMutation.isPending}
                    >
                      {assignMutation.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      Add Assignment
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="worksites">
              <TabsList>
                <TabsTrigger value="worksites">Worksites</TabsTrigger>
                <TabsTrigger value="employers">Employers</TabsTrigger>
                <TabsTrigger value="agreements">Agreements</TabsTrigger>
              </TabsList>
              <TabsContent value="worksites">
                {renderAssignmentTable("worksite")}
              </TabsContent>
              <TabsContent value="employers">
                {renderAssignmentTable("employer")}
              </TabsContent>
              <TabsContent value="agreements">
                {renderAssignmentTable("agreement")}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
