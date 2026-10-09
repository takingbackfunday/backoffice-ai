import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findSession: vi.fn() }))

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }))
vi.mock('@/lib/prisma', () => ({
  prisma: { bankImportSession: { findFirst: mocks.findSession } },
}))

import { SNAPSHOT_INCLUDE } from '@/lib/bank-import/sessions'
import { ACTIVE_STATUSES } from '@/lib/bank-import/status'
import { GET } from './route'

const now = new Date('2026-10-09T12:00:00Z')
const session = {
  id: 'session_owner',
  userId: 'user_owner',
  status: 'CAPTURED' as const,
  needsUserReason: null,
  bankKey: 'n26',
  accountId: 'account_owner',
  account: { name: 'Owner account' },
  dateFrom: '2026-09-01',
  dateTo: '2026-09-30',
  errorCode: null,
  errorMessage: null,
  liveUrlEnc: null,
  artifacts: [],
  createdAt: new Date('2026-10-09T10:00:00Z'),
  startedAt: new Date('2026-10-09T10:01:00Z'),
  capturedAt: new Date('2026-10-09T10:02:00Z'),
  updatedAt: new Date('2026-10-09T10:02:00Z'),
}
const request = new Request('http://localhost/api/bank-import/sessions/active')

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(now)
  vi.stubEnv('BANK_IMPORT_ENABLED', '1')
  vi.stubEnv('BANK_IMPORT_ENABLED_USER_IDS', 'user_owner')
  mocks.auth.mockResolvedValue({ userId: session.userId })
  mocks.findSession.mockResolvedValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('GET bank-import active session', () => {
  it.each([...ACTIVE_STATUSES])('prioritizes an active %s session without checking captures', async (status) => {
    const active = { ...session, id: 'session_active', status, capturedAt: null }
    mocks.findSession.mockResolvedValueOnce(active).mockResolvedValueOnce(session)

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({
      data: expect.objectContaining({ id: active.id, status, capturedAt: null, bankName: 'N26', accountName: session.account.name }),
      error: null,
    })
    expect(mocks.findSession).toHaveBeenCalledExactlyOnceWith({
      where: { userId: session.userId, status: { in: [...ACTIVE_STATUSES] } },
      include: SNAPSHOT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
  })

  it('returns the latest capture only if it is still ready for review', async () => {
    mocks.findSession.mockResolvedValueOnce(null).mockResolvedValueOnce(session)

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({
      data: {
        id: session.id,
        status: 'CAPTURED',
        needsUserReason: null,
        bankKey: 'n26',
        bankName: 'N26',
        accountId: session.accountId,
        accountName: session.account.name,
        dateFrom: session.dateFrom,
        dateTo: session.dateTo,
        errorCode: null,
        errorMessage: null,
        hasLiveView: false,
        artifacts: [],
        createdAt: session.createdAt.toISOString(),
        startedAt: session.startedAt.toISOString(),
        capturedAt: session.capturedAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
      error: null,
    })
    expect(mocks.findSession).toHaveBeenCalledTimes(2)
    expect(mocks.findSession).toHaveBeenNthCalledWith(2, {
      where: {
        userId: session.userId,
        capturedAt: { not: null },
        createdAt: { gte: new Date('2026-10-08T12:00:00Z') },
      },
      include: SNAPSHOT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
  })

  it.each(['COMPLETE', 'CANCELLED', 'EXPIRED', 'FAILED'])('does not resurrect an older captured import after a newer capture is %s', async (status) => {
    const rows = [
      { ...session, id: 'older_ready', createdAt: new Date('2026-10-09T09:00:00Z') },
      { ...session, id: 'newer_capture', status },
      { ...session, id: 'other_owner', userId: 'user_other', createdAt: now },
    ]
    mocks.findSession.mockImplementation(async ({ where }) => {
      return rows.filter(row => row.userId === where.userId
        && (!where.status?.in || where.status.in.includes(row.status))
        && (typeof where.status !== 'string' || row.status === where.status)
        && (!where.capturedAt || row.capturedAt !== null)
        && (!where.createdAt || row.createdAt >= where.createdAt.gte))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    })

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ data: null, error: null })
    expect(mocks.findSession).toHaveBeenCalledTimes(2)
  })

  it('ignores newer sessions that never captured and captures outside the createdAt window', async () => {
    const rows = [
      session,
      { ...session, id: 'failed_without_capture', status: 'FAILED', createdAt: now, capturedAt: null },
      { ...session, id: 'old_complete', status: 'COMPLETE', createdAt: new Date('2026-10-08T11:59:59Z'), capturedAt: now },
      { ...session, id: 'other_owner', userId: 'user_other', createdAt: now },
    ]
    mocks.findSession.mockImplementation(async ({ where }) => {
      return rows.filter(row => row.userId === where.userId
        && (!where.status?.in || where.status.in.includes(row.status))
        && (!where.capturedAt || row.capturedAt !== null)
        && (!where.createdAt || row.createdAt >= where.createdAt.gte))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null
    })

    const response = await GET(request)

    expect(response.status).toBe(200)
    const { data, error } = await response.json()
    expect(data.id).toBe(session.id)
    expect(error).toBeNull()
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('returns no ready import when all captured sessions are outside the 24-hour createdAt window', async () => {
    mocks.findSession.mockImplementation(async ({ where }) => {
      const old = { ...session, createdAt: new Date('2026-10-08T11:59:59Z'), capturedAt: now }
      if (where.status?.in && !where.status.in.includes(old.status)) return null
      return where.createdAt && old.createdAt < where.createdAt.gte ? null : old
    })

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: null, error: null })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('returns a non-cacheable null when there is neither an active session nor a capture', async () => {
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: null, error: null })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.findSession).toHaveBeenCalledTimes(2)
  })

  it('does not query sessions for an unauthenticated caller', async () => {
    mocks.auth.mockResolvedValue({ userId: null })

    const response = await GET(request)

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ data: null, error: 'Unauthorized' })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.findSession).not.toHaveBeenCalled()
  })

  it('hides the route from a user outside the feature allowlist', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_other' })

    const response = await GET(request)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ data: null, error: 'Resource not found' })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.findSession).not.toHaveBeenCalled()
  })

  it('hides the disabled feature before authentication with a non-cacheable response', async () => {
    vi.stubEnv('BANK_IMPORT_ENABLED', '0')

    const response = await GET(request)

    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.auth).not.toHaveBeenCalled()
    expect(mocks.findSession).not.toHaveBeenCalled()
  })

  it('preserves database errors as non-cacheable server errors', async () => {
    const error = new Error('database unavailable')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.findSession.mockRejectedValue(error)

    const response = await GET(request)

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(consoleError).toHaveBeenCalledWith(error)
    expect(mocks.findSession).toHaveBeenCalledTimes(1)
  })
})
