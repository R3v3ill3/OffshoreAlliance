import { describe, expect, it } from 'vitest'
import {
  decodeSmsActionRef,
  duplicateName,
  encodeSmsActionRef,
  parseScopeParam,
  scopeOptionsForKind,
  scopeToParam,
  smsActionCampaignHref,
  smsActionHref,
  smsActionStatusGroup,
  smsActionStatusLabel,
  smsCreateHref,
} from '../hub-actions'

describe('action refs', () => {
  it('round-trips campaign-scoped refs', () => {
    const ref = { kind: 'blast', campaignId: 12, id: 34 } as const
    expect(decodeSmsActionRef(encodeSmsActionRef(ref))).toEqual(ref)
  })

  it('round-trips relay refs', () => {
    const ref = { kind: 'relay', id: 7 } as const
    expect(encodeSmsActionRef(ref)).toBe('relay:7')
    expect(decodeSmsActionRef('relay:7')).toEqual(ref)
  })

  it('rejects malformed refs', () => {
    expect(decodeSmsActionRef(null)).toBeNull()
    expect(decodeSmsActionRef('')).toBeNull()
    expect(decodeSmsActionRef('email:1:2')).toBeNull()
    expect(decodeSmsActionRef('blast:1')).toBeNull()
    expect(decodeSmsActionRef('blast:x:2')).toBeNull()
    expect(decodeSmsActionRef('relay:1:2')).toBeNull()
    expect(decodeSmsActionRef('survey:0:2')).toBeNull()
  })
})

describe('scope params', () => {
  it('parses the three scope shapes', () => {
    expect(parseScopeParam('standalone')).toEqual({ type: 'standalone' })
    expect(parseScopeParam('org')).toEqual({ type: 'org' })
    expect(parseScopeParam('42')).toEqual({ type: 'campaign', campaignId: 42 })
  })

  it('treats junk as no scope', () => {
    expect(parseScopeParam(null)).toBeNull()
    expect(parseScopeParam('all')).toBeNull()
    expect(parseScopeParam('-1')).toBeNull()
    expect(parseScopeParam('1.5')).toBeNull()
  })

  it('round-trips through scopeToParam', () => {
    for (const raw of ['standalone', 'org', '9']) {
      expect(scopeToParam(parseScopeParam(raw)!)).toBe(raw)
    }
  })

  it('offers org-wide only to relays and standalone only to the rest', () => {
    expect(scopeOptionsForKind('relay')).toEqual(['org', 'campaign'])
    expect(scopeOptionsForKind('blast')).toEqual(['standalone', 'campaign'])
    expect(scopeOptionsForKind('survey')).toEqual(['standalone', 'campaign'])
  })
})

describe('status groups', () => {
  it('buckets blast statuses', () => {
    expect(smsActionStatusGroup('blast', 'draft')).toBe('pending')
    expect(smsActionStatusGroup('blast', 'paused')).toBe('pending')
    expect(smsActionStatusGroup('blast', 'queued')).toBe('live')
    expect(smsActionStatusGroup('blast', 'sending')).toBe('live')
    expect(smsActionStatusGroup('blast', 'sent')).toBe('finished')
    expect(smsActionStatusGroup('blast', 'cancelled')).toBe('finished')
  })

  it('treats an open chat board as live and a closed one as finished', () => {
    expect(smsActionStatusGroup('chat', 'draft')).toBe('live')
    expect(smsActionStatusGroup('chat', 'sent')).toBe('finished')
    expect(smsActionStatusLabel('chat', 'draft')).toBe('active')
    expect(smsActionStatusLabel('chat', 'cancelled')).toBe('closed')
  })

  it('buckets survey and relay statuses', () => {
    expect(smsActionStatusGroup('survey', 'open')).toBe('live')
    expect(smsActionStatusGroup('survey', 'paused')).toBe('pending')
    expect(smsActionStatusGroup('survey', 'closed')).toBe('finished')
    expect(smsActionStatusGroup('relay', 'active')).toBe('live')
    expect(smsActionStatusGroup('relay', 'paused')).toBe('pending')
    expect(smsActionStatusGroup('relay', 'ended')).toBe('finished')
  })
})

describe('hrefs', () => {
  it('opens blasts, surveys and relays on the hub and chats in their workspace', () => {
    expect(smsActionHref({ kind: 'blast', campaignId: 3, id: 4 })).toBe('/sms?open=blast%3A3%3A4')
    expect(
      smsActionHref({ kind: 'survey', campaignId: 3, id: 4 }, { standalone: true }),
    ).toBe('/sms?open=survey%3A3%3A4&standalone=1')
    expect(smsActionHref({ kind: 'relay', id: 9 })).toBe('/sms?open=relay%3A9')
    expect(smsActionHref({ kind: 'chat', campaignId: 3, id: 4 })).toBe('/campaigns/3/sms/chat/4')
  })

  it('builds the create wizard URL', () => {
    expect(smsCreateHref({})).toBe('/sms/new')
    expect(smsCreateHref({ kind: 'survey', scope: { type: 'standalone' } })).toBe(
      '/sms/new?kind=survey&scope=standalone',
    )
    expect(
      smsCreateHref({
        kind: 'relay',
        scope: { type: 'campaign', campaignId: 5 },
        duplicateFrom: { kind: 'relay', id: 2 },
      }),
    ).toBe('/sms/new?kind=relay&scope=5&duplicate=relay%3A2')
  })

  it('links into the campaign SMS tab', () => {
    expect(smsActionCampaignHref({ kind: 'blast', campaignId: 3, id: 4 }, 3)).toBe(
      '/campaigns/3?tab=outreach&sub=sms&sms_view=blasts&sms_list=4',
    )
    expect(smsActionCampaignHref({ kind: 'relay', id: 4 }, null)).toBeNull()
  })
})

describe('duplicateName', () => {
  it('appends (copy) once', () => {
    expect(duplicateName('EBA reminder')).toBe('EBA reminder (copy)')
    expect(duplicateName('EBA reminder (copy)')).toBe('EBA reminder (copy)')
    expect(duplicateName('  ')).toBe('')
    expect(duplicateName(null)).toBe('')
  })
})
