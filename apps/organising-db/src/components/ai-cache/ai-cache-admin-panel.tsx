'use client';

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AICacheStats } from "@/lib/ai-cache";
import { calculateHitRate, formatSavings } from "@/lib/ai-cache";

export function AICacheAdminPanel() {
  const [stats, setStats] = useState<AICacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const supabase = createClient();

  async function fetchStats() {
    try {
      const { data, error: err } = await supabase.rpc('get_ai_cache_stats');

      if (err) throw err;

      setStats(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching AI cache stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load cache stats');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStats();
  }, [supabase]);

  async function handleClearExpired() {
    setActionLoading('clear-expired');
    setMessage(null);

    try {
      const { data, error: err } = await supabase.rpc('clear_expired_ai_cache');

      if (err) throw err;

      setMessage(`Cleared ${data} expired cache entries`);
      fetchStats();
    } catch (err) {
      console.error('Error clearing expired cache:', err);
      setError(err instanceof Error ? err.message : 'Failed to clear expired cache');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleClearAll() {
    if (!confirm('Are you sure you want to clear ALL AI cache entries? This cannot be undone.')) {
      return;
    }

    setActionLoading('clear-all');
    setMessage(null);

    try {
      const { data, error: err } = await supabase.rpc('clear_all_ai_cache');

      if (err) throw err;

      setMessage(`Cleared ${data} cache entries`);
      fetchStats();
    } catch (err) {
      console.error('Error clearing all cache:', err);
      setError(err instanceof Error ? err.message : 'Failed to clear cache');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-24 bg-gray-200 rounded"></div>
            <div className="h-24 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            AI Response Cache
          </h2>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            Disabled
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Caching infrastructure ready for future AI features
        </p>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-800">{message}</p>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-600 font-medium">Total Entries</p>
              <p className="text-2xl font-bold text-blue-900">{stats.active_entries}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-green-600 font-medium">Cache Hit Rate</p>
              <p className="text-2xl font-bold text-green-900">{calculateHitRate(stats)}%</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <p className="text-sm text-purple-600 font-medium">Est. Savings</p>
              <p className="text-2xl font-bold text-purple-900">{formatSavings(stats)}</p>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg">
              <p className="text-sm text-yellow-600 font-medium">Total Tokens</p>
              <p className="text-2xl font-bold text-yellow-900">{stats.total_tokens || 0}</p>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleClearExpired}
            disabled={actionLoading !== null}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
          >
            {actionLoading === 'clear-expired' ? 'Clearing...' : 'Clear Expired'}
          </button>
          <button
            onClick={handleClearAll}
            disabled={actionLoading !== null}
            className="px-4 py-2 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-md disabled:opacity-50"
          >
            {actionLoading === 'clear-all' ? 'Clearing...' : 'Clear All Cache'}
          </button>
        </div>

        <div className="mt-6 p-4 bg-gray-50 rounded-md">
          <p className="text-xs text-gray-600">
            <strong>Note:</strong> AI caching is currently disabled. Enable it by setting{" "}
            <code className="bg-gray-200 px-1 py-0.5 rounded">NEXT_PUBLIC_AI_CACHE_ENABLED=true</code>{" "}
            in your environment variables when AI features are implemented.
          </p>
        </div>
      </div>
    </div>
  );
}
