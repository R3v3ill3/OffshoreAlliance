/**
 * The Actions hub's route, on its own so both `@/lib/sms/hub-actions`
 * (which builds `?open=` links into the hub) and `@/lib/actions/hub-rows`
 * (which consumes them) can name it without importing each other.
 *
 * This module is the single source of truth: import it from here. It is also
 * re-exported by `@/lib/actions/hub-rows` for callers already importing that
 * module, but `hub-rows` pulls in `@/lib/sms/hub-actions`, so anything that
 * needs only the path (e.g. `@/lib/nav/nav-model`, which must stay pure)
 * should import this file directly.
 */
export const ACTIONS_HUB_PATH = '/actions'
