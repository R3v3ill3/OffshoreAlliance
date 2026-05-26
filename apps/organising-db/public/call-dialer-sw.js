/* eslint-disable no-restricted-globals */
/*
 * Offshore Alliance Call Dialer service worker.
 *
 * Goals (mirrors W6 of docs/MOBILE_DIALER.md):
 *   1. Cache the dialer shell so the share-link page can load offline.
 *   2. Cache the most recent share bootstrap + active claim contact +
 *      script payload so callers can keep working through brief network
 *      drops.
 *   3. Queue a single attempt locally if the network drops mid-submit
 *      and replay it on reconnect, with deduplication via the
 *      `submission_id` body field.
 *
 * This worker scope is `/call/` — see registration in
 * MobileServiceWorkerBootstrap.
 */

const VERSION = "v1";
const SHELL_CACHE = `oa-dialer-shell-${VERSION}`;
const DATA_CACHE = `oa-dialer-data-${VERSION}`;
const QUEUE_DB = "oa-dialer-queue";
const QUEUE_STORE = "attempts";

const SHELL_ASSETS = [
  "/call-manifest.webmanifest",
  "/call-icon.svg",
  "/call-icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("oa-dialer-") && key !== SHELL_CACHE && key !== DATA_CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

function isShareApiRequest(url) {
  return url.pathname.startsWith("/api/call-share/");
}

function isAttemptPost(request, url) {
  return (
    request.method === "POST" &&
    url.pathname.startsWith("/api/call-share/") &&
    url.pathname.endsWith("/attempt")
  );
}

function isCacheableGet(request, url) {
  if (request.method !== "GET") return false;
  if (!isShareApiRequest(url)) return false;
  return (
    url.pathname.endsWith("/next") || // contact + script bootstrap
    /\/api\/call-share\/[^/]+$/.test(url.pathname) // root bootstrap
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (isAttemptPost(request, url)) {
    event.respondWith(handleAttemptPost(request));
    return;
  }

  if (isCacheableGet(request, url)) {
    event.respondWith(handleDataGet(request));
    return;
  }

  // For navigations under /call/, fall back to cached shell if offline.
  if (request.mode === "navigate" && url.pathname.startsWith("/call/")) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(request);
        return (
          cached ||
          new Response(
            "<h1>Offline</h1><p>The dialer needs a connection to load this contact.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
          )
        );
      }),
    );
  }
});

async function handleDataGet(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DATA_CACHE);
      cache.put(request, networkResponse.clone()).catch(() => undefined);
    }
    return networkResponse;
  } catch (err) {
    const cache = await caches.open(DATA_CACHE);
    const cached = await cache.match(request);
    if (cached) {
      const cloned = cached.clone();
      const headers = new Headers(cloned.headers);
      headers.set("x-oa-from-cache", "1");
      const body = await cloned.text();
      return new Response(body, { status: cloned.status, headers });
    }
    throw err;
  }
}

async function handleAttemptPost(request) {
  const cloned = request.clone();
  try {
    const response = await fetch(request);
    if (response.ok) {
      // On a successful submission, drain any queued attempts since we
      // know we're back online.
      replayQueuedAttempts().catch(() => undefined);
    }
    return response;
  } catch (err) {
    // Network failed — queue the payload and ack to the client.
    try {
      const bodyText = await cloned.text();
      await enqueueAttempt({
        url: request.url,
        headers: serializeHeaders(request.headers),
        body: bodyText,
        ts: Date.now(),
      });
      notifyClients({ type: "attempt_queued" });
      if ("sync" in self.registration) {
        self.registration.sync.register("oa-dialer-replay-attempts").catch(() => undefined);
      }
      return new Response(
        JSON.stringify({ queued_offline: true, queued_at: new Date().toISOString() }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      );
    } catch (queueErr) {
      console.warn("Failed to queue attempt:", queueErr);
      throw err;
    }
  }
}

function serializeHeaders(headers) {
  const out = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(QUEUE_DB, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function enqueueAttempt(entry) {
  const db = await openQueueDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).add(entry);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function readQueuedAttempts() {
  const db = await openQueueDb();
  const items = await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items;
}

async function deleteQueuedAttempt(id) {
  const db = await openQueueDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function replayQueuedAttempts() {
  const items = await readQueuedAttempts();
  if (items.length === 0) return;
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: "POST",
        headers: item.headers,
        body: item.body,
      });
      if (res.ok || res.status === 409 /* duplicate */) {
        await deleteQueuedAttempt(item.id);
        notifyClients({ type: "attempt_synced", id: item.id });
      } else {
        // Stop on first hard failure so we don't burn through bad payloads.
        break;
      }
    } catch (err) {
      console.warn("Replay failed, will retry later:", err);
      break;
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "oa-dialer-replay-attempts") {
    event.waitUntil(replayQueuedAttempts());
  }
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "replay-now") {
    event.waitUntil(replayQueuedAttempts());
  } else if (data.type === "skip-waiting") {
    self.skipWaiting();
  }
});

function notifyClients(payload) {
  self.clients
    .matchAll({ includeUncontrolled: true, type: "window" })
    .then((clients) => {
      clients.forEach((client) => client.postMessage(payload));
    })
    .catch(() => undefined);
}
