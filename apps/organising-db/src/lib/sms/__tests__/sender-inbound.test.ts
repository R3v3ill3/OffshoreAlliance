import { describe, expect, it } from 'vitest'
import {
  classifyProviderSenderType,
  HANDSET_SENDER_MESSAGE,
  inboundCheckForPhone,
  inboundUnsafeClientMessage,
  matchProviderSender,
  NOT_DEDICATED_SENDER_MESSAGE,
  ONE_WAY_SENDER_MESSAGE,
  senderMatchKey,
  SENDER_TYPE_UNVERIFIED_MESSAGE,
} from '../sender-inbound'
import { parseListSendersResponse } from '../provider/mobile-message-provider'

describe('senderMatchKey', () => {
  it('normalises OA E.164 and MM digit forms to the same key', () => {
    expect(senderMatchKey('+61412345678')).toBe('61412345678')
    expect(senderMatchKey('61412345678')).toBe('61412345678')
    expect(senderMatchKey('0412345678')).toBe('61412345678')
  })
})

describe('classifyProviderSenderType', () => {
  it('treats MM type "own" as a handset', () => {
    expect(classifyProviderSenderType('own', '61412345678')).toBe('handset')
    expect(classifyProviderSenderType('own_mobile', '61412345678')).toBe(
      'handset',
    )
  })

  it('treats dedicated and shared numbers as inbound-capable', () => {
    expect(classifyProviderSenderType('dedicated_number', '+61400000001')).toBe(
      'inbound',
    )
    expect(classifyProviderSenderType('dedicated', '61400000001')).toBe(
      'inbound',
    )
    expect(classifyProviderSenderType('shared', '61400000001')).toBe('inbound')
  })

  it('treats alphanumeric sender IDs as one-way', () => {
    expect(classifyProviderSenderType('alpha', 'CompanyABC')).toBe('one_way')
    expect(classifyProviderSenderType(undefined, 'OA')).toBe('one_way')
  })

  it('treats a numeric sender with no type as inbound', () => {
    expect(classifyProviderSenderType(undefined, '61412345678')).toBe('inbound')
  })
})

describe('inboundCheckForPhone', () => {
  const catalogue = [
    { sender: '61400000001', type: 'dedicated_number' },
    { sender: '61412345678', type: 'own' },
    { sender: 'CompanyABC', type: 'alpha' },
  ]

  it('allows a dedicated MM number in E.164 form', () => {
    expect(inboundCheckForPhone('+61400000001', catalogue)).toBeNull()
  })

  it('rejects an organiser handset', () => {
    expect(inboundCheckForPhone('+61412345678', catalogue)).toBe(
      HANDSET_SENDER_MESSAGE,
    )
  })

  it('rejects a number that is not in the MM catalogue', () => {
    expect(inboundCheckForPhone('+61499999999', catalogue)).toBe(
      NOT_DEDICATED_SENDER_MESSAGE,
    )
  })

  it('does not treat an empty catalogue as every number being a handset', () => {
    expect(inboundCheckForPhone('+61400000001', [])).toBe(
      SENDER_TYPE_UNVERIFIED_MESSAGE,
    )
  })

  it('matches MM senders that omit the plus', () => {
    expect(matchProviderSender('+61412345678', catalogue)?.type).toBe('own')
  })
})

describe('inboundUnsafeClientMessage', () => {
  it('is silent unless supports_inbound is false', () => {
    expect(
      inboundUnsafeClientMessage({ supports_inbound: true, provider_type: 'own' }),
    ).toBeNull()
    expect(
      inboundUnsafeClientMessage({ supports_inbound: null, provider_type: 'own' }),
    ).toBeNull()
  })

  it('uses handset copy for type own', () => {
    expect(
      inboundUnsafeClientMessage({
        supports_inbound: false,
        provider_type: 'own',
        phone_e164: '+61412345678',
      }),
    ).toBe(HANDSET_SENDER_MESSAGE)
  })

  it('uses one-way copy for alpha sender IDs', () => {
    expect(
      inboundUnsafeClientMessage({
        supports_inbound: false,
        provider_type: 'alpha',
        phone_e164: 'OA',
      }),
    ).toBe(ONE_WAY_SENDER_MESSAGE)
  })
})

describe('parseListSendersResponse', () => {
  it('reads the documented MM `results` array', () => {
    const senders = parseListSendersResponse({
      results: [
        { sender: 'CompanyABC', type: 'alpha' },
        { sender: '61412345678', type: 'own' },
      ],
    })
    expect(senders).toEqual([
      { sender: 'CompanyABC', type: 'alpha', status: undefined },
      { sender: '61412345678', type: 'own', status: undefined },
    ])
  })

  it('falls back to a `senders` array', () => {
    const senders = parseListSendersResponse({
      senders: [{ number: '+61400000001', type: 'dedicated_number' }],
    })
    expect(senders[0]?.sender).toBe('+61400000001')
  })
})
