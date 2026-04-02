// This file configures Sentry initialization for the Vercel platform
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Environment
  environment: process.env.NODE_ENV || 'development',

  // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
  // We recommend adjusting this value in production.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  // Session replay
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Filter out expected errors
  beforeSend(event, hint) => {
    // Ignore errors from unauthenticated users (expected in auth flows)
    if (event.tags?.category === 'auth') {
      const errorMessage = hint.originalException?.message || '';
      // Ignore auth-related errors that are expected
      if (errorMessage.includes('AuthApiError') || errorMessage.includes('Invalid login')) {
        return null;
      }
    }

    // Ignore errors in development if needed
    if (process.env.NODE_ENV === 'development') {
      // You can uncomment to disable Sentry in dev
      // return null;
    }

    return event;
  },

  // Ignore specific error types
  ignoreErrors: [
    // Random browser/extensions errors
    'top.GLOBALS',
    'OriginalEvent.getComputedStyle',
    'Non-Error promise rejection captured',
    // Add more as needed
  ],

  // Before send transaction, add useful context
  beforeSendTransaction(event) {
    // Filter out transactions for health checks or monitoring endpoints
    if (event.request?.url?.includes('/health') || event.transaction?.includes('GET /health')) {
      return null;
    }
    return event;
  },

  // Attach user information when available
  integrations: [
    new Sentry.BrowserTracing({
      // Set to traceSampleRate to capture 100% of transactions for performance monitoring.
      // We recommend adjusting this value in production.
      tracePropagationTargets: ["localhost", "oa.uconstruct.app", "oaplanner.uconstruct.app", /^\//],
    }),
    new Sentry.Replay({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});
