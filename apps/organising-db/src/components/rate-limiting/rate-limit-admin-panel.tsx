'use client';

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface RateLimitConfig {
  config_id: number;
  user_id: string;
  requests_per_minute: number | null;
  requests_per_hour: number | null;
  requests_per_day: number | null;
  is_exempt: boolean;
  cost_per_request: number;
  notes: string;
}

interface UserStats {
  user_id: string;
  email?: string;
  config: RateLimitConfig | null;
  usage: {
    requests_last_minute: number;
    requests_last_hour: number;
    requests_last_day: number;
  };
  total_cost_30days: number;
}

export function RateLimitAdminPanel() {
  const [users, setUsers] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  async function fetchUserStats() {
    try {
      // Get all users with rate limit configs
      const { data: configs, error: configsError } = await supabase
        .from("rate_limit_config")
        .select("*");

      if (configsError) throw configsError;

      // Fetch stats for each user
      const statsPromises = configs.map(async (config: RateLimitConfig) => {
        const { data: stats } = await supabase.rpc("get_user_rate_limit_stats", {
          p_user_id: config.user_id,
        });

        // Get user email
        const { data: adminData } = await supabase.auth.admin.getUserById(config.user_id);
        const email = adminData.user?.email;

        return {
          user_id: config.user_id,
          email,
          config,
          ...stats,
        } as UserStats;
      });

      const userStats = await Promise.all(statsPromises);
      setUsers(userStats);
    } catch (err) {
      console.error("Error fetching rate limit stats:", err);
      setError(err instanceof Error ? err.message : "Failed to load rate limit stats");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUserStats();
  }, [supabase]);

  async function handleSaveConfig(userId: string, config: Partial<RateLimitConfig>) {
    setSaving(true);
    setError(null);

    try {
      const { error } = await supabase
        .from("rate_limit_config")
        .upsert({
          user_id: userId,
          ...config,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      await fetchUserStats();
      setEditingUser(null);
    } catch (err) {
      console.error("Error saving rate limit config:", err);
      setError(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveConfig(userId: string) {
    if (!confirm("Remove rate limit config for this user?")) {
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("rate_limit_config")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;

      await fetchUserStats();
    } catch (err) {
      console.error("Error removing rate limit config:", err);
      setError(err instanceof Error ? err.message : "Failed to remove config");
    } finally {
      setSaving(false);
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

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          Per-User Rate Limits
          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {users.length}
          </span>
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Configure rate limits for individual users (no default limits)
        </p>
      </div>

      {error && (
        <div className="p-4 m-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="divide-y divide-gray-200">
        {users.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">
            No rate limit configurations found. Rate limiting is disabled by default.
          </div>
        ) : (
          users.map((user) => (
            <div key={user.user_id} className="p-6">
              {editingUser === user.user_id ? (
                <RateLimitEditForm
                  user={user}
                  onSave={handleSaveConfig}
                  onCancel={() => setEditingUser(null)}
                  saving={saving}
                />
              ) : (
                <RateLimitDisplay
                  user={user}
                  onEdit={() => setEditingUser(user.user_id)}
                  onRemove={() => handleRemoveConfig(user.user_id)}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface RateLimitDisplayProps {
  user: UserStats;
  onEdit: () => void;
  onRemove: () => void;
}

function RateLimitDisplay({ user, onEdit, onRemove }: RateLimitDisplayProps) {
  if (!user.config) return null;

  return (
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="font-medium text-gray-900">{user.email || user.user_id}</h3>
          {user.config.is_exempt && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
              Exempt
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-3">
          <div>
            <p className="text-xs text-gray-500">Minute Limit</p>
            <p className="text-sm font-medium text-gray-900">
              {user.config.requests_per_minute ?? "None"}
            </p>
            <p className="text-xs text-gray-500">
              Used: {user.usage.requests_last_minute}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Hour Limit</p>
            <p className="text-sm font-medium text-gray-900">
              {user.config.requests_per_hour ?? "None"}
            </p>
            <p className="text-xs text-gray-500">
              Used: {user.usage.requests_last_hour}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Day Limit</p>
            <p className="text-sm font-medium text-gray-900">
              {user.config.requests_per_day ?? "None"}
            </p>
            <p className="text-xs text-gray-500">
              Used: {user.usage.requests_last_day}
            </p>
          </div>
        </div>

        {user.config.cost_per_request > 0 && (
          <p className="text-xs text-gray-500">
            Cost per request: ${user.config.cost_per_request.toFixed(2)} | 30-day total: ${user.total_cost_30days.toFixed(2)}
          </p>
        )}
      </div>

      <div className="flex gap-2 ml-4">
        <button
          onClick={onEdit}
          className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md"
        >
          Edit
        </button>
        <button
          onClick={onRemove}
          className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-md"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

interface RateLimitEditFormProps {
  user: UserStats;
  onSave: (userId: string, config: Partial<RateLimitConfig>) => void;
  onCancel: () => void;
  saving: boolean;
}

function RateLimitEditForm({ user, onSave, onCancel, saving }: RateLimitEditFormProps) {
  const [minute, setMinute] = useState(user.config?.requests_per_minute ?? "");
  const [hour, setHour] = useState(user.config?.requests_per_hour ?? "");
  const [day, setDay] = useState(user.config?.requests_per_day ?? "");
  const [exempt, setExempt] = useState(user.config?.is_exempt ?? false);
  const [cost, setCost] = useState(user.config?.cost_per_request ?? "");
  const [notes, setNotes] = useState(user.config?.notes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(user.user_id, {
      requests_per_minute: minute ? parseInt(minute) : null,
      requests_per_hour: hour ? parseInt(hour) : null,
      requests_per_day: day ? parseInt(day) : null,
      is_exempt: exempt,
      cost_per_request: cost ? parseFloat(cost) : 0,
      notes: notes || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Requests per Minute
          </label>
          <input
            type="number"
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="No limit"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Requests per Hour
          </label>
          <input
            type="number"
            value={hour}
            onChange={(e) => setHour(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="No limit"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Requests per Day
          </label>
          <input
            type="number"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="No limit"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cost per Request ($)
          </label>
          <input
            type="number"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder="0.00"
          />
        </div>
        <div className="flex items-center">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={exempt}
              onChange={(e) => setExempt(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm font-medium text-gray-700">Exempt from rate limits</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-md"
          placeholder="Optional notes..."
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
