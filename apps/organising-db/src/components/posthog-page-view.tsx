"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import posthog from "posthog-js";
import { isPostHogEnabled } from "@/lib/posthog-config";
import { initPostHogIfNeeded } from "@/lib/posthog-client";

/**
 * Initializes PostHog in the client (so we are not dependent on
 * `instrumentation-client` running in every deployment).
 * Sends a $pageview on App Router client navigations; first paint is included.
 */
export function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isPostHogEnabled()) return;
    initPostHogIfNeeded();
    const url = `${window.location.origin}${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}
