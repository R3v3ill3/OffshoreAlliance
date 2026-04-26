import posthog from "posthog-js";
import { getPostHogHost, getPostHogKey, isPostHogEnabled } from "@/lib/posthog-config";

if (isPostHogEnabled()) {
  posthog.init(getPostHogKey()!, {
    api_host: getPostHogHost()!,
    capture_pageview: false,
    capture_pageleave: true,
  });
}
