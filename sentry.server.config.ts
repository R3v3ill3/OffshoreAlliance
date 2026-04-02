// This file configures Sentry initialization for the server side
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: process.env.NODE_ENV || 'development',

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  beforeSend(event, hint) {
    const errorMessage = (hint.originalException as Error)?.message ?? '';

    if (errorMessage.includes('AuthApiError') || errorMessage.includes('Invalid login')) {
      return null;
    }

    return event;
  },

  beforeSendTransaction(event) {
    if (event.request?.url?.includes('/health') || event.transaction?.includes('GET /health')) {
      return null;
    }
    return event;
  },

  ignoreErrors: [
    'top.GLOBALS',
    'Non-Error promise rejection captured',
  ],
});
