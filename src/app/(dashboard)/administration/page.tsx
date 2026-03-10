"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  MemberRoleType,
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
} from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";

// ---------- Users Tab ----------

interface UserRow extends UserProfile {
  [key: string]: unknown;
}

function UsersTab() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as UserRow[];
    },
  });

  const deleteMutation = useMutation({
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

  const setPasswordMutation = useMutation({
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

  const userColumns: Column<UserRow>[] = [
    { key: "display_name", header: "Name" },
    {
      key: "role",
      header: "Role",
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
      key: "created_at",
      header: "Joined",
      render: (row) => new Date(row.created_at).toLocaleDateString("en-AU"),
    },
    {
      key: "actions",
      header: "",
      sortable: false,
      render: (row) =>
        row.user_id === currentUser?.id ? null : (
          <div className="flex gap-1">
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
          </div>
        ),
    },
  ];

  const inviteMutation = useMutation({
    mutationFn: async () => {
      setInviteError(null);
      const res = await fetch("/api/admin/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName, role }),
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
                    <Label>Role</Label>
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
        searchKeys={["display_name"]}
        loading={isLoading}
      />

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
              <strong>{setSetPasswordUserName}</strong>. Share it with them
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

// ---------- Member Roles Tab ----------

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

  const addMutation = useMutation({
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
      setOpen(false);
      setRoleName("");
      setDisplayName("");
      setSortOrder("0");
    },
  });

  const toggleActive = useMutation({
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-roles"] }),
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
        <h2 className="text-xl font-semibold">Member Role Types</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add Role
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Member Role</DialogTitle>
              <DialogDescription>
                Create a new member role type.
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
                Add Role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable<RoleRow>
        data={roles}
        columns={roleColumns}
        searchPlaceholder="Search roles..."
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

  const addMutation = useMutation({
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

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Member Roles</TabsTrigger>
          <TabsTrigger value="sectors">Sectors</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="imports">Import History</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <UsersTab />
        </TabsContent>
        <TabsContent value="roles">
          <MemberRolesTab />
        </TabsContent>
        <TabsContent value="sectors">
          <SectorsTab />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
        <TabsContent value="imports">
          <ImportHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
