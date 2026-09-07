import { describe, expect, it } from 'vitest'
import {
  archiveBlocker,
  canArchive,
  canUnarchive,
  deleteGate,
  isSmsActionLive,
  isSmsActionUnusedDraft,
  parseArchivedParam,
  type SmsArchiveSubject,
} from '../archive-policy'

function subject(overrides: Partial<SmsArchiveSubject> & Pick<SmsArchiveSubject, 'kind'>): SmsArchiveSubject {
  return {
    status: 'draft',
    archivedAt: null,
    sentItems: 0,
    relayMessageCount: 0,
    isTest: false,
    isBallot: false,
    isOrgWide: false,
    ...overrides,
  }
}

describe('parseArchivedParam', () => {
  it('defaults to exclude', () => {
    expect(parseArchivedParam(null)).toBe('exclude')
    expect(parseArchivedParam('0')).toBe('exclude')
  })
  it('parses include and only', () => {
    expect(parseArchivedParam('1')).toBe('include')
    expect(parseArchivedParam('only')).toBe('only')
  })
})

describe('live / unused / inert', () => {
  it('treats paused blasts, surveys and used relays as live', () => {
    expect(isSmsActionLive(subject({ kind: 'blast', status: 'paused' }))).toBe(true)
    expect(isSmsActionLive(subject({ kind: 'blast', status: 'queued' }))).toBe(true)
    expect(isSmsActionLive(subject({ kind: 'survey', status: 'paused' }))).toBe(true)
    expect(isSmsActionLive(subject({ kind: 'survey', status: 'open' }))).toBe(true)
    expect(
      isSmsActionLive(subject({ kind: 'relay', status: 'paused', relayMessageCount: 1 })),
    ).toBe(true)
    expect(isSmsActionLive(subject({ kind: 'relay', status: 'active' }))).toBe(true)
  })

  it('treats an open chat board (draft with sends) as live and unused draft as not', () => {
    expect(isSmsActionLive(subject({ kind: 'chat', status: 'draft', sentItems: 3 }))).toBe(true)
    expect(isSmsActionLive(subject({ kind: 'chat', status: 'draft', sentItems: 0 }))).toBe(false)
    expect(isSmsActionUnusedDraft(subject({ kind: 'chat', status: 'draft', sentItems: 0 }))).toBe(
      true,
    )
  })

  it('treats never-activated relays with no log as unused drafts', () => {
    expect(
      isSmsActionUnusedDraft(subject({ kind: 'relay', status: 'paused', relayMessageCount: 0 })),
    ).toBe(true)
    expect(
      isSmsActionUnusedDraft(subject({ kind: 'relay', status: 'paused', relayMessageCount: 2 })),
    ).toBe(false)
  })
})

describe('archive', () => {
  it('blocks live actions with the matching lifecycle fix', () => {
    expect(archiveBlocker(subject({ kind: 'blast', status: 'sending' }))?.lifecycle).toBe(
      'cancel_blast',
    )
    expect(archiveBlocker(subject({ kind: 'chat', status: 'draft', sentItems: 1 }))?.lifecycle).toBe(
      'open_board',
    )
    expect(archiveBlocker(subject({ kind: 'survey', status: 'paused' }))?.lifecycle).toBe(
      'close_survey',
    )
    expect(
      archiveBlocker(subject({ kind: 'relay', status: 'paused', relayMessageCount: 1 }))?.lifecycle,
    ).toBe('end_relay')
  })

  it('allows writers to archive finished work only', () => {
    expect(canArchive('user', subject({ kind: 'blast', status: 'sent' }))).toBe(true)
    expect(canArchive('user', subject({ kind: 'survey', status: 'closed' }))).toBe(true)
    expect(canArchive('user', subject({ kind: 'relay', status: 'ended' }))).toBe(true)
    expect(canArchive('user', subject({ kind: 'blast', status: 'draft' }))).toBe(false)
    expect(canArchive('viewer', subject({ kind: 'blast', status: 'sent' }))).toBe(false)
    expect(
      canArchive('admin', subject({ kind: 'blast', status: 'sent', archivedAt: '2026-01-01' })),
    ).toBe(false)
  })

  it('allows unarchive of archived rows', () => {
    expect(
      canUnarchive('user', subject({ kind: 'blast', status: 'sent', archivedAt: '2026-01-01' })),
    ).toBe(true)
    expect(canUnarchive('user', subject({ kind: 'blast', status: 'sent' }))).toBe(false)
  })
})

describe('delete', () => {
  it('lets writers delete unused drafts without a typed confirm', () => {
    const g = deleteGate(subject({ kind: 'blast', status: 'draft' }), 'user')
    expect(g.allowed).toBe(true)
    if (g.allowed) expect(g.needsTypedConfirm).toBe(false)
  })

  it('lets writers delete closed test surveys without typing DELETE', () => {
    const g = deleteGate(subject({ kind: 'survey', status: 'closed', isTest: true }), 'user')
    expect(g.allowed).toBe(true)
    if (g.allowed) {
      expect(g.needsTypedConfirm).toBe(false)
      expect(g.usesAdminClient).toBe(true)
    }
  })

  it('refuses writer delete of finished production work', () => {
    const g = deleteGate(subject({ kind: 'blast', status: 'sent' }), 'user')
    expect(g.allowed).toBe(false)
    if (!g.allowed) expect(g.status).toBe(403)
  })

  it('requires typed confirm for admin delete of closed production surveys and ballots', () => {
    const survey = deleteGate(subject({ kind: 'survey', status: 'closed' }), 'admin')
    expect(survey.allowed).toBe(true)
    if (survey.allowed) expect(survey.needsTypedConfirm).toBe(true)
    const ballot = deleteGate(
      subject({ kind: 'survey', status: 'closed', isBallot: true }),
      'admin',
    )
    expect(ballot.allowed).toBe(true)
    if (ballot.allowed) expect(ballot.needsTypedConfirm).toBe(true)
  })

  it('blocks deleting live actions', () => {
    const g = deleteGate(subject({ kind: 'survey', status: 'open' }), 'admin')
    expect(g.allowed).toBe(false)
    if (!g.allowed) {
      expect(g.status).toBe(409)
      expect(g.lifecycle).toBe('close_survey')
    }
  })

  it('restricts org-wide relay delete to admins', () => {
    const unused = subject({
      kind: 'relay',
      status: 'paused',
      isOrgWide: true,
      relayMessageCount: 0,
    })
    expect(deleteGate(unused, 'user').allowed).toBe(false)
    expect(deleteGate(unused, 'admin').allowed).toBe(true)
  })
})
