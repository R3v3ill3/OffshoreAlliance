"use client";

import { useMemo } from "react";
import { mergePhoneScriptVariableContext } from "@/lib/comms/template-variables";
import type { CallListItemWithWorker } from "@/types/planner-types";

/**
 * Memoised script-variable context for the active contact. Identical to the
 * inline computation that lived in `CallSessionView` / `CallSessionPage`,
 * extracted so both desktop and mobile share the same merge logic and
 * cache key (worker fields).
 */
export function useScriptVariables(
  baseContext: Record<string, string | undefined>,
  contact: CallListItemWithWorker | null,
): Record<string, string | undefined> {
  return useMemo(() => {
    if (!contact?.worker) return baseContext;
    return mergePhoneScriptVariableContext(baseContext, {
      first_name: contact.worker.first_name ?? undefined,
      last_name: contact.worker.last_name ?? undefined,
      occupation: contact.worker.occupation ?? undefined,
      employer_name: contact.worker.employer_name ?? undefined,
      worksite_name: contact.worker.worksite_name ?? undefined,
      phone: contact.worker.phone ?? undefined,
      email: contact.worker.email ?? undefined,
    });
  }, [baseContext, contact]);
}
