"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthAwareMutation } from "@/lib/hooks/useAuthAwareMutation";
import { fetchApi } from "@/lib/api/fetch-api";

export type BuildListPurpose = "email" | "phone" | "task";
export type BuildListStatus = "draft" | "fired" | "archived";

export type BuildListSummary = {
  list_id: number;
  campaign_id: number;
  name: string;
  description: string | null;
  default_purpose: BuildListPurpose | null;
  status: BuildListStatus;
  leader_worker_id: number | null;
  leader_organiser_id: number | null;
  source: string;
  fired_call_list_id: number | null;
  fired_draft_id: number | null;
  fired_task_list_id: number | null;
  fired_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Sub-aggregate from items_count(count) — Supabase returns [{ count }]. */
  items_count?: { count: number }[] | null;
};

export type BuildListItem = {
  id: number;
  list_id: number;
  worker_id: number;
  sort_order: number;
  source_ou_id: number | null;
  added_at: string;
  cumulative_rating: number | null;
  worker: {
    worker_id: number;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    is_hsr: boolean | null;
    is_bargaining_rep: boolean | null;
    member_role_type: {
      role_type_id: number;
      role_name: string;
      display_name: string;
    } | null;
  } | null;
  source_ou: { ou_id: number; name: string | null; ou_type: string | null } | null;
};

export type BuildListDetail = BuildListSummary & {
  leader_worker?: {
    worker_id: number;
    first_name: string;
    last_name: string;
  } | null;
  items: BuildListItem[];
};

/** Draft shape consumed by <CreateTaskListDialog draft={...} />. Mirrors that component's CreateTaskListDraft. */
export type FiredTaskDraft = {
  task_list_id: number;
  title: string | null;
  activity_id: number | null;
  leader_worker_id: number | null;
  leader_organiser_id: number | null;
  include_membership_ask: boolean;
  leader_instructions: string | null;
  worker_ids: number[];
};

export type FireResponse = {
  redirect_to: string | null;
  call_list_id?: number;
  draft_id?: number;
  task_list_id?: number;
  draft?: FiredTaskDraft;
};

/**
 * Local snapshot of a worker, used to render optimistic items in the panel
 * before the server roundtrip completes. The wall chart provides this from its
 * already-loaded worker maps so newly-dropped tiles render instantly.
 */
export type BuildListWorkerSnapshot = {
  worker: NonNullable<BuildListItem["worker"]>;
  cumulative_rating: number | null;
  source_ou?: BuildListItem["source_ou"];
};

export type UseBuildListOptions = {
  campaignId: string | number;
  /** Initial list to open (e.g. from URL state or last-used). */
  initialListId?: number | null;
  /**
   * Returns a hydrated snapshot for a worker_id (or null if unknown). When
   * provided, addItems pre-populates the items list optimistically so the
   * UI does not wait for the network roundtrip.
   */
  workerSnapshot?: (workerId: number) => BuildListWorkerSnapshot | null;
};

export function useBuildList({
  campaignId,
  initialListId,
  workerSnapshot,
}: UseBuildListOptions) {
  const queryClient = useQueryClient();
  const cid = typeof campaignId === "string" ? campaignId : String(campaignId);

  const [activeListId, setActiveListId] = useState<number | null>(initialListId ?? null);

  const listsKey = ["worker-lists", cid] as const;
  const detailKey = (id: number | null) => ["worker-list", cid, id] as const;

  const lists = useQuery<BuildListSummary[]>({
    queryKey: listsKey,
    queryFn: async () => {
      const res = await fetchApi(`/api/campaigns/${cid}/worker-lists?status=draft`);
      if (!res.ok) throw new Error(`Failed to load lists: ${res.status}`);
      return (await res.json()) as BuildListSummary[];
    },
  });

  const detail = useQuery<BuildListDetail>({
    queryKey: detailKey(activeListId),
    enabled: activeListId != null,
    queryFn: async () => {
      const res = await fetchApi(`/api/campaigns/${cid}/worker-lists/${activeListId}`);
      if (!res.ok) throw new Error(`Failed to load list: ${res.status}`);
      return (await res.json()) as BuildListDetail;
    },
  });

  const invalidate = useCallback(
    (alsoListId?: number | null) => {
      queryClient.invalidateQueries({ queryKey: listsKey });
      const id = alsoListId ?? activeListId;
      if (id != null) queryClient.invalidateQueries({ queryKey: detailKey(id) });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, activeListId, cid]
  );

  const createList = useAuthAwareMutation<
    BuildListSummary,
    Error,
    { name: string; description?: string | null; default_purpose?: BuildListPurpose | null }
  >({
    mutationFn: async (input) => {
      const res = await fetchApi(`/api/campaigns/${cid}/worker-lists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`Create list failed: ${res.status}`);
      return (await res.json()) as BuildListSummary;
    },
    onSuccess: (created) => {
      setActiveListId(created.list_id);
      invalidate(created.list_id);
    },
  });

  const updateMeta = useAuthAwareMutation<
    BuildListSummary,
    Error,
    Partial<
      Pick<
        BuildListSummary,
        "name" | "description" | "default_purpose" | "status" | "leader_worker_id" | "leader_organiser_id"
      >
    > & { listId: number }
  >({
    mutationFn: async ({ listId, ...patch }) => {
      const res = await fetchApi(`/api/campaigns/${cid}/worker-lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`Update list failed: ${res.status}`);
      return (await res.json()) as BuildListSummary;
    },
    onSuccess: (_, vars) => invalidate(vars.listId),
  });

  const deleteList = useAuthAwareMutation<unknown, Error, { listId: number }>({
    mutationFn: async ({ listId }) => {
      const res = await fetchApi(`/api/campaigns/${cid}/worker-lists/${listId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Delete list failed: ${res.status}`);
      return res.json().catch(() => null);
    },
    onSuccess: (_, vars) => {
      if (activeListId === vars.listId) setActiveListId(null);
      invalidate(vars.listId);
    },
  });

  const addItems = useAuthAwareMutation<
    { added: number; skipped: number },
    Error,
    { listId: number; workerIds: number[]; sourceOuId?: number | null },
    { previous: BuildListDetail | undefined }
  >({
    mutationFn: async ({ listId, workerIds, sourceOuId }) => {
      const res = await fetchApi(
        `/api/campaigns/${cid}/worker-lists/${listId}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            worker_ids: workerIds,
            source_ou_id: sourceOuId ?? null,
          }),
        }
      );
      if (!res.ok) throw new Error(`Add items failed: ${res.status}`);
      const data = (await res.json()) as { added: number; skipped: number };
      return data;
    },
    // Optimistic update: append placeholders to the cached detail immediately
    // so the user sees rows appear without waiting for the API roundtrip.
    onMutate: async ({ listId, workerIds, sourceOuId }) => {
      const key = detailKey(listId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BuildListDetail>(key);
      if (previous) {
        const haveIds = new Set(previous.items.map((i) => i.worker_id));
        const fresh = workerIds.filter((id) => !haveIds.has(id));
        if (fresh.length > 0) {
          const baseSort =
            previous.items.reduce((m, i) => Math.max(m, i.sort_order), -1) + 1;
          const now = new Date().toISOString();
          const placeholders: BuildListItem[] = fresh.map((wid, i) => {
            const snap = workerSnapshot?.(wid) ?? null;
            return {
              // Negative id flags the row as optimistic until the refetch lands.
              id: -1 * (Date.now() + i),
              list_id: listId,
              worker_id: wid,
              sort_order: baseSort + i,
              source_ou_id: sourceOuId ?? snap?.source_ou?.ou_id ?? null,
              added_at: now,
              cumulative_rating: snap?.cumulative_rating ?? null,
              worker: snap?.worker ?? null,
              source_ou: snap?.source_ou ?? null,
            };
          });
          queryClient.setQueryData<BuildListDetail>(key, {
            ...previous,
            items: [...previous.items, ...placeholders],
          });
        }
      }
      return { previous };
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData<BuildListDetail>(detailKey(vars.listId), ctx.previous);
      }
    },
    onSettled: (_data, _err, vars) => invalidate(vars.listId),
  });

  const removeItems = useAuthAwareMutation<
    unknown,
    Error,
    { listId: number; workerIds: number[] },
    { previous: BuildListDetail | undefined }
  >({
    mutationFn: async ({ listId, workerIds }) => {
      const res = await fetchApi(
        `/api/campaigns/${cid}/worker-lists/${listId}/items`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ worker_ids: workerIds }),
        }
      );
      if (!res.ok) throw new Error(`Remove items failed: ${res.status}`);
      return res.json().catch(() => null);
    },
    onMutate: async ({ listId, workerIds }) => {
      const key = detailKey(listId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BuildListDetail>(key);
      if (previous) {
        const drop = new Set(workerIds);
        queryClient.setQueryData<BuildListDetail>(key, {
          ...previous,
          items: previous.items.filter((i) => !drop.has(i.worker_id)),
        });
      }
      return { previous };
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData<BuildListDetail>(detailKey(vars.listId), ctx.previous);
      }
    },
    onSettled: (_data, _err, vars) => invalidate(vars.listId),
  });

  const reorderItems = useAuthAwareMutation<
    unknown,
    Error,
    { listId: number; orderedWorkerIds: number[] }
  >({
    mutationFn: async ({ listId, orderedWorkerIds }) => {
      const res = await fetchApi(
        `/api/campaigns/${cid}/worker-lists/${listId}/items/reorder`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ordered_worker_ids: orderedWorkerIds }),
        }
      );
      if (!res.ok) throw new Error(`Reorder failed: ${res.status}`);
      return res.json().catch(() => null);
    },
    onSuccess: (_, vars) => invalidate(vars.listId),
  });

  const fire = useAuthAwareMutation<
    FireResponse,
    Error,
    {
      listId: number;
      pathway: BuildListPurpose;
      /** Picker value from CampaignOrganiserSelect when firing a task with an organiser leader. */
      leaderOrganiserPickerValue?: string | null;
    }
  >({
    mutationFn: async ({ listId, pathway, leaderOrganiserPickerValue }) => {
      const body =
        pathway === "task" && leaderOrganiserPickerValue
          ? JSON.stringify({
              leader_organiser_picker_value: leaderOrganiserPickerValue,
            })
          : undefined;
      const res = await fetchApi(
        `/api/campaigns/${cid}/worker-lists/${listId}/fire/${pathway}`,
        {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body,
        }
      );
      if (!res.ok) {
        // Prefer the server's JSON `error` field so a toast can show a
        // clean, human-readable message. Fall back to raw text / status.
        const raw = await res.text().catch(() => "");
        let message = `Fire ${pathway} failed (${res.status})`;
        if (raw) {
          try {
            const body = JSON.parse(raw) as {
              error?: string;
              hint?: string | null;
            };
            if (typeof body.error === "string" && body.error.length > 0) {
              message = body.error;
              if (body.hint) message += ` (${body.hint})`;
            } else {
              message = `${message}: ${raw}`;
            }
          } catch {
            message = `${message}: ${raw}`;
          }
        }
        throw new Error(message);
      }
      return (await res.json()) as FireResponse;
    },
    onSuccess: (_, vars) => invalidate(vars.listId),
  });

  const open = useCallback((id: number | null) => setActiveListId(id), []);

  return {
    activeListId,
    open,
    lists,
    detail,
    createList,
    updateMeta,
    deleteList,
    addItems,
    removeItems,
    reorderItems,
    fire,
    invalidate,
  };
}
