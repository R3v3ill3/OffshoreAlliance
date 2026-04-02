import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withSentryConfig(nextConfig, {
  // Upload source maps for better error stack traces
  // Source map upload is enabled in production for both apps
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  silent: true,
});
