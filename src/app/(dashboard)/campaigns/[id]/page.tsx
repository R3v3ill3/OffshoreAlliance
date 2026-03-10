"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Pencil, Plus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  CampaignType,
  CampaignStatus,
  ActionType,
  ActionResultType,
  UniverseRuleType,
} from "@/types/database";

interface CampaignDetail {
  campaign_id: number;
  name: string;
  description: string | null;
  campaign_type: CampaignType;
  status: CampaignStatus;
  start_date: string | null;
  end_date: string | null;
  organiser_id: number | null;
  notes: string | null;
  organiser: { organiser_name: string } | null;
}

interface UniverseRow {
  universe_id: number;
  campaign_id: number;
  name: string;
  description: string | null;
}

interface UniverseRuleRow {
  rule_id: number;
  universe_id: number;
  rule_type: UniverseRuleType;
  rule_entity_id: number;
  include: boolean;
  entity_name?: string;
}

interface ActionRow {
  action_id: number;
  campaign_id: number;
  action_type: ActionType;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  universe_id: number | null;
}

interface ResultRow {
  result_id: number;
  result_type: ActionResultType;
  notes: string | null;
  action_date: string;
  worker: { worker_id: number; first_name: string; last_name: string } | null;
  action: { action_id: number; title: string } | null;
}

const STATUS_VARIANT: Record<CampaignStatus, "secondary" | "success" | "info" | "warning"> = {
  planning: "secondary",
  active: "success",
  completed: "info",
  suspended: "warning",
};

const TYPE_VARIANT: Record<CampaignType, "default" | "info" | "warning" | "secondary"> = {
  bargaining: "info",
  organising: "default",
  mobilisation: "warning",
  political: "secondary",
};

const ACTION_STATUS_VARIANT: Record<string, "secondary" | "success" | "info" | "warning" | "default"> = {
  pending: "secondary",
  in_progress: "info",
  completed: "success",
  cancelled: "warning",
};

const RESULT_TYPE_VARIANT: Record<ActionResultType, "success" | "secondary" | "destructive" | "info" | "warning" | "default"> = {
  contacted: "success",
  not_home: "secondary",
  refused: "destructive",
  signed: "success",
  attended: "info",
  left_message: "warning",
  wrong_number: "secondary",
  moved: "secondary",
  other: "default",
};

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd MMM yyyy");
  } catch {
    return d;
  }
}

const INITIAL_UNIVERSE_FORM = { name: "", description: "" };

const INITIAL_ACTION_FORM = {
  title: "",
  action_type: "meeting" as ActionType,
  description: "",
  due_date: "",
  status: "pending",
  universe_id: "",
};

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, canWrite } = useAuth();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const id = params.id as string;

  const [universeDialogOpen, setUniverseDialogOpen] = useState(false);
  const [universeForm, setUniverseForm] = useState(INITIAL_UNIVERSE_FORM);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionForm, setActionForm] = useState(INITIAL_ACTION_FORM);

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select(`*, organiser:organisers(organiser_name)`)
        .eq("campaign_id", id)
        .single();
      if (error) throw error;
      return data as unknown as CampaignDetail;
    },
    enabled: !!user,
  });

  const { data: universes = [] } = useQuery({
    queryKey: ["campaign-universes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_universes")
        .select("*")
        .eq("campaign_id", id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as UniverseRow[];
    },
    enabled: !!user,
  });

  const { data: universeRules = [] } = useQuery({
    queryKey: ["campaign-universe-rules", id],
    queryFn: async () => {
      if (universes.length === 0) return [];
      const uIds = universes.map((u) => u.universe_id);
      const { data, error } = await supabase
        .from("campaign_universe_rules")
        .select("*")
        .in("universe_id", uIds);
      if (error) throw error;
      return (data ?? []) as UniverseRuleRow[];
    },
    enabled: !!user && universes.length > 0,
  });

  const { data: actions = [] } = useQuery({
    queryKey: ["campaign-actions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_actions")
        .select("*")
        .eq("campaign_id", id)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ActionRow[];
    },
    enabled: !!user,
  });

  const { data: results = [] } = useQuery({
    queryKey: ["campaign-results", id],
    queryFn: async () => {
      const actionIds = actions.map((a) => a.action_id);
      if (actionIds.length === 0) return [];
      const { data, error } = await supabase
        .from("campaign_action_results")
        .select(
          `result_id, result_type, notes, action_date,
           worker:workers(worker_id, first_name, last_name),
           action:campaign_actions(action_id, title)`
        )
        .in("action_id", actionIds)
        .order("action_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ResultRow[];
    },
    enabled: !!user && actions.length > 0,
  });

  const createUniverseMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        campaign_id: Number(id),
        name: universeForm.name,
      };
      if (universeForm.description) payload.description = universeForm.description;
      const { error } = await supabase.from("campaign_universes").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-universes", id] });
      setUniverseDialogOpen(false);
      setUniverseForm(INITIAL_UNIVERSE_FORM);
    },
  });

  const createActionMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        campaign_id: Number(id),
        title: actionForm.title,
        action_type: actionForm.action_type,
        status: actionForm.status,
      };
      if (actionForm.description) payload.description = actionForm.description;
      if (actionForm.due_date) payload.due_date = actionForm.due_date;
      if (actionForm.universe_id) payload.universe_id = Number(actionForm.universe_id);
      const { error } = await supabase.from("campaign_actions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign-actions", id] });
      setActionDialogOpen(false);
      setActionForm(INITIAL_ACTION_FORM);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading campaign…</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Campaign not found.</p>
      </div>
    );
  }

  const rulesByUniverse = universeRules.reduce<Record<number, UniverseRuleRow[]>>((acc, rule) => {
    (acc[rule.universe_id] ??= []).push(rule);
    return acc;
  }, {});

  const RULE_TYPE_LABELS: Record<UniverseRuleType, string> = {
    agreement: "Agreement",
    worksite: "Worksite",
    employer: "Employer",
    member_role: "Role",
    sector: "Sector",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/campaigns")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{campaign.name}</h1>
            <Badge variant={TYPE_VARIANT[campaign.campaign_type]}>
              {campaign.campaign_type}
            </Badge>
            <Badge variant={STATUS_VARIANT[campaign.status]}>
              {campaign.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDate(campaign.start_date)} — {formatDate(campaign.end_date)}
          </p>
        </div>
        {canWrite && (
          <Button variant="outline">
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="universe">Universe</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Type</span>
                  <p className="font-medium capitalize">{campaign.campaign_type}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p className="font-medium capitalize">{campaign.status}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Organiser</span>
                  <p className="font-medium">
                    {campaign.organiser?.organiser_name ?? "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Start Date</span>
                  <p className="font-medium">{formatDate(campaign.start_date)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">End Date</span>
                  <p className="font-medium">{formatDate(campaign.end_date)}</p>
                </div>
                {campaign.description && (
                  <div className="col-span-full">
                    <span className="text-muted-foreground">Description</span>
                    <p className="font-medium whitespace-pre-wrap">
                      {campaign.description}
                    </p>
                  </div>
                )}
                {campaign.notes && (
                  <div className="col-span-full">
                    <span className="text-muted-foreground">Notes</span>
                    <p className="font-medium whitespace-pre-wrap">{campaign.notes}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="universe">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Campaign Universes</CardTitle>
              {canWrite && (
                <Dialog open={universeDialogOpen} onOpenChange={setUniverseDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4" />
                      Define Universe
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Define Universe</DialogTitle>
                      <DialogDescription>
                        Create a target universe for this campaign.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="universe_name">Name *</Label>
                        <Input
                          id="universe_name"
                          value={universeForm.name}
                          onChange={(e) =>
                            setUniverseForm({ ...universeForm, name: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="universe_desc">Description</Label>
                        <Textarea
                          id="universe_desc"
                          value={universeForm.description}
                          onChange={(e) =>
                            setUniverseForm({ ...universeForm, description: e.target.value })
                          }
                          rows={3}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setUniverseDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => createUniverseMutation.mutate()}
                        disabled={!universeForm.name || createUniverseMutation.isPending}
                      >
                        {createUniverseMutation.isPending ? "Creating…" : "Create Universe"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {universes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No universes defined for this campaign.
                </p>
              ) : (
                <div className="space-y-4">
                  {universes.map((u) => {
                    const rules = rulesByUniverse[u.universe_id] ?? [];
                    return (
                      <div key={u.universe_id} className="rounded-md border p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium">{u.name}</h4>
                            {u.description && (
                              <p className="text-sm text-muted-foreground mt-0.5">
                                {u.description}
                              </p>
                            )}
                          </div>
                          <Button variant="outline" size="sm">
                            <Users className="h-3.5 w-3.5" />
                            Preview Universe
                          </Button>
                        </div>
                        {rules.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {rules.map((r) => (
                              <Badge
                                key={r.rule_id}
                                variant={r.include ? "info" : "destructive"}
                              >
                                {r.include ? "Include" : "Exclude"}{" "}
                                {RULE_TYPE_LABELS[r.rule_type]}: #{r.rule_entity_id}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Campaign Actions</CardTitle>
              {canWrite && (
                <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4" />
                      Add Action
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Action</DialogTitle>
                      <DialogDescription>
                        Create a new action for this campaign.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="action_title">Title *</Label>
                        <Input
                          id="action_title"
                          value={actionForm.title}
                          onChange={(e) =>
                            setActionForm({ ...actionForm, title: e.target.value })
                          }
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Action Type *</Label>
                          <Select
                            value={actionForm.action_type}
                            onValueChange={(v) =>
                              setActionForm({ ...actionForm, action_type: v as ActionType })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="door_knock">Door Knock</SelectItem>
                              <SelectItem value="phone_call">Phone Call</SelectItem>
                              <SelectItem value="text_blast">Text Blast</SelectItem>
                              <SelectItem value="meeting">Meeting</SelectItem>
                              <SelectItem value="petition">Petition</SelectItem>
                              <SelectItem value="rally">Rally</SelectItem>
                              <SelectItem value="worksite_visit">Worksite Visit</SelectItem>
                              <SelectItem value="sign_up">Sign Up</SelectItem>
                              <SelectItem value="survey">Survey</SelectItem>
                              <SelectItem value="custom">Custom</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Select
                            value={actionForm.status}
                            onValueChange={(v) =>
                              setActionForm({ ...actionForm, status: v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="action_desc">Description</Label>
                        <Textarea
                          id="action_desc"
                          value={actionForm.description}
                          onChange={(e) =>
                            setActionForm({ ...actionForm, description: e.target.value })
                          }
                          rows={3}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="action_due">Due Date</Label>
                          <Input
                            id="action_due"
                            type="date"
                            value={actionForm.due_date}
                            onChange={(e) =>
                              setActionForm({ ...actionForm, due_date: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Universe</Label>
                          <Select
                            value={actionForm.universe_id}
                            onValueChange={(v) =>
                              setActionForm({ ...actionForm, universe_id: v })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select universe" />
                            </SelectTrigger>
                            <SelectContent>
                              {universes.map((u) => (
                                <SelectItem
                                  key={u.universe_id}
                                  value={String(u.universe_id)}
                                >
                                  {u.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setActionDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => createActionMutation.mutate()}
                        disabled={!actionForm.title || createActionMutation.isPending}
                      >
                        {createActionMutation.isPending ? "Creating…" : "Add Action"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {actions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No actions created for this campaign.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {actions.map((a) => (
                        <TableRow key={a.action_id}>
                          <TableCell className="font-medium">{a.title}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {a.action_type.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(a.due_date)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={ACTION_STATUS_VARIANT[a.status] ?? "default"}
                            >
                              {a.status.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Campaign Results</CardTitle>
            </CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No results recorded yet.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Worker</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((r) => (
                        <TableRow key={r.result_id}>
                          <TableCell className="font-medium">
                            {r.worker
                              ? `${r.worker.first_name} ${r.worker.last_name}`
                              : "—"}
                          </TableCell>
                          <TableCell>{r.action?.title ?? "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={RESULT_TYPE_VARIANT[r.result_type] ?? "default"}
                            >
                              {r.result_type.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(r.action_date)}</TableCell>
                          <TableCell className="max-w-xs truncate">
                            {r.notes ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
