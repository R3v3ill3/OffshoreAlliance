/**
 * The Actions hub's route, on its own so both `@/lib/sms/hub-actions`
 * (which builds `?open=` links into the hub) and `@/lib/actions/hub-rows`
 * (which consumes them) can name it without importing each other.
 *
 * Re-exported from `@/lib/actions/hub-rows` — import it from there.
 */
export const ACTIONS_HUB_PATH = '/actions'
