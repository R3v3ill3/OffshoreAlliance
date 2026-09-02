/**
 * Hidden SMS episode campaigns must not appear in campaign lists,
 * dashboards, or pickers. Apply this to every campaigns query that
 * feeds those surfaces. Single-campaign fetches (detail, SMS tools
 * episode APIs) should not use it.
 *
 * Typed loosely so PostgREST builders are not instantiated recursively
 * (TS2589).
 */
export const SMS_EPISODE_TOOLS_HREF = '/sms?scope=standalone'

export function excludeSmsEpisodes<T>(query: T): T {
  return (query as { eq: (column: string, value: boolean) => T }).eq(
    'is_sms_episode',
    false,
  )
}
