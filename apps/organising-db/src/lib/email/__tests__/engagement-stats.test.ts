import { describe, expect, it } from 'vitest'

import {
  engagementRates,
  formatEmailHubResults,
  formatRatePct,
  ratePct,
  withEngagementRates,
} from '@/lib/email/engagement-stats'

describe('ratePct', () => {
  it('returns one decimal', () => {
    expect(ratePct(1, 3)).toBe(33.3)
  })

  it('returns an integer when the fraction is exact', () => {
    expect(ratePct(1, 2)).toBe(50)
  })

  it('is null when there is no denominator', () => {
    expect(ratePct(4, 0)).toBeNull()
    expect(ratePct(4, -1)).toBeNull()
  })
})

describe('engagementRates', () => {
  it('uses sends for delivery/bounce and delivered for the rest', () => {
    expect(
      engagementRates({
        total: 200,
        delivered: 180,
        opened: 90,
        clicked: 18,
        bounced: 10,
        unsubscribed: 2,
        replied: 9,
      }),
    ).toEqual({
      delivery_rate_pct: 90,
      open_rate_pct: 50,
      click_rate_pct: 10,
      bounce_rate_pct: 5,
      unsubscribe_rate_pct: 1.1,
      reply_rate_pct: 5,
    })
  })

  it('leaves open/click null when nothing has delivered', () => {
    const rates = engagementRates({
      total: 40,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 4,
      unsubscribed: 0,
      replied: 0,
    })
    expect(rates.delivery_rate_pct).toBe(0)
    expect(rates.bounce_rate_pct).toBe(10)
    expect(rates.open_rate_pct).toBeNull()
    expect(rates.click_rate_pct).toBeNull()
  })
})

describe('withEngagementRates', () => {
  it('spreads counts and rates together', () => {
    const stats = withEngagementRates({
      total: 10,
      delivered: 10,
      opened: 5,
      clicked: 1,
      bounced: 0,
      unsubscribed: 0,
      replied: 0,
    })
    expect(stats.opened).toBe(5)
    expect(stats.open_rate_pct).toBe(50)
  })
})

describe('formatRatePct', () => {
  it('uses an em-dash for a missing rate', () => {
    expect(formatRatePct(null)).toBe('—')
  })

  it('drops a trailing .0', () => {
    expect(formatRatePct(50)).toBe('50%')
    expect(formatRatePct(33.3)).toBe('33.3%')
  })
})

describe('formatEmailHubResults', () => {
  it('labels an unsent draft', () => {
    expect(
      formatEmailHubResults({
        source: 'draft',
        total_items: 0,
        delivered_items: 0,
        failed_items: 0,
      }),
    ).toBe('Not sent yet')
  })

  it('keeps the legacy delivered/failed line when engagement is absent', () => {
    expect(
      formatEmailHubResults({
        source: 'list',
        total_items: 300,
        delivered_items: 288,
        failed_items: 12,
      }),
    ).toBe('288/300 delivered · 12 failed')
  })

  it('appends open and click rates when the payload has them', () => {
    expect(
      formatEmailHubResults({
        source: 'list',
        total_items: 300,
        delivered_items: 200,
        failed_items: 0,
        opened_items: 80,
        clicked_items: 20,
      }),
    ).toBe('200/300 delivered · 40% opened · 10% clicked')
  })

  it('shows an em-dash when delivered is still 0', () => {
    expect(
      formatEmailHubResults({
        source: 'list',
        total_items: 300,
        delivered_items: 0,
        failed_items: 0,
        opened_items: 0,
        clicked_items: 0,
      }),
    ).toBe('0/300 delivered · — opened · — clicked')
  })
})
