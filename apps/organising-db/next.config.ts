import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Ensure public PostHog vars are embedded in the client bundle when `next build`
// runs under Turborepo (same process.env Vercel injects for the build).
function posthogKeyFromEnv(): string {
  const a = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (a) return a;
  const b = process.env.NEXT_PUBLIC_POSTHOG_TOKEN?.trim();
  if (b) return b;
  const c = process.env.NEXT_PUBLIC_POSTHOG_API_KEY?.trim();
  if (c) return c;
  return "";
}
const posthogPublicKey = posthogKeyFromEnv();
const posthogPublicHost = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ?? "";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_POSTHOG_KEY: posthogPublicKey,
    NEXT_PUBLIC_POSTHOG_HOST: posthogPublicHost,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
      {
        protocol: "https",
        hostname: "australia.chevron.com",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/planner/campaigns/:id/stage/:stageNumber",
        destination: "/campaigns/:id/plan/stage/:stageNumber",
        permanent: true,
      },
      {
        source: "/planner/campaigns/:id/gate/:gateNumber",
        destination: "/campaigns/:id/plan/gate/:gateNumber",
        permanent: true,
      },
      {
        source: "/planner/campaigns/:id",
        destination: "/campaigns/:id/plan",
        permanent: true,
      },
      {
        source: "/planner/campaigns/new",
        destination: "/campaigns/new",
        permanent: true,
      },
      {
        source: "/planner/:path*",
        destination: "/campaigns",
        permanent: false,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
});
