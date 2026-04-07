// This file configures Sentry initialization for client-side error reporting
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
//
// Imported from app Providers (client boundary). Next still evaluates that graph
// during SSR; @sentry/nextjs has no browserTracingIntegration on the server bundle,
// so init must run only in the browser.

import * as Sentry from "@sentry/nextjs";

if (typeof window !== "undefined") {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    environment: process.env.NODE_ENV || "development",

    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

    tracePropagationTargets: [
      "localhost",
      "oa.uconstruct.app",
      "oaplanner.uconstruct.app",
      /^\//,
    ],

    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    beforeSend(event, hint) {
      const errorMessage = (hint.originalException as Error)?.message ?? "";

      if (errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")) {
        event.fingerprint = ["supabase-network-error"];
        event.level = "warning";
        event.tags = { ...event.tags, error_category: "network" };
        return event;
      }

      return event;
    },

    ignoreErrors: ["top.GLOBALS", "Non-Error promise rejection captured"],

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
}
