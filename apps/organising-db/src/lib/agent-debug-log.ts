/**
 * Posts to the Cursor debug ingest server only when NEXT_PUBLIC_AGENT_DEBUG_INGEST=1.
 * Avoids browser console ERR_CONNECTION_REFUSED when the ingest server is not running.
 */
const ENDPOINT =
  "http://127.0.0.1:7908/ingest/fec0c949-4fbc-4a53-b3b1-04160f544a06";
const SESSION_ID = "019616";

export function agentDebugLog(payload: {
  location: string;
  message: string;
  data?: Record<string, unknown>;
  hypothesisId?: string;
  runId?: string;
}): void {
  if (typeof window === "undefined") return;
  if (process.env.NEXT_PUBLIC_AGENT_DEBUG_INGEST !== "1") return;

  fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": SESSION_ID,
    },
    body: JSON.stringify({
      sessionId: SESSION_ID,
      timestamp: Date.now(),
      ...payload,
    }),
  }).catch(() => {});
}
