'use client';

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface PendingRequest {
  request_id: number;
  campaign_id: number;
  campaign_name: string;
  requester_id: string;
  requester_name: string;
  requester_email: string;
  reason: string;
  created_at: string;
}

export function PendingRequestsPanel() {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function fetchPendingRequests() {
    try {
      const response = await fetch("/api/permissions/pending");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch pending requests");
      }

      setRequests(data.requests || []);
    } catch (err) {
      console.error("Error fetching pending requests:", err);
      setError(err instanceof Error ? err.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPendingRequests();
  }, [supabase]);

  async function handleApprove(requestId: number) {
    setProcessing(requestId);
    try {
      const response = await fetch("/api/permissions/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to approve request");
      }

      // Remove the request from the list
      setRequests((prev) => prev.filter((r) => r.request_id !== requestId));
    } catch (err) {
      console.error("Error approving request:", err);
      alert(err instanceof Error ? err.message : "Failed to approve request");
    } finally {
      setProcessing(null);
    }
  }

  async function handleDeny(requestId: number) {
    setProcessing(requestId);
    try {
      const response = await fetch("/api/permissions/deny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to deny request");
      }

      // Remove the request from the list
      setRequests((prev) => prev.filter((r) => r.request_id !== requestId));
    } catch (err) {
      console.error("Error denying request:", err);
      alert(err instanceof Error ? err.message : "Failed to deny request");
    } finally {
      setProcessing(null);
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

  if (requests.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Pending Permission Requests
        </h2>
        <p className="text-sm text-gray-500">No pending requests</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          Pending Permission Requests
          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {requests.length}
          </span>
        </h2>
      </div>
      <div className="divide-y divide-gray-200">
        {requests.map((request) => (
          <div key={request.request_id} className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-gray-900">
                    {request.requester_name}
                  </h3>
                  <span className="text-sm text-gray-500">
                    ({request.requester_email})
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-1">
                  is requesting access to <strong>{request.campaign_name}</strong>
                </p>
                {request.reason && (
                  <p className="text-sm text-gray-500 italic">
                    "{request.reason}"
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  Requested {new Date(request.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => handleDeny(request.request_id)}
                  disabled={processing === request.request_id}
                  className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-md disabled:opacity-50"
                >
                  {processing === request.request_id ? "..." : "Deny"}
                </button>
                <button
                  onClick={() => handleApprove(request.request_id)}
                  disabled={processing === request.request_id}
                  className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-md disabled:opacity-50"
                >
                  {processing === request.request_id ? "..." : "Approve"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
