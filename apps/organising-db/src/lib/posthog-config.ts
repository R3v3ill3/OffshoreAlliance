/**
 * PostHog project key (from Project settings). Supports common env names.
 * Vercel: set at least one of NEXT_PUBLIC_POSTHOG_KEY or NEXT_PUBLIC_POSTHOG_TOKEN.
 */
export function getPostHogKey(): string | undefined {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_TOKEN;
}

export function getPostHogHost(): string | undefined {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST;
}

export function isPostHogEnabled(): boolean {
  return Boolean(getPostHogKey() && getPostHogHost());
}
