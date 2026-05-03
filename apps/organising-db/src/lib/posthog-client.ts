import posthog from "posthog-js";
import { getPostHogHost, getPostHogKey, isPostHogEnabled } from "@/lib/posthog-config";

let clientInitialized = false;

/** Call from client components. Safe to call multiple times. */
export function initPostHogIfNeeded(): void {
  if (typeof window === "undefined" || !isPostHogEnabled() || clientInitialized) {
    return;
  }
  posthog.init(getPostHogKey()!, {
    api_host: getPostHogHost()!,
    capture_pageview: false,
    capture_pageleave: true,
    disable_session_recording: true,
  });
  clientInitialized = true;
}
