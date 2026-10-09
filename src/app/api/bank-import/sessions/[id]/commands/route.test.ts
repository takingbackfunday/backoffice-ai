import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findSession: vi.fn(),
  updateSession: vi.fn(),
  createCommand: vi.fn(),
  createEvent: vi.fn(),
  writeTransactions: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    bankImportSession: { findFirst: mocks.findSession, updateMany: mocks.updateSession },
    bankImportCommand: { create: mocks.createCommand },
    bankImportEvent: { create: mocks.createEvent },
    transaction: { createMany: mocks.writeTransactions, updateMany: mocks.writeTransactions, deleteMany: mocks.writeTransactions },
  },
}))
vi.mock('@/lib/log', () => ({ logger: { info: vi.fn() } }))

import { SNAPSHOT_INCLUDE } from '@/lib/bank-import/sessions'
import { TERMINAL_STATUSES, type BankImportCommandType } from '@/lib/bank-import/status'
import { POST } from './route'

const session = { id: 'session_owner', userId: 'user_owner', status: 'CAPTURED' }
const context = { params: Promise.resolve({ id: session.id }) }
const commands: BankImportCommandType[] = ['LOGIN_DONE', 'TAKEOVER', 'RESUME_AGENT', 'CANCEL']

function request(type: string = 'CANCEL') {
  return new Request(`http://localhost/api/bank-import/sessions/${session.id}/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('BANK_IMPORT_ENABLED', '1')
  vi.stubEnv('BANK_IMPORT_ENABLED_USER_IDS', 'user_owner')
  mocks.auth.mockResolvedValue({ userId: session.userId })
  mocks.findSession.mockResolvedValue(session)
  mocks.updateSession.mockResolvedValue({ count: 1 })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('POST bank-import session commands', () => {
  it.each(['CAPTURED', 'QUEUED'])('cancels an owned %s session directly without a worker command', async (status) => {
    mocks.findSession.mockResolvedValue({ ...session, status })
    vi.stubEnv('BANK_IMPORT_ENABLED_USER_IDS', ' user_other, user_owner ')

    const response = await POST(request(), context)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { accepted: true }, error: null })
    expect(mocks.findSession).toHaveBeenCalledExactlyOnceWith({
      where: { id: session.id, userId: session.userId }, include: SNAPSHOT_INCLUDE,
    })
    expect(mocks.updateSession).toHaveBeenCalledExactlyOnceWith({
      where: { id: session.id, status },
      data: { status: 'CANCELLED', liveUrlEnc: null, finishedAt: expect.any(Date) },
    })
    expect(mocks.createEvent).toHaveBeenCalledWith({
      data: { sessionId: session.id, type: 'status', message: 'Cancelled', data: { status: 'CANCELLED' } },
    })
    expect(mocks.createCommand).not.toHaveBeenCalled()
  })

  it.each([...TERMINAL_STATUSES])('accepts repeated cancellation of %s without a transition, command, or event', async (status) => {
    const terminal = Object.freeze({ ...session, status })
    mocks.findSession.mockResolvedValue(terminal)

    for (let i = 0; i < 2; i++) {
      const response = await POST(request(), context)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ data: { accepted: true }, error: null })
    }

    expect(mocks.updateSession).not.toHaveBeenCalled()
    expect(mocks.createCommand).not.toHaveBeenCalled()
    expect(mocks.createEvent).not.toHaveBeenCalled()
    expect(mocks.writeTransactions).not.toHaveBeenCalled()
    expect(terminal.status).toBe(status)
    expect(mocks.findSession).toHaveBeenCalledTimes(2)
    expect(mocks.findSession).toHaveBeenCalledWith({
      where: { id: session.id, userId: session.userId }, include: SNAPSHOT_INCLUDE,
    })
  })

  it('accepts discarding a loaded review after the captured session has expired without changing its terminal state', async () => {
    const loadedReview = { ...session, capturedAt: new Date('2026-10-08T10:02:00Z') }
    const expired = Object.freeze({
      ...loadedReview,
      status: 'EXPIRED',
      expiresAt: new Date('2026-10-09T10:02:00Z'),
      finishedAt: new Date('2026-10-09T10:03:00Z'),
      errorCode: 'session_timeout',
    })
    mocks.findSession.mockResolvedValue(expired)

    const response = await POST(request(), context)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { accepted: true }, error: null })
    expect(expired).toEqual({
      ...loadedReview,
      status: 'EXPIRED',
      expiresAt: new Date('2026-10-09T10:02:00Z'),
      finishedAt: new Date('2026-10-09T10:03:00Z'),
      errorCode: 'session_timeout',
    })
    expect(mocks.findSession).toHaveBeenCalledExactlyOnceWith({
      where: { id: session.id, userId: session.userId }, include: SNAPSHOT_INCLUDE,
    })
    expect(mocks.updateSession).not.toHaveBeenCalled()
    expect(mocks.createCommand).not.toHaveBeenCalled()
    expect(mocks.createEvent).not.toHaveBeenCalled()
    expect(mocks.writeTransactions).not.toHaveBeenCalled()
  })

  it('accepts cancellation of a completed import without changing its status, counts, or imported transactions', async () => {
    const completed = Object.freeze({
      ...session,
      status: 'COMPLETE',
      importedCount: 47,
      skippedCount: 3,
      finishedAt: new Date('2026-10-09T10:03:00Z'),
    })
    mocks.findSession.mockResolvedValue(completed)

    const response = await POST(request(), context)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { accepted: true }, error: null })
    expect(completed).toEqual({
      ...session,
      status: 'COMPLETE',
      importedCount: 47,
      skippedCount: 3,
      finishedAt: new Date('2026-10-09T10:03:00Z'),
    })
    expect(mocks.findSession).toHaveBeenCalledExactlyOnceWith({
      where: { id: session.id, userId: session.userId }, include: SNAPSHOT_INCLUDE,
    })
    expect(mocks.updateSession).not.toHaveBeenCalled()
    expect(mocks.createCommand).not.toHaveBeenCalled()
    expect(mocks.createEvent).not.toHaveBeenCalled()
    expect(mocks.writeTransactions).not.toHaveBeenCalled()
  })

  it.each(commands.filter(type => type !== 'CANCEL'))('rejects %s for captured imports', async (type) => {
    const response = await POST(request(type), context)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ data: null, error: 'This import session can no longer accept commands' })
    expect(mocks.updateSession).not.toHaveBeenCalled()
    expect(mocks.createCommand).not.toHaveBeenCalled()
    expect(mocks.createEvent).not.toHaveBeenCalled()
  })

  it.each([...TERMINAL_STATUSES].flatMap(status => commands
    .filter(type => type !== 'CANCEL')
    .map(type => ({ status, type }))))('rejects $type for terminal $status imports', async ({ status, type }) => {
    mocks.findSession.mockResolvedValue({ ...session, status })

    const response = await POST(request(type), context)

    expect(response.status).toBe(409)
    expect(mocks.updateSession).not.toHaveBeenCalled()
    expect(mocks.createCommand).not.toHaveBeenCalled()
    expect(mocks.createEvent).not.toHaveBeenCalled()
  })

  it.each(['STARTING', 'AWAITING_LOGIN', 'NAVIGATING', 'NEEDS_USER'])('keeps cancellation worker-queued for %s imports', async (status) => {
    mocks.findSession.mockResolvedValue({ ...session, status })

    const response = await POST(request(), context)

    expect(response.status).toBe(200)
    expect(mocks.createCommand).toHaveBeenCalledExactlyOnceWith({ data: { sessionId: session.id, type: 'CANCEL' } })
    expect(mocks.updateSession).not.toHaveBeenCalled()
    expect(mocks.createEvent).toHaveBeenCalledWith({
      data: {
        sessionId: session.id, type: 'action', message: 'Your instruction was sent to the assistant.', data: { command: 'CANCEL' },
      },
    })
  })

  it.each(commands.filter(type => type !== 'CANCEL'))('still queues %s for an active session', async (type) => {
    mocks.findSession.mockResolvedValue({ ...session, status: 'QUEUED' })

    const response = await POST(request(type), context)

    expect(response.status).toBe(200)
    expect(mocks.createCommand).toHaveBeenCalledExactlyOnceWith({ data: { sessionId: session.id, type } })
    expect(mocks.updateSession).not.toHaveBeenCalled()
  })

  it.each(['CAPTURED', 'QUEUED'].flatMap(from => [...TERMINAL_STATUSES]
    .map(to => ({ from, to }))))('accepts a concurrent $from to $to transition after an owner-scoped re-read with no further writes', async ({ from, to }) => {
    const current = Object.freeze({
      ...session,
      status: to,
      importedCount: to === 'COMPLETE' ? 47 : null,
      skippedCount: to === 'COMPLETE' ? 3 : null,
    })
    mocks.findSession.mockResolvedValueOnce({ ...session, status: from }).mockResolvedValueOnce(current)
    mocks.updateSession.mockResolvedValue({ count: 0 })

    const response = await POST(request(), context)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { accepted: true }, error: null })
    expect(mocks.findSession).toHaveBeenCalledTimes(2)
    expect(mocks.findSession).toHaveBeenNthCalledWith(2, {
      where: { id: session.id, userId: session.userId }, include: SNAPSHOT_INCLUDE,
    })
    expect(mocks.updateSession).toHaveBeenCalledExactlyOnceWith({
      where: { id: session.id, status: from },
      data: { status: 'CANCELLED', liveUrlEnc: null, finishedAt: expect.any(Date) },
    })
    expect(mocks.createCommand).not.toHaveBeenCalled()
    expect(mocks.createEvent).not.toHaveBeenCalled()
    expect(mocks.writeTransactions).not.toHaveBeenCalled()
    expect(current).toEqual({
      ...session,
      status: to,
      importedCount: to === 'COMPLETE' ? 47 : null,
      skippedCount: to === 'COMPLETE' ? 3 : null,
    })
  })

  it.each([
    { from: 'QUEUED', to: 'STARTING' },
    { from: 'QUEUED', to: 'NAVIGATING' },
    { from: 'QUEUED', to: 'NEEDS_USER' },
    { from: 'QUEUED', to: 'CAPTURED' },
  ])('returns a conflict when $from changes concurrently to $to', async ({ from, to }) => {
    mocks.findSession.mockResolvedValueOnce({ ...session, status: from }).mockResolvedValueOnce({ ...session, status: to })
    mocks.updateSession.mockResolvedValue({ count: 0 })

    const response = await POST(request(), context)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      data: null, error: 'This import session changed state and can no longer accept this command',
    })
    expect(mocks.findSession).toHaveBeenCalledTimes(2)
    expect(mocks.updateSession).toHaveBeenCalledTimes(1)
    expect(mocks.createCommand).not.toHaveBeenCalled()
    expect(mocks.createEvent).not.toHaveBeenCalled()
  })

  it('keeps the concurrency re-read owner-scoped if the session is no longer accessible', async () => {
    mocks.findSession.mockResolvedValueOnce(session).mockResolvedValueOnce(null)
    mocks.updateSession.mockResolvedValue({ count: 0 })

    const response = await POST(request(), context)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ data: null, error: 'Import session not found' })
    expect(mocks.findSession).toHaveBeenNthCalledWith(2, {
      where: { id: session.id, userId: session.userId }, include: SNAPSHOT_INCLUDE,
    })
    expect(mocks.createCommand).not.toHaveBeenCalled()
  })

  it.each(['database unavailable', 'Session changed state concurrently: connection lost'])('propagates a real transition error without re-reading: %s', async (message) => {
    const error = new Error(message)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.updateSession.mockRejectedValue(error)

    const response = await POST(request(), context)

    expect(response.status).toBe(500)
    expect(consoleError).toHaveBeenCalledWith(error)
    expect(mocks.findSession).toHaveBeenCalledTimes(1)
    expect(mocks.createCommand).not.toHaveBeenCalled()
    expect(mocks.createEvent).not.toHaveBeenCalled()
  })

  it('propagates a database error during the concurrency re-read', async () => {
    const error = new Error('session lookup failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.findSession.mockResolvedValueOnce(session).mockRejectedValueOnce(error)
    mocks.updateSession.mockResolvedValue({ count: 0 })

    const response = await POST(request(), context)

    expect(response.status).toBe(500)
    expect(consoleError).toHaveBeenCalledWith(error)
    expect(mocks.findSession).toHaveBeenCalledTimes(2)
    expect(mocks.createCommand).not.toHaveBeenCalled()
    expect(mocks.createEvent).not.toHaveBeenCalled()
  })

  it('does not mask an event failure after a successful state update as an idempotent cancellation', async () => {
    const error = new Error('event write failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.createEvent.mockRejectedValue(error)

    const response = await POST(request(), context)

    expect(response.status).toBe(500)
    expect(consoleError).toHaveBeenCalledWith(error)
    expect(mocks.findSession).toHaveBeenCalledTimes(1)
    expect(mocks.updateSession).toHaveBeenCalledTimes(1)
    expect(mocks.createCommand).not.toHaveBeenCalled()
  })

  it.each([
    { label: 'unauthenticated caller', userId: null, status: 401, error: 'Unauthorized' },
    { label: 'non-owner', userId: 'user_other', status: 404, error: 'Import session not found' },
  ])('does not cancel for an $label', async ({ userId, status, error }) => {
    vi.stubEnv('BANK_IMPORT_ENABLED_USER_IDS', '')
    mocks.auth.mockResolvedValue({ userId })
    mocks.findSession.mockResolvedValue(null)

    const response = await POST(request(), context)

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ data: null, error })
    expect(mocks.updateSession).not.toHaveBeenCalled()
    expect(mocks.createCommand).not.toHaveBeenCalled()
    expect(mocks.createEvent).not.toHaveBeenCalled()
    if (userId) {
      expect(mocks.findSession).toHaveBeenCalledWith({ where: { id: session.id, userId }, include: SNAPSHOT_INCLUDE })
    } else {
      expect(mocks.findSession).not.toHaveBeenCalled()
    }
  })

  it('rejects an owner outside the feature allowlist before looking up the session', async () => {
    vi.stubEnv('BANK_IMPORT_ENABLED_USER_IDS', 'user_other')

    const response = await POST(request(), context)

    expect(response.status).toBe(404)
    expect(mocks.findSession).not.toHaveBeenCalled()
    expect(mocks.updateSession).not.toHaveBeenCalled()
    expect(mocks.createCommand).not.toHaveBeenCalled()
  })

  it('returns 404 before authentication when the feature is disabled', async () => {
    vi.stubEnv('BANK_IMPORT_ENABLED', '0')

    const response = await POST(request(), context)

    expect(response.status).toBe(404)
    expect(mocks.auth).not.toHaveBeenCalled()
    expect(mocks.findSession).not.toHaveBeenCalled()
    expect(mocks.updateSession).not.toHaveBeenCalled()
    expect(mocks.createCommand).not.toHaveBeenCalled()
  })

  it('rejects an unsupported command before looking up a session', async () => {
    const response = await POST(request('COMPLETE'), context)

    expect(response.status).toBe(400)
    expect(mocks.findSession).not.toHaveBeenCalled()
    expect(mocks.updateSession).not.toHaveBeenCalled()
    expect(mocks.createCommand).not.toHaveBeenCalled()
  })
})
