import { describe, expect, it } from 'vitest'
import { isNavItemActive } from '../active-nav'

const hrefs = ['/campaigns', '/sms', '/sms/inbox', '/reports']

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

  it('is false for a null pathname', () => {
    expect(isNavItemActive(null, '/sms', hrefs)).toBe(false)
  })
})
