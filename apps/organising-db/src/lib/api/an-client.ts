import { ActionNetworkClient } from "./action-network";

/**
 * Single place that resolves the Action Network API key. The key lives in
 * the deployment environment (Vercel env vars) by design — it is not
 * user-configurable in the app.
 *
 * Returns null when the key is missing or still the placeholder, so routes
 * can return a consistent "not configured" error.
 */
export function getAnClient(): ActionNetworkClient | null {
  const apiKey = process.env.ACTION_NETWORK_API_KEY;
  if (!apiKey || apiKey === "your-action-network-key-here") {
    return null;
  }
  return new ActionNetworkClient({ apiKey });
}

export const AN_NOT_CONFIGURED_ERROR =
  "Action Network API key not configured. Set ACTION_NETWORK_API_KEY in the deployment environment.";
