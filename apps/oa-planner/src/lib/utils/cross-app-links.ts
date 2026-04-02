/**
 * Utility functions for cross-app navigation between Organising DB and OA Planner
 */

/**
 * Builds a URL with return_to query parameter for cross-app navigation
 *
 * @param baseUrl - The base URL of the destination app
 * @param path - The path within the destination app
 * @param currentPath - The current path to return to (optional)
 * @returns Full URL with return_to parameter if currentPath is provided
 */
export function buildCrossAppUrl(
  baseUrl: string,
  path: string,
  currentPath?: string
): string {
  const url = new URL(path, baseUrl);

  if (currentPath) {
    // Add return_to parameter
    url.searchParams.set('return_to', currentPath);
  }

  return url.toString();
}

/**
 * Builds a URL with query parameters for passing context between apps
 *
 * @param baseUrl - The base URL of the destination app
 * @param path - The path within the destination app
 * @param params - Query parameters to include
 * @returns Full URL with query parameters
 */
export function buildUrlWithContext(
  baseUrl: string,
  path: string,
  params: Record<string, string | number>
): string {
  const url = new URL(path, baseUrl);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

/**
 * Gets the current app's base URL from environment variables
 */
export function getAppUrl(): string {
  if (typeof window === 'undefined') return '';

  return window.location.origin;
}
