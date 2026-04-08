import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
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
