import { describe, expect, it } from 'vitest'
import { isNavItemActive } from '../active-nav'
import { isNavRowActive } from '../nav-model'

// WP1.2 added `/actions` and `/my-campaigns`; `/sms` stays in the list as the
// Actions row's alias so `/sms/new` and `/sms/numbers` still light something.
const hrefs = ['/actions', '/sms', '/sms/inbox', '/campaigns', '/my-campaigns', '/reports']

describe('isNavItemActive', () => {
  it('matches exact and nested paths', () => {
    expect(isNavItemActive('/campaigns', '/campaigns', hrefs)).toBe(true)
    expect(isNavItemActive('/campaigns/12', '/campaigns', hrefs)).toBe(true)
    expect(isNavItemActive('/campaigns-old', '/campaigns', hrefs)).toBe(false)
  })

  it('gives a nested path to the most specific item only', () => {
    expect(isNavItemActive('/sms/inbox', '/sms/inbox', hrefs)).toBe(true)
    expect(isNavItemActive('/sms/inbox', '/sms', hrefs)).toBe(false)
    expect(isNavItemActive('/sms', '/sms', hrefs)).toBe(true)
    expect(isNavItemActive('/sms/numbers', '/sms', hrefs)).toBe(true)
    expect(isNavItemActive('/sms/numbers', '/sms/inbox', hrefs)).toBe(false)
  })

  it('keeps /campaigns and /my-campaigns apart', () => {
    expect(isNavItemActive('/campaigns/12', '/my-campaigns', hrefs)).toBe(false)
    expect(isNavItemActive('/my-campaigns', '/campaigns', hrefs)).toBe(false)
    expect(isNavItemActive('/my-campaigns', '/my-campaigns', hrefs)).toBe(true)
  })

  it('is false for a null pathname', () => {
    expect(isNavItemActive(null, '/sms', hrefs)).toBe(false)
  })
})

describe('isNavRowActive', () => {
  const actions = { href: '/actions', activeHrefs: ['/sms'] }
  const smsInbox = { href: '/sms/inbox' }

  it('lights the Actions row on its own route', () => {
    expect(isNavRowActive('/actions', actions, hrefs)).toBe(true)
  })

  it('lights the Actions row on the SMS pages WP1.5 left in place', () => {
    expect(isNavRowActive('/sms/new', actions, hrefs)).toBe(true)
    expect(isNavRowActive('/sms/numbers', actions, hrefs)).toBe(true)
    expect(isNavRowActive('/sms', actions, hrefs)).toBe(true)
  })

  it('still gives /sms/inbox to the SMS Inbox row alone', () => {
    expect(isNavRowActive('/sms/inbox', smsInbox, hrefs)).toBe(true)
    expect(isNavRowActive('/sms/inbox', actions, hrefs)).toBe(false)
  })

  it('does not light Actions elsewhere', () => {
    expect(isNavRowActive('/campaigns', actions, hrefs)).toBe(false)
    expect(isNavRowActive(null, actions, hrefs)).toBe(false)
  })
})
