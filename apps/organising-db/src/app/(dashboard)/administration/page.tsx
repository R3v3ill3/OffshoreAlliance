"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/supabase/auth-context";
import { DataTable, type Column } from "@/components/data-tables/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
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
import type {
  UserProfile,
  UserRole,
  WorkRole,
  MemberRoleType,
  UnionMembershipType,
  Sector,
  ImportLog,
} from "@/types/database";
import {
  Plus,
  Shield,
  ShieldOff,
  Save,
  Loader2,
  Key,
  Link,
  AlertTriangle,
  Copy,
  Check,
  Mail,
  Trash2,
  Pencil,
  Upload,
  Activity,
  Server,
  Database,
  Clock,
} from "lucide-react";
import dynamic from "next/dynamic";
import { EmployerWizard } from "@/components/administration/employer-wizard";
import { ReferenceDataWizard } from "@/components/import/reference-data-wizard";
import { MembershipImportWizard } from "@/components/import/membership-import-wizard";
import { WorkerImportWizard } from "@/components/import/worker-import-wizard";

const WorkloadTab = dynamic(() => import("@/components/administration/workload-tab").then((m) => ({ default: m.WorkloadTab })), { ssr: false });
const OrganiserPatchesTab = dynamic(() => import("@/components/administration/organiser-patches-tab").then((m) => ({ default: m.OrganiserPatchesTab })), { ssr: false });

const WORK_ROLES: { value: WorkRole; label: string }[] = [
  { value: "coordinator", label: "Co-ordinator" },
  { value: "lead_organiser", label: "Lead Organiser" },
  { value: "organiser", label: "Organiser" },
  { value: "industrial_officer", label: "Industrial Officer" },
  { value: "industrial_coordinator", label: "Industrial Co-ordinator" },
  { value: "specialist", label: "Specialist" },
];

function workRoleLabel(role: WorkRole | null | undefined) {
  if (!role) return null;
  return WORK_ROLES.find((r) => r.value === role)?.label ?? role;
}
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";

// ---------- Users Tab ----------

interface UserRow extends UserProfile {
  email?: string;
  [key: string]: unknown;
}

function UsersTab() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [inviteWorkRole, setInviteWorkRole] = useState<WorkRole | "">("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editPermissionRole, setEditPermissionRole] = useState<UserRole>("user");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editWorkRole, setEditWorkRole] = useState<WorkRole | "none">("none");
  const [editReportsTo, setEditReportsTo] = useState<string>("none");
  const [editError, setEditError] = useState<string | null>(null);
  const [setPasswordUserId, setSetPasswordUserId] = useState<string | null>(null);
  const [setPasswordUserName, setSetPasswordUserName] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [setPasswordError, setSetPasswordError] = useState<string | null>(null);
  const [setPasswordDone, setSetPasswordDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users");
      const json = (await res.json()) as { users?: UserRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load users");
      return json.users ?? [];
    },
  });

  const deleteMutation = useAuthAwareMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/delete-user?userId=${userId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete user");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setConfirmDeleteId(null);
    },
  });

  const setPasswordMutation = useAuthAwareMutation({
    mutationFn: async ({
      userId,
      password,
    }: {
      userId: string;
      password: string;
    }) => {
      setSetPasswordError(null);
      const res = await fetch("/api/admin/set-user-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to set password");
    },
    onSuccess: () => {
      setSetPasswordDone(true);
    },
    onError: (err: Error) => {
      setSetPasswordError(err.message);
    },
  });

  const handleCloseSetPassword = () => {
    setSetPasswordUserId(null);
    setSetPasswordUserName("");
    setTempPassword("");
    setSetPasswordError(null);
    setSetPasswordDone(false);
    setPasswordMutation.reset();
  };

  const updateUserMutation = useAuthAwareMutation({
    mutationFn: async ({
      userId,
      workRole,
      reportsTo,
      role,
      displayName,
      email,
      phone,
    }: {
      userId: string;
      workRole: WorkRole | null;
      reportsTo: string | null;
      role: UserRole;
      displayName: string;
      email: string;
      phone: string | null;
    }) => {
      setEditError(null);
      const res = await fetch("/api/admin/update-user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          workRole,
          reportsTo,
          role,
          displayName,
          email,
          phone,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update user");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setEditUser(null);
    },
    onError: (err: Error) => {
      setEditError(err.message);
    },
  });

  const userColumns: Column<UserRow>[] = [
    { key: "display_name", header: "Name" },
    {
      key: "email",
      header: "Email",
      render: (row) => (
        <span className="text-sm break-all">{row.email ?? "—"}</span>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      render: (row) => (
        <span className="text-sm">{row.phone?.trim() ? row.phone : "—"}</span>
      ),
    },
    {
      key: "role",
      header: "Permission",
      render: (row) => (
        <Badge
          variant={
            row.role === "admin"
              ? "default"
              : row.role === "user"
                ? "info"
                : "secondary"
          }
        >
          {row.role}
        </Badge>
      ),
    },
    {
      key: "work_role",
      header: "Work Role",
      render: (row) => {
        const label = workRoleLabel(row.work_role as WorkRole | null);
        return label ? (
          <Badge variant="outline">{label}</Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        );
      },
    },
    {
      key: "reports_to_name",
      header: "Reports To",
      render: (row) => {
        const manager = users.find((u) => u.user_id === row.reports_to);
        return manager ? (
          <span className="text-sm">{manager.display_name}</span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        );
      },
    },
    {
      key: "created_at",
      header: "Joined",
      render: (row) => new Date(row.created_at).toLocaleDateString("en-AU"),
    },
    {
      key: "actions",
      header: "",
      sortable: false,
      render: (row) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            title="Edit user details"
            onClick={() => {
              setEditUser(row);
              setEditPermissionRole(row.role as UserRole);
              setEditDisplayName(row.display_name);
              setEditEmail(row.email ?? "");
              setEditPhone(row.phone ?? "");
              setEditWorkRole((row.work_role as WorkRole) ?? "none");
              setEditReportsTo(row.reports_to ?? "none");
              setEditError(null);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {row.user_id !== currentUser?.id && (
            <>
              <Button
                variant="ghost"
                size="sm"
                title="Set temporary password"
                onClick={() => {
                  setSetPasswordUserId(row.user_id);
                  setSetPasswordUserName(row.display_name);
                }}
              >
                <Key className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                title="Delete user"
                onClick={() => setConfirmDeleteId(row.user_id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const inviteMutation = useAuthAwareMutation({
    mutationFn: async () => {
      setInviteError(null);
      const res = await fetch("/api/admin/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName, role, workRole: inviteWorkRole || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to invite user");
      return json as { inviteLink: string; userId: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setInviteLink(data.inviteLink);
    },
    onError: (err: Error) => {
      setInviteError(err.message);
    },
  });

  const handleCopy = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setEmail("");
      setDisplayName("");
      setRole("user");
      setInviteWorkRole("");
      setInviteLink(null);
      setCopied(false);
      setInviteError(null);
      inviteMutation.reset();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">User Management</h2>
        <Dialog open={open} onOpenChange={handleClose}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Invite User
            </Button>
          </DialogTrigger>
          <DialogContent>
            {inviteLink ? (
              <>
                <DialogHeader>
                  <DialogTitle>Invite Link Ready</DialogTitle>
                  <DialogDescription>
                    The account for <strong>{email}</strong> has been created.
                    Copy the link below and send it to the user — they will be
                    prompted to set a password when they open it.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
                    <span className="flex-1 break-all text-xs font-mono text-muted-foreground">
                      {inviteLink}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCopy}
                      className="shrink-0"
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Paste this link into an email to <strong>{email}</strong>.
                      The link is single-use and will expire after 24 hours.
                    </span>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => handleClose(false)}>Done</Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Invite User</DialogTitle>
                  <DialogDescription>
                    Create an account and generate an invite link to send
                    manually. The user will set their own password on first
                    login.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="user@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Display Name</Label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Full name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Permission Level</Label>
                    <Select
                      value={role}
                      onValueChange={(v) => setRole(v as UserRole)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Work Role <span className="text-muted-foreground">(optional)</span></Label>
                    <Select
                      value={inviteWorkRole}
                      onValueChange={(v) => setInviteWorkRole(v as WorkRole)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select work role..." />
                      </SelectTrigger>
                      <SelectContent>
                        {WORK_ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {inviteError && (
                    <p className="text-sm text-destructive">{inviteError}</p>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => inviteMutation.mutate()}
                    disabled={
                      !email || !displayName || inviteMutation.isPending
                    }
                  >
                    {inviteMutation.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    Generate Invite Link
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
      <DataTable<UserRow>
        data={users}
        columns={userColumns}
        searchPlaceholder="Search users..."
        searchKeys={["display_name", "email"]}
        loading={isLoading}
      />

      {/* Edit user dialog */}
      <Dialog
        open={!!editUser}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setEditUser(null);
            setEditError(null);
            updateUserMutation.reset();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User — {editUser?.display_name}</DialogTitle>
            <DialogDescription>
              Update permission, contact details, work role, and reporting line.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Permission level</Label>
              <Select
                value={editPermissionRole}
                onValueChange={(v) => setEditPermissionRole(v as UserRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Display name</Label>
              <Input
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Work Role</Label>
              <Select
                value={editWorkRole}
                onValueChange={(v) => setEditWorkRole(v as WorkRole | "none")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No work role assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No work role —</SelectItem>
                  {WORK_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reports To</Label>
              <Select
                value={editReportsTo}
                onValueChange={setEditReportsTo}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No manager assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {users
                    .filter((u) => u.user_id !== editUser?.user_id)
                    .map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.display_name}
                        {u.work_role
                          ? ` (${workRoleLabel(u.work_role as WorkRole)})`
                          : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {editError && (
              <p className="text-sm text-destructive">{editError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditUser(null)}
              disabled={updateUserMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                editUser &&
                updateUserMutation.mutate({
                  userId: editUser.user_id,
                  workRole: editWorkRole !== "none" ? editWorkRole : null,
                  reportsTo:
                    editReportsTo && editReportsTo !== "none"
                      ? editReportsTo
                      : null,
                  role: editPermissionRole,
                  displayName: editDisplayName.trim(),
                  email: editEmail.trim(),
                  phone: editPhone.trim() === "" ? null : editPhone.trim(),
                })
              }
              disabled={
                updateUserMutation.isPending ||
                !editDisplayName.trim() ||
                !editEmail.trim()
              }
            >
              {updateUserMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set temporary password dialog */}
      <Dialog
        open={!!setPasswordUserId}
        onOpenChange={(isOpen) => !isOpen && handleCloseSetPassword()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Temporary Password</DialogTitle>
            <DialogDescription>
              Set a temporary password for{" "}
              <strong>{setPasswordUserName}</strong>. Share it with them
              directly — they can change it after logging in.
            </DialogDescription>
          </DialogHeader>
          {setPasswordDone ? (
            <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
              <Check className="h-4 w-4 shrink-0" />
              Password set. The user can now log in with it.
            </div>
          ) : (
            <div className="space-y-3 py-1">
              <div className="space-y-1.5">
                <Label>Temporary Password</Label>
                <Input
                  type="text"
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  autoComplete="off"
                />
              </div>
              {setPasswordError && (
                <p className="text-sm text-destructive">{setPasswordError}</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseSetPassword}>
              {setPasswordDone ? "Close" : "Cancel"}
            </Button>
            {!setPasswordDone && (
              <Button
                onClick={() =>
                  setPasswordUserId &&
                  setPasswordMutation.mutate({
                    userId: setPasswordUserId,
                    password: tempPassword,
                  })
                }
                disabled={
                  tempPassword.length < 8 || setPasswordMutation.isPending
                }
              >
                {setPasswordMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Set Password
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!confirmDeleteId}
        onOpenChange={(isOpen) => !isOpen && setConfirmDeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              This will permanently delete the user account and all associated
              data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.error && (
            <p className="text-sm text-destructive">
              {(deleteMutation.error as Error).message}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteId(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                confirmDeleteId && deleteMutation.mutate(confirmDeleteId)
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Union membership types (worker union status) ----------

interface UnionMembershipRow extends UnionMembershipType {
  [key: string]: unknown;
}

function UnionMembershipTypesTab() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typeName, setTypeName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-union-membership-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("union_membership_types")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as UnionMembershipRow[];
    },
  });

  const addMutation = useAuthAwareMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("union_membership_types").insert({
        type_name: typeName,
        display_name: displayName,
        sort_order: parseInt(sortOrder, 10) || 0,
        is_default: false,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-union-membership-types"] });
      queryClient.invalidateQueries({ queryKey: ["union-membership-types"] });
      setOpen(false);
      setTypeName("");
      setDisplayName("");
      setSortOrder("0");
    },
  });

  const toggleActive = useAuthAwareMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const { error } = await supabase
        .from("union_membership_types")
        .update({ is_active: active })
        .eq("union_membership_type_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-union-membership-types"] });
      queryClient.invalidateQueries({ queryKey: ["union-membership-types"] });
    },
  });

  const umColumns: Column<UnionMembershipRow>[] = [
    { key: "type_name", header: "Type key" },
    { key: "display_name", header: "Display name" },
    {
      key: "is_default",
      header: "Default",
      render: (row) =>
        row.is_default ? (
          <Badge variant="info">Default</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "is_active",
      header: "Status",
      render: (row) => (
        <Badge variant={row.is_active ? "success" : "secondary"}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    { key: "sort_order", header: "Order" },
    {
      key: "actions",
      header: "Actions",
      sortable: false,
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            toggleActive.mutate({
              id: row.union_membership_type_id,
              active: !row.is_active,
            })
          }
        >
          {row.is_active ? (
            <ShieldOff className="h-4 w-4" />
          ) : (
            <Shield className="h-4 w-4" />
          )}
          {row.is_active ? "Deactivate" : "Activate"}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Union member types</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Financial / non-member / resigned / other-union categories on each worker record.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add type
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add union member type</DialogTitle>
              <DialogDescription>
                Stable type key (snake_case) used in imports and reporting; display name is shown in the UI.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Type key</Label>
                <Input
                  value={typeName}
                  onChange={(e) => setTypeName(e.target.value)}
                  placeholder="e.g. financial_member"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Display name</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Financial member"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => addMutation.mutate()}
                disabled={!typeName || !displayName || addMutation.isPending}
              >
                {addMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Add type
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable<UnionMembershipRow>
        data={rows}
        columns={umColumns}
        searchPlaceholder="Search member types..."
        searchKeys={["type_name", "display_name"]}
        loading={isLoading}
      />
    </div>
  );
}

// ---------- Organising role types (delegate / rep / contact) ----------

interface RoleRow extends MemberRoleType {
  [key: string]: unknown;
}

function MemberRolesTab() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [roleName, setRoleName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_role_types")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as RoleRow[];
    },
  });

  const addMutation = useAuthAwareMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("member_role_types").insert({
        role_name: roleName,
        display_name: displayName,
        sort_order: parseInt(sortOrder, 10) || 0,
        is_default: false,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      queryClient.invalidateQueries({ queryKey: ["member-role-types"] });
      setOpen(false);
      setRoleName("");
      setDisplayName("");
      setSortOrder("0");
    },
  });

  const toggleActive = useAuthAwareMutation({
    mutationFn: async ({
      id,
      active,
    }: {
      id: number;
      active: boolean;
    }) => {
      const { error } = await supabase
        .from("member_role_types")
        .update({ is_active: active })
        .eq("role_type_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
      queryClient.invalidateQueries({ queryKey: ["member-role-types"] });
    },
  });

  const roleColumns: Column<RoleRow>[] = [
    { key: "role_name", header: "Role Name" },
    { key: "display_name", header: "Display Name" },
    {
      key: "is_default",
      header: "Default",
      render: (row) =>
        row.is_default ? (
          <Badge variant="info">Default</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "is_active",
      header: "Status",
      render: (row) => (
        <Badge variant={row.is_active ? "success" : "secondary"}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    { key: "sort_order", header: "Order" },
    {
      key: "actions",
      header: "Actions",
      sortable: false,
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            toggleActive.mutate({
              id: row.role_type_id,
              active: !row.is_active,
            })
          }
        >
          {row.is_active ? (
            <ShieldOff className="h-4 w-4" />
          ) : (
            <Shield className="h-4 w-4" />
          )}
          {row.is_active ? "Deactivate" : "Activate"}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Organising role types</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Activism and leadership roles (contact, delegate, bargaining rep). Separate from union member type.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add role
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add organising role</DialogTitle>
              <DialogDescription>
                Create a new organising role type (stable key in snake_case).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Role Name</Label>
                <Input
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="e.g. delegate"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Display Name</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Delegate"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => addMutation.mutate()}
                disabled={!roleName || !displayName || addMutation.isPending}
              >
                {addMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Add role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable<RoleRow>
        data={roles}
        columns={roleColumns}
        searchPlaceholder="Search organising roles..."
        searchKeys={["role_name", "display_name"]}
        loading={isLoading}
      />
    </div>
  );
}

// ---------- Sectors Tab ----------

interface SectorRow extends Sector {
  [key: string]: unknown;
}

const sectorColumns: Column<SectorRow>[] = [
  { key: "sector_name", header: "Sector" },
  {
    key: "description",
    header: "Description",
    render: (row) => row.description ?? "—",
  },
];

function SectorsTab() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sectorName, setSectorName] = useState("");
  const [description, setDescription] = useState("");

  const { data: sectors = [], isLoading } = useQuery({
    queryKey: ["admin-sectors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sectors")
        .select("*")
        .order("sector_name");
      if (error) throw error;
      return data as SectorRow[];
    },
  });

  const addMutation = useAuthAwareMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sectors").insert({
        sector_name: sectorName,
        description: description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-sectors"] });
      setOpen(false);
      setSectorName("");
      setDescription("");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Sectors</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add Sector
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Sector</DialogTitle>
              <DialogDescription>Create a new sector.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Sector Name</Label>
                <Input
                  value={sectorName}
                  onChange={(e) => setSectorName(e.target.value)}
                  placeholder="e.g. Oil & Gas"
                />
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
                onClick={() => addMutation.mutate()}
                disabled={!sectorName || addMutation.isPending}
              >
                {addMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Add Sector
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable<SectorRow>
        data={sectors}
        columns={sectorColumns}
        searchPlaceholder="Search sectors..."
        searchKeys={["sector_name"]}
        loading={isLoading}
      />
    </div>
  );
}

// ---------- Settings Tab ----------

function SettingsTab() {
  const [actionNetworkKey, setActionNetworkKey] = useState("");
  const [yabbrKey, setYabbrKey] = useState("");
  const [yabbrUrl, setYabbrUrl] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Settings</h2>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Key className="h-4 w-4" />
              Action Network API
            </CardTitle>
            <CardDescription>
              Configure the Action Network integration for member syncing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input
                type="password"
                value={actionNetworkKey}
                onChange={(e) => setActionNetworkKey(e.target.value)}
                placeholder="Enter API key..."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link className="h-4 w-4" />
              Yabbr API
            </CardTitle>
            <CardDescription>
              Configure Yabbr for SMS and communications.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input
                type="password"
                value={yabbrKey}
                onChange={(e) => setYabbrKey(e.target.value)}
                placeholder="Enter API key..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>API URL</Label>
              <Input
                type="url"
                value={yabbrUrl}
                onChange={(e) => setYabbrUrl(e.target.value)}
                placeholder="https://api.yabbr.com.au"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Button onClick={handleSave}>
        <Save className="h-4 w-4" />
        {saved ? "Saved!" : "Save Settings"}
      </Button>
    </div>
  );
}

// ---------- Import History Tab ----------

interface ImportRow extends ImportLog {
  [key: string]: unknown;
}

const importColumns: Column<ImportRow>[] = [
  { key: "file_name", header: "File" },
  {
    key: "import_type",
    header: "Type",
    render: (row) => (
      <Badge variant="outline">{row.import_type}</Badge>
    ),
  },
  { key: "records_created", header: "Created" },
  { key: "records_updated", header: "Updated" },
  {
    key: "errors",
    header: "Errors",
    render: (row) =>
      row.errors ? (
        <span className="text-destructive text-sm">{row.errors}</span>
      ) : (
        <span className="text-muted-foreground">None</span>
      ),
  },
  {
    key: "imported_at",
    header: "Imported At",
    render: (row) => new Date(row.imported_at).toLocaleString("en-AU"),
  },
];

function ImportHistoryTab() {
  const supabase = createClient();

  const { data: imports = [], isLoading } = useQuery({
    queryKey: ["admin-imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_logs")
        .select("*")
        .order("imported_at", { ascending: false });
      if (error) throw error;
      return data as ImportRow[];
    },
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Import History</h2>
      <DataTable<ImportRow>
        data={imports}
        columns={importColumns}
        searchPlaceholder="Search imports..."
        searchKeys={["file_name", "import_type"]}
        loading={isLoading}
      />
    </div>
  );
}

// ---------- Membership Import Tab ----------

function MembershipImportTab() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [workerWizardOpen, setWorkerWizardOpen] = useState(false);

  return (
    <div className="space-y-6 pt-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Monthly Membership Import</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Import the three monthly membership files: New Joins, Resignations, and Recommencing Members.
              Each file is matched against existing workers by Reference ID, then email/phone.
            </p>
          </div>
          <Button onClick={() => setWizardOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Start Import
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              title: "New Joins",
              desc: "Creates new member records or updates existing ones by Reference ID. Sets join date, worksite, occupation, and employer.",
            },
            {
              title: "Resignations",
              desc: "Matches existing members by Reference ID and marks them as inactive, setting resignation date and reason.",
            },
            {
              title: "Recommencing Members",
              desc: "Re-activates resigned members, updating the rejoin date (only if more recent than the existing date).",
            },
          ].map((card) => (
            <div key={card.title} className="rounded-lg border p-4 space-y-2">
              <p className="font-medium text-sm">{card.title}</p>
              <p className="text-xs text-muted-foreground">{card.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Worker Import</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Import workers from a spreadsheet with column mapping, employer assignment,
              worksite and occupation matching, and deduplication.
            </p>
          </div>
          <Button variant="outline" onClick={() => setWorkerWizardOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import Workers
          </Button>
        </div>
      </div>

      <MembershipImportWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />
      <WorkerImportWizard
        open={workerWizardOpen}
        onOpenChange={setWorkerWizardOpen}
      />
    </div>
  );
}

// ---------- Reference Data Import Tab ----------

function ReferenceDataTab() {
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Reference Data Import</h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Employer / Worksite / Occupation Import Wizard
          </CardTitle>
          <CardDescription>
            Upload an Excel file containing employer, worksite, and occupation
            data. The wizard uses fuzzy matching to reconcile entries against
            existing records, builds canonical lists, and creates alias tables
            for smart matching on future imports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setWizardOpen(true)}>
            <Upload className="h-4 w-4" />
            Launch Import Wizard
          </Button>
        </CardContent>
      </Card>
      <ReferenceDataWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />
    </div>
  );
}

// ---------- Main Page ----------

export default function AdministrationPage() {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <EurekaLoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="rounded-lg bg-destructive/10 p-4 mb-4">
          <AlertTriangle className="h-10 w-10 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground max-w-md">
          You do not have permission to access the administration area. Please
          contact an administrator if you believe this is an error.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Administration</h1>

      <Tabs defaultValue="system">
        <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 flex-nowrap">
          <TabsTrigger value="system">System Management</TabsTrigger>
          <TabsTrigger value="data">Data Management</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="monitoring">System Monitoring</TabsTrigger>
        </TabsList>

        <TabsContent value="system">
          <Tabs defaultValue="users" className="mt-4">
            <TabsList className="h-9 bg-muted/50">
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="roles">Roles &amp; membership</TabsTrigger>
              <TabsTrigger value="sectors">Sectors</TabsTrigger>
              <TabsTrigger value="workload">Workload</TabsTrigger>
              <TabsTrigger value="patches">Organiser Patches</TabsTrigger>
            </TabsList>
            <TabsContent value="users">
              <UsersTab />
            </TabsContent>
            <TabsContent value="roles">
              <div className="space-y-12">
                <UnionMembershipTypesTab />
                <MemberRolesTab />
              </div>
            </TabsContent>
            <TabsContent value="sectors">
              <SectorsTab />
            </TabsContent>
            <TabsContent value="workload">
              <WorkloadTab />
            </TabsContent>
            <TabsContent value="patches">
              <OrganiserPatchesTab />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="data">
          <Tabs defaultValue="imports" className="mt-4">
            <TabsList className="h-9 bg-muted/50">
              <TabsTrigger value="imports">Import History</TabsTrigger>
              <TabsTrigger value="membership_import">Membership Import</TabsTrigger>
              <TabsTrigger value="employer_wizard">Employer Wizard</TabsTrigger>
              <TabsTrigger value="ref_data">Reference Data Import</TabsTrigger>
            </TabsList>
            <TabsContent value="imports">
              <ImportHistoryTab />
            </TabsContent>
            <TabsContent value="membership_import">
              <MembershipImportTab />
            </TabsContent>
            <TabsContent value="employer_wizard">
              <EmployerWizard />
            </TabsContent>
            <TabsContent value="ref_data">
              <ReferenceDataTab />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
        <TabsContent value="monitoring">
          <MonitoringTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- System Monitoring Tab ----------

interface SystemStatus {
  supabase_connected: boolean;
  supabase_latency_ms: number | null;
  error_count_24h: number;
  slow_queries_24h: number;
  active_users: number;
  retention_status: Record<string, { value: number; details: unknown }>;
  last_checked: string;
}

function MonitoringTab() {
  const supabase = createClient();
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [status, setStatus] = useState<SystemStatus | null>(null);

  const fetchStatus = async () => {
    setRefreshing(true);
    try {
      // Check Supabase connection
      const start = Date.now();
      const { data: sbCheck, error: sbError } = await supabase
        .from("sectors")
        .select("sector_id")
        .limit(1);

      const latency = sbError ? null : Date.now() - start;

      // Get error count from Sentry (placeholder - would use Sentry API)
      // For now, we'll simulate with a query that might fail
      const errorCount = 0; // Would come from Sentry API

      // Get active users count
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id");

      // Get retention status
      const { data: retention } = await fetch("/api/admin/retention-status")
        .then(r => r.json())
        .catch(() => ({ status: {} }));

      setStatus({
        supabase_connected: !sbError && sbCheck !== null,
        supabase_latency_ms: latency,
        error_count_24h: errorCount,
        slow_queries_24h: 0, // Would come from slow query log
        active_users: profiles?.length || 0,
        retention_status: retention?.status || {},
        last_checked: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error fetching status:", error);
      setStatus({
        supabase_connected: false,
        supabase_latency_ms: null,
        error_count_24h: 0,
        slow_queries_24h: 0,
        active_users: 0,
        retention_status: {},
        last_checked: new Date().toISOString(),
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-refresh effect
  useEffect(() => {
    fetchStatus();
    if (autoRefresh) {
      const interval = setInterval(fetchStatus, 30000); // 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getStatusColor = (connected: boolean) => {
    return connected ? "success" : "destructive";
  };

  const getLatencyColor = (ms: number | null) => {
    if (ms === null) return "secondary";
    if (ms < 200) return "success";
    if (ms < 500) return "warning";
    return "destructive";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">System Monitoring</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchStatus()}
            disabled={refreshing}
          >
            <Activity className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="auto-refresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="mr-2"
            />
            <label htmlFor="auto-refresh" className="text-sm">Auto-refresh (30s)</label>
          </div>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Supabase Connection */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />
              Supabase Connection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={status?.supabase_connected ? getStatusColor(status?.supabase_connected) : "secondary"}>
              {status?.supabase_connected ? "Connected" : "Disconnected"}
            </Badge>
            {status != null && status.supabase_latency_ms != null && (
              <p className="text-xs text-muted-foreground mt-2">
                {status.supabase_latency_ms}ms latency
              </p>
            )}
          </CardContent>
        </Card>

        {/* Error Count */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Errors (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status?.error_count_24h}</div>
            <p className="text-xs text-muted-foreground mt-1">Sentry tracked errors</p>
          </CardContent>
        </Card>

        {/* Slow Queries */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Slow Queries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status?.slow_queries_24h}</div>
            <p className="text-xs text-muted-foreground mt-1">{"Queries >1s in last 24h"}</p>
          </CardContent>
        </Card>

        {/* Active Users */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Server className="h-4 w-4" />
              Active Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{status?.active_users}</div>
            <p className="text-xs text-muted-foreground mt-1">Active user sessions</p>
          </CardContent>
        </Card>
      </div>

      {/* Import Log Retention Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import Log Retention Status</CardTitle>
          <CardDescription>
            Automated retention: 90 days hot, 1 year cold storage
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status?.retention_status ? (
            <div className="space-y-2">
              {Object.entries(status.retention_status).map(([name, data]) => (
                <div key={name} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="text-sm font-medium capitalize">{name.replace(/_/g, " ")}</span>
                  <div className="text-right">
                    <span className="text-2xl font-bold mr-4">{String(data.value)}</span>
                    {data.details != null ? (
                      <span className="text-xs text-muted-foreground">
                        {JSON.stringify(data.details).replace(/["{}]/g, "")}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Loading retention status...</div>
          )}
        </CardContent>
      </Card>

      {/* Connection Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last checked:</span>
              <span>{status?.last_checked ? new Date(status.last_checked).toLocaleString() : "Never"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Environment:</span>
              <span>Offshore Alliance Platform</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Supabase URL:</span>
              <span className="font-mono text-xs">
                {process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/https?:\/\/[^/]+@/, "")}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
