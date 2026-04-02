import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withSentryConfig(nextConfig, {
  // Upload source maps for better error stack traces
  // Source map upload is enabled in production for both apps
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Hide source maps from client side in production
  silent: true,

  // Tunnel all client-side requests through Vercel to avoid ad-blockers
  tunnelClientOptions: {
    tunnel: true,
  },

  // Collect subcomponents of errors for better context
  widenClient: false,

  // Disable automatic performance monitoring for now
  // Can be enabled later if needed
  disableClientRequests: false,
});
