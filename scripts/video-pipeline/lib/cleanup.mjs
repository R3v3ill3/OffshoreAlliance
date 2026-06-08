// Demo-data cleanup so re-running a clip doesn't pile up duplicate records.
// We don't hardcode Supabase keys: we observe the app's OWN /rest/v1 request to
// capture the anon apikey + the demo user's bearer token, then delete via REST.

/**
 * Watch network for a Supabase REST call and capture its anon apikey + bearer
 * token. Accepts a Page or BrowserContext. The CORS preflight (OPTIONS) carries
 * no custom headers, so we ignore those and wait for a request that has both.
 */
export async function captureSupabaseAuth(target, { timeoutMs = 30000, debug = false } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      target.off("request", onReq);
      reject(new Error("cleanup: no Supabase REST request with auth observed"));
    }, timeoutMs);
    const onReq = (req) => {
      const u = req.url();
      if (!/supabase\.co\/(rest|auth)\/v1\//.test(u)) return;
      const h = req.headers();
      const apikey = h["apikey"] ?? h["Apikey"];
      const authz = h["authorization"] ?? h["Authorization"];
      if (debug) console.log(`   [cap] ${req.method()} ${u.slice(0, 70)} apikey=${!!apikey} auth=${!!authz}`);
      if (apikey && authz && /Bearer /i.test(authz)) {
        clearTimeout(timer);
        target.off("request", onReq);
        resolve({ apikey, authorization: authz, origin: new URL(u).origin });
      }
    };
    target.on("request", onReq);
  });
}

/** DELETE rows where column == value. Best-effort; returns a status summary. */
export async function deleteByName(auth, table, column, value) {
  const url = `${auth.origin}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`;
  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        apikey: auth.apikey,
        Authorization: auth.authorization,
        Prefer: "return=representation",
      },
    });
    const body = await res.text().catch(() => "");
    let count = null;
    try { count = JSON.parse(body).length; } catch {}
    return { ok: res.ok, status: res.status, deleted: count, body: body.slice(0, 160) };
  } catch (e) {
    return { ok: false, status: 0, deleted: null, body: String(e).slice(0, 160) };
  }
}
