# Outlook (Microsoft 365) OAuth — setup guide

This walks you through the one-time Azure portal setup needed to enable the **Save to Outlook drafts** feature in the email composer. Once the Azure app registration exists and the env vars are populated, the in-app "Connect Outlook" button works for every organiser without further admin involvement.

Total time: ~15 minutes. You need an Azure account with permission to create app registrations in the tenant you want to authorise from.

---

## 1. Decide your tenant scope

The app is currently configured to use the `organizations` tenant endpoint, which means **only Microsoft 365 / Office 365 work-or-school accounts** can authorise — personal Outlook.com / Hotmail accounts are excluded. This matches the most common organiser setup (work mailbox) and avoids consent quirks.

If you ever need to allow personal accounts too, change `MICROSOFT_TENANT` from `'organizations'` to `'common'` in `apps/organising-db/src/lib/integrations/microsoft-graph.ts`. No other code changes required.

---

## 2. Create the Azure AD app registration

1. Sign in to <https://portal.azure.com> with an account that has Azure AD admin rights for your tenant.
2. Navigate to **Microsoft Entra ID** (still called "Azure Active Directory" in some places) → **App registrations** → **+ New registration**.
3. Fill in:
   - **Name**: `Offshore Alliance — Email Composer` (or whatever you like; users see this on the consent screen)
   - **Supported account types**: choose **Accounts in any organisational directory (Any Microsoft Entra ID tenant — Multitenant)**. This matches the `organizations` tenant endpoint.
   - **Redirect URI**:
     - Platform: **Web**
     - URL: `https://YOUR-DOMAIN/api/oauth/microsoft/callback` for production.
     - Add a second redirect URI for local dev: `http://localhost:3000/api/oauth/microsoft/callback`.
4. Click **Register**.

You're now on the app's overview page. Copy the **Application (client) ID** — you'll need it as `MICROSOFT_CLIENT_ID`.

---

## 3. Add API permissions

1. In the app's left sidebar, click **API permissions** → **+ Add a permission** → **Microsoft Graph** → **Delegated permissions**.
2. Tick the following:
   - `offline_access` — required so we get a refresh token (without this, the user would have to reconnect every hour).
   - `openid`
   - `profile`
   - `User.Read` — so we can display the connected mailbox in the UI.
   - `Mail.ReadWrite` — required to create drafts in the user's Drafts folder.
3. Click **Add permissions**.

**Note**: we intentionally do **not** request `Mail.Send`. The app only ever creates drafts; the user does the actual send from Outlook. This gives them final control and keeps the consent scope narrow.

4. Some tenants require **admin consent** for these scopes. If yours does and you're the admin, click **Grant admin consent for [tenant]** to pre-approve for everyone in the tenant. Otherwise each user will see the consent prompt the first time they connect, which is fine.

---

## 4. Generate a client secret

1. In the app's left sidebar, click **Certificates & secrets** → **Client secrets** → **+ New client secret**.
2. Description: `OA Email Composer — production` (or similar). Expiry: **24 months** is a reasonable default — Microsoft caps secrets at 24 months and you'll need to rotate before then.
3. Click **Add**.
4. **Copy the secret value IMMEDIATELY** — Azure will never show it again. You'll need it as `MICROSOFT_CLIENT_SECRET`.

Set a calendar reminder ~3 months before expiry to rotate. When it expires, "Save to Outlook" will start failing for all users until you rotate and redeploy.

---

## 5. Generate the token encryption key

Refresh tokens live in the database encrypted at rest. Generate a 32-byte key and store it as `OAUTH_TOKEN_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use a different key per environment (dev vs prod). **Treat this key like a secret** — anyone with it can decrypt every connected mailbox's refresh tokens.

---

## 6. Populate environment variables

Add these to your deployment env (Vercel, Supabase, `.env.local` for dev — wherever you're running):

```env
# Microsoft / Outlook OAuth integration
MICROSOFT_CLIENT_ID=<the Application (client) ID from step 2>
MICROSOFT_CLIENT_SECRET=<the secret value from step 4>
MICROSOFT_REDIRECT_URI=https://YOUR-DOMAIN/api/oauth/microsoft/callback

# AES-256-GCM key for encrypting refresh tokens at rest
OAUTH_TOKEN_ENCRYPTION_KEY=<base64 output from step 5>
```

For local dev, `MICROSOFT_REDIRECT_URI` should be `http://localhost:3000/api/oauth/microsoft/callback` and you should have added that to the Azure app's redirect URIs in step 2.

---

## 7. Run the database migration

The connection metadata table and audit log are created by:

```
supabase/migrations/20260624110000_user_oauth_connections.sql
```

Apply it with your normal Supabase migration flow (`supabase db push`, the dashboard SQL editor, or however your team deploys migrations).

---

## 8. Smoke test

1. Restart the Next.js app so it picks up the new env vars.
2. Open any campaign's email composer → click the **Outlook…** dropdown in the footer → **Connect Outlook**.
3. You should be redirected to `login.microsoftonline.com`. Sign in with a test Microsoft 365 account.
4. Approve the consent screen. You'll be redirected back to the composer with a green "Outlook connected as you@example.org" toast.
5. Write a short test body. In the **Outlook…** dropdown, click **Save personalised drafts**. Wait a few seconds.
6. Open Outlook (web, desktop, or mobile — they all share the same Drafts folder) → check the Drafts folder → confirm one draft per recipient with `{{first_name}}` resolved per worker.
7. Try **Save shared BCC draft** → confirm one new draft with all recipients in BCC.

If anything goes wrong, the `oauth_send_batches` table records every save attempt with errors. Inspect:

```sql
SELECT * FROM oauth_send_batches ORDER BY created_at DESC LIMIT 10;
```

---

## Operational notes

- **Refresh tokens last ~90 days** from last use. Active organisers will never see this; one who connects then doesn't use the feature for 90 days will need to re-connect. The UI auto-handles this — they just see "Outlook not connected" again.
- **Per-mailbox throttling**: Microsoft Graph caps at roughly 10,000 API calls per mailbox per 10 minutes. The composer caps batches at 200 recipients per "Save personalised drafts" call (in `route.ts` — `MAX_BATCH`), so this isn't a realistic concern for organising-scale lists.
- **Disconnecting**: the in-app "Disconnect" only removes the local DB row. To fully revoke the app's access at Microsoft's end, the user must visit <https://myapps.microsoft.com>, find the Offshore Alliance app, and click revoke. We surface this link in the connection card.
- **Per-organiser quotas**: Microsoft's "Mailbox Receiving Limits" apply when the user actually sends from Outlook — typically 10,000 recipients per day for M365 Business / E plans. Save-to-Drafts doesn't count against this; sending does.
- **Rotating the encryption key**: not implemented in v1. If you ever need to rotate `OAUTH_TOKEN_ENCRYPTION_KEY`, write a small script that decrypts every row with the old key, re-encrypts with the new key, and updates the DB. Or just disconnect everyone and let them reconnect.

---

## Troubleshooting

**"OAUTH_TOKEN_ENCRYPTION_KEY env var is not set"** — you skipped step 5. Generate a key and set the env var.

**"Microsoft token exchange failed (401)"** — check that `MICROSOFT_CLIENT_SECRET` matches what's in Azure, and that the secret hasn't expired (Azure portal → app → Certificates & secrets shows expiry).

**"AADSTS50011: The redirect URI ... does not match"** — the URI sent to Microsoft must exactly match one registered in Azure (step 2). Common gotcha: `https://` vs `http://`, trailing slash, or missing the `/api/oauth/microsoft/callback` path.

**"Need admin approval"** — your tenant requires admin consent for `Mail.ReadWrite`. Either click "Grant admin consent" in step 3 (if you're an admin), or have your IT/tenant admin grant it once for everyone.

**"AADSTS70011: The provided value for the input parameter 'scope' is not valid"** — make sure all six permissions in step 3 are added and don't have typos.

**"Drafts created but I can't see them"** — Outlook's Drafts folder syncs across web/desktop/mobile but can take 5–30 seconds. Try refreshing your inbox.
