"use client";

import { format } from "date-fns";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { ActionType } from "@/types/database";

// ─── Row shapes (mirrored from page.tsx to avoid coupling to that module) ────

export interface ActionRow {
  action_id: number;
  campaign_id: number;
  action_type: ActionType;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  universe_id: number | null;
}

export interface UniverseRow {
  universe_id: number;
  campaign_id: number;
  name: string;
  description: string | null;
}

export interface ActionFormState {
  title: string;
  action_type: ActionType;
  description: string;
  due_date: string;
  status: string;
  universe_id: string;
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface CampaignActionsSectionProps {
  /** Numeric campaign id. */
  campaignId: number;
  /** Whether the current user has write access. */
  canWrite: boolean;
  /** Current rows from the campaign_actions query. */
  actions: ActionRow[];
  /** Named universes for the universe picker in the Add Action dialog. */
  universes: UniverseRow[];
  /** Controlled open state for the Add Action dialog. */
  actionDialogOpen: boolean;
  /** Setter for actionDialogOpen. */
  setActionDialogOpen: (open: boolean) => void;
  /** Controlled form state for the Add Action dialog. */
  actionForm: ActionFormState;
  /** Setter for actionForm. */
  setActionForm: (form: ActionFormState) => void;
  /** Call createActionMutation.mutate(). */
  onCreateAction: () => void;
  /** True while the mutation is in flight. */
  isCreatingAction: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "dd MMM yyyy");
  } catch {
    return d;
  }
}

const ACTION_STATUS_VARIANT: Record<
  string,
  "secondary" | "success" | "info" | "warning" | "default"
> = {
  pending: "secondary",
  in_progress: "info",
  completed: "success",
  cancelled: "warning",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function CampaignActionsSection({
  canWrite,
  actions,
  universes,
  actionDialogOpen,
  setActionDialogOpen,
  actionForm,
  setActionForm,
  onCreateAction,
  isCreatingAction,
}: CampaignActionsSectionProps) {
  return (
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
                  onClick={onCreateAction}
                  disabled={!actionForm.title || isCreatingAction}
                >
                  {isCreatingAction ? "Creating…" : "Add Action"}
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
  );
}
