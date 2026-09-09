import { describe, expect, it } from 'vitest'

import {
  ACTIONS_HUB_PATH,
  bucketFor,
  countBy,
  countUnknownOwnerRows,
  filterHubRows,
  mergeHubRows,
  pendingModerationTotal,
  scopeFor,
  scopeLabelFor,
  shapeCallListRow,
  shapeEmailRow,
  shapeSmsRow,
  sortHubRows,
  statusLabelFor,
  type CallActivityRow,
  type EmailActivityRow,
  type HubActionRow,
} from '@/lib/actions/hub-rows'
import { smsActionStatusGroup, SMS_ACTION_KINDS } from '@/lib/sms/hub-actions'
import type { SmsActivityResponse, SmsActivityRow } from '@/app/api/sms/activity/route'

const CTX = { currentUserId: 'me' }

/** The status sets enumerated by each table's CHECK constraint. */
const SMS_STATUSES: Record<string, string[]> = {
  blast: ['draft', 'queued', 'sending', 'sent', 'paused', 'cancelled'],
  chat: ['draft', 'queued', 'sending', 'sent', 'paused', 'cancelled'],
  survey: ['draft', 'open', 'paused', 'closed'],
  relay: ['active', 'paused', 'ended'],
}

function smsRow(over: Partial<SmsActivityRow> = {}): SmsActivityRow {
  return {
    id: 1,
    kind: 'blast',
    name: 'Night shift text',
    status: 'sent',
    campaign_id: 7,
    campaign_name: 'Ausco 2026',
    scope: 'campaign',
    is_standalone: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    created_by: 'me',
    sender_number_id: null,
    sender_phone: null,
    sender_label: null,
    audience_count: 240,
    progress_count: 212,
    ...over,
  }
}

function emailRow(over: Partial<EmailActivityRow> = {}): EmailActivityRow {
  return {
    source: 'list',
    id: 11,
    campaign_id: 7,
    draft_id: 55,
    name: 'Pay offer update',
    status: 'queued',
    total_items: 300,
    delivered_items: 0,
    failed_items: 0,
    created_by: 'me',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-03T00:00:00Z',
    campaign: { name: 'Ausco 2026', is_sms_episode: false, is_standing: false },
    ...over,
  }
}

function callRow(over: Partial<CallActivityRow> = {}): CallActivityRow {
  return {
    id: 88,
    campaign_id: 7,
    name: 'Swing shift ring-round',
    status: 'active',
    total_items: 40,
    completed_items: 18,
    created_by: 'me',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-04T00:00:00Z',
    campaign: { name: 'Ausco 2026', is_sms_episode: false, is_standing: false },
    ...over,
  }
}

// ── 1. bucketFor over every enumerated status ────────────────────
describe('bucketFor', () => {
  it('buckets every sms_lists status for a blast', () => {
    expect(bucketFor('sms_blast', 'queued')).toBe('live')
    expect(bucketFor('sms_blast', 'sending')).toBe('live')
    expect(bucketFor('sms_blast', 'draft')).toBe('drafts_paused')
    expect(bucketFor('sms_blast', 'paused')).toBe('drafts_paused')
    expect(bucketFor('sms_blast', 'sent')).toBe('finished')
    expect(bucketFor('sms_blast', 'cancelled')).toBe('finished')
  })

  it('treats an open chat board as live, not a draft', () => {
    expect(bucketFor('sms_chat', 'draft')).toBe('live')
    expect(bucketFor('sms_chat', 'sent')).toBe('finished')
    expect(bucketFor('sms_chat', 'cancelled')).toBe('finished')
  })

  it('buckets every sms_surveys status', () => {
    expect(bucketFor('sms_survey', 'open')).toBe('live')
    expect(bucketFor('sms_survey', 'draft')).toBe('drafts_paused')
    expect(bucketFor('sms_survey', 'paused')).toBe('drafts_paused')
    expect(bucketFor('sms_survey', 'closed')).toBe('finished')
  })

  it('buckets every sms_relays status', () => {
    expect(bucketFor('sms_relay', 'active')).toBe('live')
    expect(bucketFor('sms_relay', 'paused')).toBe('drafts_paused')
    expect(bucketFor('sms_relay', 'ended')).toBe('finished')
  })

  it('buckets every email_lists status', () => {
    expect(bucketFor('email_send', 'active')).toBe('live')
    expect(bucketFor('email_send', 'queued')).toBe('live')
    expect(bucketFor('email_send', 'sending')).toBe('live')
    expect(bucketFor('email_send', 'draft')).toBe('drafts_paused')
    expect(bucketFor('email_send', 'paused')).toBe('drafts_paused')
    expect(bucketFor('email_send', 'sent')).toBe('finished')
    expect(bucketFor('email_send', 'completed')).toBe('finished')
    expect(bucketFor('email_send', 'cancelled')).toBe('finished')
  })

  it('buckets every campaign_comms_drafts status', () => {
    expect(bucketFor('email_send', 'generating')).toBe('drafts_paused')
    expect(bucketFor('email_send', 'draft')).toBe('drafts_paused')
    expect(bucketFor('email_send', 'approved')).toBe('drafts_paused')
    expect(bucketFor('email_send', 'sent')).toBe('finished')
    expect(bucketFor('email_send', 'failed')).toBe('finished')
  })

  it('buckets every call_lists status', () => {
    expect(bucketFor('call_list', 'active')).toBe('live')
    expect(bucketFor('call_list', 'draft')).toBe('drafts_paused')
    expect(bucketFor('call_list', 'paused')).toBe('drafts_paused')
    expect(bucketFor('call_list', 'completed')).toBe('finished')
  })

  it('short-circuits to archived when archived_at is set', () => {
    expect(bucketFor('sms_blast', 'queued', '2026-01-01T00:00:00Z')).toBe('archived')
    expect(bucketFor('sms_chat', 'draft', '2026-01-01T00:00:00Z')).toBe('archived')
    expect(bucketFor('sms_survey', 'open', '2026-01-01T00:00:00Z')).toBe('archived')
    expect(bucketFor('sms_relay', 'active', '2026-01-01T00:00:00Z')).toBe('archived')
  })

  it('falls to finished on an unknown status rather than throwing', () => {
    expect(bucketFor('email_send', 'no_such_status')).toBe('finished')
    expect(bucketFor('call_list', 'no_such_status')).toBe('finished')
    expect(bucketFor('sms_blast', 'no_such_status')).toBe('finished')
  })
})

// ── 2. SMS parity: exactly one definition of SMS bucketing ───────
describe('bucketFor SMS parity with smsActionStatusGroup', () => {
  it('agrees for every SMS kind × every status, archived or not', () => {
    for (const kind of SMS_ACTION_KINDS) {
      const hubKind = `sms_${kind}` as const
      for (const status of SMS_STATUSES[kind]) {
        for (const archivedAt of [null, '2026-01-01T00:00:00Z']) {
          const group = smsActionStatusGroup(kind, status, archivedAt)
          const expected = group === 'pending' ? 'drafts_paused' : group
          expect(
            bucketFor(hubKind, status, archivedAt),
            `${hubKind} / ${status} / archived=${String(archivedAt)}`,
          ).toBe(expected)
        }
      }
    }
  })

  it('keeps the SMS status labels identical', () => {
    expect(statusLabelFor('sms_chat', 'draft')).toBe('active')
    expect(statusLabelFor('sms_chat', 'sent')).toBe('closed')
    expect(statusLabelFor('sms_blast', 'sent')).toBe('sent')
    expect(statusLabelFor('sms_blast', 'sent', '2026-01-01T00:00:00Z')).toBe('archived')
    expect(statusLabelFor('email_send', 'queued')).toBe('queued')
    expect(statusLabelFor('call_list', 'active')).toBe('active')
  })
})

// ── 3. shapeEmailRow ─────────────────────────────────────────────
describe('shapeEmailRow', () => {
  it('shapes a queued list', () => {
    const row = shapeEmailRow(emailRow(), CTX)
    expect(row.kind).toBe('email_send')
    expect(row.bucket).toBe('live')
    expect(row.scope).toEqual({ kind: 'campaign', campaignId: 7, name: 'Ausco 2026' })
    expect(row.results).toBe('0/300 delivered')
    expect(row.href).toBe('/campaigns/7/email/wizard?draft_id=55')
    expect(row.campaignHref).toBe('/campaigns/7/email/wizard?draft_id=55')
  })

  it('shapes a paused list', () => {
    expect(shapeEmailRow(emailRow({ status: 'paused' }), CTX).bucket).toBe('drafts_paused')
  })

  it('names failures on a sent list', () => {
    const row = shapeEmailRow(
      emailRow({ status: 'sent', delivered_items: 288, failed_items: 12 }),
      CTX,
    )
    expect(row.bucket).toBe('finished')
    expect(row.results).toBe('288/300 delivered · 12 failed')
  })

  it('keeps an email on the standing campaign campaign-scoped', () => {
    // Email has no standing convention; only SMS episodes and the
    // phone container use those flags. If email ever lands there it
    // must still show the campaign, not "Standalone" by accident.
    const row = shapeEmailRow(
      emailRow({
        campaign: { name: 'OA Membership Outreach', is_sms_episode: false, is_standing: false },
      }),
      CTX,
    )
    expect(row.scope).toEqual({
      kind: 'campaign',
      campaignId: 7,
      name: 'OA Membership Outreach',
    })
  })

  it('shapes a draft that owns no list', () => {
    const row = shapeEmailRow(
      emailRow({ source: 'draft', id: 55, draft_id: 55, status: 'draft', total_items: 0 }),
      CTX,
    )
    expect(row.bucket).toBe('drafts_paused')
    expect(row.results).toBe('Not sent yet')
    expect(row.key).toBe('email_send:draft:55')
  })

  it('links a list with no draft to the campaign Comms sub-tab', () => {
    const row = shapeEmailRow(emailRow({ draft_id: null }), CTX)
    expect(row.href).toBe('/campaigns/7?tab=outreach&sub=comms')
  })

  it('keeps list and draft keys apart even on the same id', () => {
    const list = shapeEmailRow(emailRow({ id: 5 }), CTX)
    const draft = shapeEmailRow(emailRow({ source: 'draft', id: 5 }), CTX)
    expect(list.key).not.toBe(draft.key)
  })
})

// ── 4. shapeCallListRow ──────────────────────────────────────────
describe('shapeCallListRow', () => {
  it('shows the campaign name for an ordinary campaign', () => {
    const row = shapeCallListRow(callRow(), CTX)
    expect(row.scope).toEqual({ kind: 'campaign', campaignId: 7, name: 'Ausco 2026' })
    expect(row.bucket).toBe('live')
    expect(row.results).toBe('18/40 called')
    expect(row.href).toBe('/campaigns/7/phone/lists/88')
    expect(row.key).toBe('call_list:88')
  })

  it('never prints the shared non-campaign container by name', () => {
    const row = shapeCallListRow(
      callRow({
        campaign: { name: 'OA Membership Outreach', is_sms_episode: false, is_standing: true },
      }),
      CTX,
    )
    expect(row.scope).toEqual({ kind: 'standalone' })
    expect(scopeLabelFor(row.scope)).toBe('Standalone')
    expect(row.campaignHref).toBeNull()
  })
})

// ── 5. shapeSmsRow ───────────────────────────────────────────────
describe('shapeSmsRow', () => {
  it('shows a hidden episode campaign as Standalone', () => {
    const row = shapeSmsRow(
      smsRow({ scope: 'standalone', is_standalone: true, campaign_name: null, campaign_id: 99 }),
      CTX,
    )
    expect(row.scope).toEqual({ kind: 'standalone' })
    expect(row.campaignHref).toBeNull()
  })

  it('shows a relay with no campaign as Standalone, not "Org-wide"', () => {
    const row = shapeSmsRow(
      smsRow({ kind: 'relay', scope: 'org', campaign_id: null, campaign_name: null, status: 'active' }),
      CTX,
    )
    expect(row.scope).toEqual({ kind: 'standalone' })
    expect(scopeLabelFor(row.scope)).toBe('Standalone')
  })

  it('shows a real campaign by name', () => {
    const row = shapeSmsRow(smsRow(), CTX)
    expect(row.scope).toEqual({ kind: 'campaign', campaignId: 7, name: 'Ausco 2026' })
    expect(row.results).toBe('212/240 messaged')
    expect(row.href).toBe(`${ACTIONS_HUB_PATH}?open=blast%3A7%3A1`)
  })

  it('keeps the survey question-count prefix', () => {
    const row = shapeSmsRow(
      smsRow({
        kind: 'survey',
        status: 'open',
        question_count: 3,
        audience_count: 50,
        progress_count: 12,
      }),
      CTX,
    )
    expect(row.results).toBe('3q · 12/50 completed')
  })

  it('says how many targets a relay has, singular and plural', () => {
    expect(
      shapeSmsRow(smsRow({ kind: 'relay', audience_count: 1, progress_count: 1 }), CTX).results,
    ).toBe('1/1 target active')
    expect(
      shapeSmsRow(smsRow({ kind: 'relay', audience_count: 4, progress_count: 2 }), CTX).results,
    ).toBe('2/4 targets active')
  })
})

// ── 6. owner ─────────────────────────────────────────────────────
describe('owner', () => {
  it('is mine when created_by matches the signed-in user', () => {
    expect(shapeCallListRow(callRow({ created_by: 'me' }), CTX).owner).toEqual({
      userId: 'me',
      isMine: true,
      unknown: false,
    })
  })

  it('is somebody else’s when created_by differs', () => {
    expect(shapeCallListRow(callRow({ created_by: 'you' }), CTX).owner).toEqual({
      userId: 'you',
      isMine: false,
      unknown: false,
    })
  })

  it('is unknown, and never mine, when created_by is null', () => {
    expect(shapeCallListRow(callRow({ created_by: null }), CTX).owner).toEqual({
      userId: null,
      isMine: false,
      unknown: true,
    })
  })

  it('claims nothing when nobody is signed in', () => {
    const ctx = { currentUserId: null }
    expect(shapeCallListRow(callRow({ created_by: 'me' }), ctx).owner.isMine).toBe(false)
    expect(shapeCallListRow(callRow({ created_by: 'me' }), ctx).owner.unknown).toBe(false)
  })
})

// ── 7. sortHubRows ───────────────────────────────────────────────
describe('sortHubRows', () => {
  it('interleaves kinds strictly by updatedAt, newest first', () => {
    const rows = [
      shapeSmsRow(smsRow({ updated_at: '2026-01-02T00:00:00Z' }), CTX),
      shapeCallListRow(callRow({ updated_at: '2026-01-04T00:00:00Z' }), CTX),
      shapeEmailRow(emailRow({ updated_at: '2026-01-03T00:00:00Z' }), CTX),
    ]
    expect(sortHubRows(rows).map((r) => r.kind)).toEqual([
      'call_list',
      'email_send',
      'sms_blast',
    ])
  })

  it('breaks ties on key so the order never flickers', () => {
    const at = '2026-01-02T00:00:00Z'
    const rows = [
      shapeCallListRow(callRow({ id: 9, updated_at: at }), CTX),
      shapeCallListRow(callRow({ id: 2, updated_at: at }), CTX),
    ]
    expect(sortHubRows(rows).map((r) => r.key)).toEqual(['call_list:2', 'call_list:9'])
    expect(sortHubRows([...rows].reverse()).map((r) => r.key)).toEqual([
      'call_list:2',
      'call_list:9',
    ])
  })
})

// ── 8. filterHubRows / countBy ───────────────────────────────────
describe('filterHubRows and countBy', () => {
  const rows: HubActionRow[] = [
    shapeSmsRow(smsRow({ id: 1, status: 'queued', created_by: 'me' }), CTX),
    shapeSmsRow(smsRow({ id: 2, status: 'draft', created_by: 'you', name: 'Rig muster' }), CTX),
    shapeEmailRow(emailRow({ id: 3, status: 'draft', created_by: 'me' }), CTX),
    shapeCallListRow(callRow({ id: 4, status: 'active', created_by: null }), CTX),
  ]
  const all = { mine: false, bucket: 'all', kind: 'all', search: '' } as const

  it('filters to mine', () => {
    expect(filterHubRows(rows, { ...all, mine: true }).map((r) => r.key)).toEqual([
      'sms_blast:1',
      'email_send:list:3',
    ])
  })

  it('filters by bucket', () => {
    expect(filterHubRows(rows, { ...all, bucket: 'drafts_paused' }).map((r) => r.key)).toEqual([
      'sms_blast:2',
      'email_send:list:3',
    ])
  })

  it('filters by kind', () => {
    expect(filterHubRows(rows, { ...all, kind: 'call_list' }).map((r) => r.key)).toEqual([
      'call_list:4',
    ])
  })

  it('searches over name and scope', () => {
    expect(filterHubRows(rows, { ...all, search: 'rig' }).map((r) => r.key)).toEqual([
      'sms_blast:2',
    ])
    expect(filterHubRows(rows, { ...all, search: 'ausco' })).toHaveLength(4)
  })

  it('counts what the chips would show', () => {
    // Counts are taken after the Mine filter and before the bucket
    // filter, so a chip's number is what clicking it yields.
    const mine = filterHubRows(rows, { ...all, mine: true })
    const counts = countBy(mine)
    expect(counts.byBucket.all).toBe(2)
    expect(counts.byBucket.live).toBe(1)
    expect(counts.byBucket.drafts_paused).toBe(1)
    expect(counts.byKind.sms_blast).toBe(1)
    expect(counts.byKind.email_send).toBe(1)
    expect(counts.byKind.call_list).toBeUndefined()
  })
})

describe('scopeFor', () => {
  it('is standalone with no campaign, an episode campaign or the shared container', () => {
    expect(scopeFor(null, null)).toEqual({ kind: 'standalone' })
    expect(
      scopeFor(3, { name: 'SMS episode 12', is_sms_episode: true, is_standing: false }),
    ).toEqual({ kind: 'standalone' })
    expect(
      scopeFor(4, { name: 'OA Membership Outreach', is_sms_episode: false, is_standing: true }),
    ).toEqual({ kind: 'standalone' })
  })

  it('falls back to a neutral word when the campaign is unknown or unnamed', () => {
    expect(scopeFor(5, undefined)).toEqual({ kind: 'campaign', campaignId: 5, name: 'Campaign' })
    expect(
      scopeFor(5, { name: '   ', is_sms_episode: false, is_standing: false }),
    ).toEqual({ kind: 'campaign', campaignId: 5, name: 'Campaign' })
  })
})

// ── 9. The three-source merge ────────────────────────────────────
describe('mergeHubRows', () => {
  it('interleaves all three sources strictly by updatedAt, newest first', () => {
    const rows = mergeHubRows(
      {
        sms: [smsRow({ id: 1, updated_at: '2026-02-01T00:00:00Z' })],
        email: [emailRow({ id: 11, updated_at: '2026-03-01T00:00:00Z' })],
        calls: [callRow({ id: 88, updated_at: '2026-01-01T00:00:00Z' })],
      },
      CTX,
    )
    expect(rows.map((r) => r.key)).toEqual([
      'email_send:list:11',
      'sms_blast:1',
      'call_list:88',
    ])
  })

  it('treats a missing source as absent rather than an error', () => {
    // One channel failing must not blank the other two.
    expect(mergeHubRows({ sms: [smsRow()] }, CTX).map((r) => r.kind)).toEqual(['sms_blast'])
    expect(mergeHubRows({ calls: [callRow()] }, CTX).map((r) => r.kind)).toEqual(['call_list'])
    expect(mergeHubRows({}, CTX)).toEqual([])
  })

  it('resolves ownership against the caller for every kind', () => {
    const rows = mergeHubRows(
      {
        sms: [smsRow({ created_by: 'me' })],
        email: [emailRow({ created_by: 'someone-else' })],
        calls: [callRow({ created_by: null })],
      },
      CTX,
    )
    const byKind = Object.fromEntries(rows.map((r) => [r.kind, r.owner]))
    expect(byKind.sms_blast).toEqual({ userId: 'me', isMine: true, unknown: false })
    expect(byKind.email_send).toEqual({
      userId: 'someone-else',
      isMine: false,
      unknown: false,
    })
    expect(byKind.call_list).toEqual({ userId: null, isMine: false, unknown: true })
  })
})

// ── 10. The unknown-owner count the table announces ──────────────
describe('countUnknownOwnerRows', () => {
  const rows = mergeHubRows(
    {
      sms: [
        smsRow({ id: 1, status: 'draft', created_by: null }),
        smsRow({ id: 2, created_by: 'me' }),
      ],
      email: [emailRow({ id: 11, created_by: null })],
      calls: [callRow({ id: 88, created_by: 'someone-else' })],
    },
    CTX,
  )

  it('counts the rows nobody owns, whatever the Mine filter says', () => {
    expect(countUnknownOwnerRows(rows, { bucket: 'all', kind: 'all', search: '' })).toBe(2)
  })

  it('respects every other filter, so it describes the view being looked at', () => {
    expect(
      countUnknownOwnerRows(rows, { bucket: 'all', kind: 'email_send', search: '' }),
    ).toBe(1)
    expect(
      countUnknownOwnerRows(rows, { bucket: 'drafts_paused', kind: 'all', search: '' }),
    ).toBe(1)
    expect(
      countUnknownOwnerRows(rows, { bucket: 'all', kind: 'all', search: 'no such thing' }),
    ).toBe(0)
  })
})

// ── 11. Awaiting review ──────────────────────────────────────────
describe('pendingModerationTotal', () => {
  /**
   * The two payloads the route returns for the same org: one narrowed
   * by `owner=mine_or_unowned`, one not. The relay rows differ — that
   * is the whole point of the owner filter — but the org-wide
   * moderation total the route computes does not.
   */
  function activityResponse(over: Partial<SmsActivityResponse>): SmsActivityResponse {
    return {
      blasts: [],
      chats: [],
      surveys: [],
      relays: [],
      scoped: false,
      archived_total: 0,
      pending_moderation_total: 0,
      ...over,
    }
  }

  const mineOnly = activityResponse({
    relays: [smsRow({ id: 1, kind: 'relay', status: 'active', pending_moderation_count: 3 })],
    pending_moderation_total: 12,
  })
  const everyone = activityResponse({
    relays: [
      smsRow({ id: 1, kind: 'relay', status: 'active', pending_moderation_count: 3 }),
      smsRow({
        id: 2,
        kind: 'relay',
        status: 'active',
        created_by: 'someone-else',
        pending_moderation_count: 9,
      }),
    ],
    pending_moderation_total: 12,
  })

  it('does not move when the owner filter does', () => {
    // Moderation is a duty over every relay, whoever set it up. The
    // rows are narrowed server-side by the owner filter; the tile's
    // number is not, because it is read from the payload rather than
    // summed from the rows the caller happened to be sent.
    expect(pendingModerationTotal(mineOnly)).toBe(12)
    expect(pendingModerationTotal(everyone)).toBe(12)
    expect(pendingModerationTotal(mineOnly)).toBe(pendingModerationTotal(everyone))
  })

  it('ignores the rows entirely', () => {
    // Nine messages sit on the rows in hand; the org-wide total is 0,
    // and the total is what the tile says.
    expect(
      pendingModerationTotal(
        activityResponse({
          relays: [
            smsRow({ id: 3, kind: 'relay', status: 'active', pending_moderation_count: 9 }),
          ],
        }),
      ),
    ).toBe(0)
  })

  it('is zero before the route has answered', () => {
    expect(pendingModerationTotal(undefined)).toBe(0)
    expect(pendingModerationTotal(null)).toBe(0)
  })
})

// ── 12. The launch-text subtitle ─────────────────────────────────
describe('shapeSmsRow subtitle', () => {
  it('marks a test action whether or not it is a launch text', () => {
    // Parity with the SMS table this replaced: the suffix sat outside
    // the launch-text branch, so both said "· test".
    expect(shapeSmsRow(smsRow({ is_test: true }), CTX).subtitle).toBe('Blast · test')
    expect(
      shapeSmsRow(smsRow({ relay_name: 'Rig relay', is_test: true }), CTX).subtitle,
    ).toBe('Launch text for Rig relay · test')
  })

  it('leaves an ordinary action unmarked', () => {
    expect(shapeSmsRow(smsRow(), CTX).subtitle).toBe('Blast')
    expect(shapeSmsRow(smsRow({ relay_name: 'Rig relay' }), CTX).subtitle).toBe(
      'Launch text for Rig relay',
    )
  })
})
