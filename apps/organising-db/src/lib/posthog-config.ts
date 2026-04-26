/**
 * PostHog project key (from Project settings). Supports common env names.
 * Vercel: set one of the PostHog manual-setup names, e.g.
 * NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN (wizard), or KEY / TOKEN / API_KEY.
 */
function firstNonEmpty(...vals: (string | undefined)[]): string | undefined {
  for (const val of vals) {
    const t = val?.trim();
    if (t) return t;
  }
  return undefined;
}

export function getPostHogKey(): string | undefined {
  return firstNonEmpty(
    process.env.NEXT_PUBLIC_POSTHOG_KEY,
    process.env.NEXT_PUBLIC_POSTHOG_TOKEN,
    process.env.NEXT_PUBLIC_POSTHOG_API_KEY,
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  );
}

export function getPostHogHost(): string | undefined {
  const v = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
  return v || undefined;
}

export function isPostHogEnabled(): boolean {
  return Boolean(getPostHogKey() && getPostHogHost());
}
