// This file configures Sentry initialization for client-side error reporting
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Environment
  environment: process.env.NODE_ENV || 'development',

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Filter out expected errors
  beforeSend(event, hint) => {
    // Ignore client-side errors from expected sources
    const errorMessage = hint.originalException?.message || '';

    // Ignore network errors from failed fetch requests (can be noisy)
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      // You may want to track these differently or ignore them
      // event.level = 'warning'; // Downgrade to warning instead of ignoring
    }

    return event;
  },

  ignoreErrors: [
    // Random browser/extensions errors
    'top.GLOBALS',
    'OriginalEvent.getComputedStyle',
    'Non-Error promise rejection captured',
    // Add more as needed
  ],

  integrations: [
    new Sentry.BrowserTracing({
      // Set to traceSampleRate to capture 100% of transactions for performance monitoring.
      tracePropagationTargets: ["localhost", "oa.uconstruct.app", "oaplanner.uconstruct.app", /^\//],
    }),
    new Sentry.Replay({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});
