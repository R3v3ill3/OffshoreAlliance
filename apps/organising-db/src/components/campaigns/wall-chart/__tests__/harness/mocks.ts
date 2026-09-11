/**
 * WP2.3 Stage 0 — the module boundary the tests replace, and the spies they
 * assert on.
 *
 * Only the five edges that leave the wall chart are faked: routing, Supabase,
 * `fetchApi`, auth identity, the worker-detail sheet, the move/copy mutation,
 * and toasts. Everything inside those edges — the hooks, the metrics, the
 * tiles, the cards, the dialogs, `useFirstUseHint`, `posthog-js` — runs for
 * real, which is the whole point: the characterisation has to fail if the
 * decomposition changes behaviour, and it cannot do that through a stub.
 *
 * The `vi.mock` declarations themselves live in the test files (they are
 * hoisted per-file); this module only supplies the implementations and spies.
 */

import { vi } from "vitest";

import { currentSearchParams, fakeFetchApi, fakeFrom } from "./backend";
import type { MoveWorkerVars } from "../../move-worker-mutation";

export type MoveWorkerResultLike = { inserted: number; deleted: number; skipped: number };

export type MoveWorkerCallOptions = {
  onSuccess?: (result: MoveWorkerResultLike) => void;
  onError?: (error: unknown) => void;
};

export const spies = {
  replace: vi.fn<(href: string, options?: { scroll?: boolean }) => void>(),
  push: vi.fn<(href: string, options?: { scroll?: boolean }) => void>(),
  refresh: vi.fn<() => void>(),
  openWorkerDetail: vi.fn<(workerId: number, options?: unknown) => void>(),
  moveWorkers: vi.fn<(vars: MoveWorkerVars, options?: MoveWorkerCallOptions) => void>(),
  toastError: vi.fn<(message: string) => void>(),
  toastSuccess: vi.fn<(message: string) => void>(),
  toastInfo: vi.fn<(message: string) => void>(),
  toastWarning: vi.fn<(message: string) => void>(),
};

/** The default outcome of a move/copy: it succeeds and reports one row moved. */
export function moveWorkersSucceeds(): void {
  spies.moveWorkers.mockImplementation((_vars, options) => {
    options?.onSuccess?.({ inserted: 1, deleted: 1, skipped: 0 });
  });
}

export function moveWorkersFailsWith(message: string): void {
  spies.moveWorkers.mockImplementation((_vars, options) => {
    options?.onError?.(new Error(message));
  });
}

export function resetSpies(): void {
  for (const spy of Object.values(spies)) spy.mockReset();
  moveWorkersSucceeds();
}

export function navigationMock() {
  return {
    useRouter: () => ({
      replace: spies.replace,
      push: spies.push,
      refresh: spies.refresh,
      back: () => {},
      forward: () => {},
      prefetch: () => {},
    }),
    usePathname: () => "/campaigns/1",
    useSearchParams: () => currentSearchParams(),
    useParams: () => ({ id: "1" }),
    redirect: () => {
      throw new Error("redirect() called in a wall-chart test");
    },
    notFound: () => {
      throw new Error("notFound() called in a wall-chart test");
    },
  };
}

export function supabaseClientMock() {
  return {
    createClient: () => ({ from: fakeFrom }),
  };
}

export function fetchApiMock() {
  return { fetchApi: fakeFetchApi };
}

export function authContextMock() {
  return {
    useAuth: () => ({
      user: { id: "test-user", email: "organiser@example.test" },
      profile: { user_id: "test-user", role: "user" },
      role: "user",
      loading: false,
      profileLoading: false,
      signOut: async () => {},
      hardRefreshConnection: async () => ({
        ok: true,
        message: "",
        reasonCode: "ok",
        redirectedToLogin: false,
      }),
      connectionRecoveryInProgress: false,
      isAdmin: false,
      isUser: true,
    }),
  };
}

export function workerDetailProviderMock() {
  return {
    useCampaignWorkerDetail: () => ({ openWorkerDetail: spies.openWorkerDetail }),
  };
}

/**
 * The product calls `mutate(variables, { onSuccess, onError })` — not
 * `mutateAsync` — so the fake has to honour the per-call callbacks or the
 * selection-clearing and error-toast paths never run.
 */
export function moveWorkerMutationMock() {
  return {
    useMoveWorkersMutation: () => ({
      mutate: spies.moveWorkers,
      mutateAsync: async (vars: MoveWorkerVars) => {
        spies.moveWorkers(vars);
        return { inserted: 0, deleted: 0, skipped: 0 };
      },
      isPending: false,
      isError: false,
      isSuccess: false,
      status: "idle" as const,
      reset: () => {},
      data: undefined,
      error: null,
      variables: undefined,
    }),
  };
}

/**
 * `sonner` renders into its own `<Toaster/>`, which the chart does not mount,
 * so a real toast leaves no observable trace. Spying is the only way to assert
 * the exact failure message the drop handler surfaces.
 */
export function sonnerMock() {
  const toast = Object.assign(spies.toastInfo, {
    error: spies.toastError,
    success: spies.toastSuccess,
    info: spies.toastInfo,
    warning: spies.toastWarning,
    message: spies.toastInfo,
    loading: spies.toastInfo,
    dismiss: () => {},
    custom: () => {},
    promise: () => {},
  });
  return { toast, Toaster: () => null };
}
