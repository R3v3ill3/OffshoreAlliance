'use client';

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface MyPermission {
  permission_id: number;
  campaign_id: number;
  campaign_name: string;
  granted_by: string;
  granted_at: string;
}

export function MyPermissionsPanel() {
  const [permissions, setPermissions] = useState<MyPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function fetchMyPermissions() {
    try {
      const response = await fetch("/api/permissions/my-permissions");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch permissions");
      }

      setPermissions(data.permissions || []);
    } catch (err) {
      console.error("Error fetching permissions:", err);
      setError(err instanceof Error ? err.message : "Failed to load permissions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMyPermissions();
  }, [supabase]);

  async function handleRevoke(permissionId: number) {
    if (!confirm("Are you sure you want to revoke this permission?")) {
      return;
    }

    setRevoking(permissionId);
    try {
      const response = await fetch("/api/permissions/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission_id: permissionId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to revoke permission");
      }

      // Remove the permission from the list
      setPermissions((prev) => prev.filter((p) => p.permission_id !== permissionId));
    } catch (err) {
      console.error("Error revoking permission:", err);
      alert(err instanceof Error ? err.message : "Failed to revoke permission");
    } finally {
      setRevoking(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (permissions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          My Campaign Permissions
        </h2>
        <p className="text-sm text-gray-500">
          You don't have any additional campaign permissions beyond your assigned campaigns.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          My Campaign Permissions
          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            {permissions.length}
          </span>
        </h2>
      </div>
      <div className="divide-y divide-gray-200">
        {permissions.map((permission) => (
          <div key={permission.permission_id} className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-medium text-gray-900 mb-1">
                  {permission.campaign_name}
                </h3>
                <p className="text-sm text-gray-500">
                  Granted by {permission.granted_by} •{" "}
                  {new Date(permission.granted_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(permission.permission_id)}
                disabled={revoking === permission.permission_id}
                className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-md disabled:opacity-50"
              >
                {revoking === permission.permission_id ? "..." : "Revoke"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
