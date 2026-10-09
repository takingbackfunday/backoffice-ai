import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findSession: vi.fn(),
  findArtifact: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    bankImportSession: { findFirst: mocks.findSession },
    bankImportArtifact: { findFirst: mocks.findArtifact },
  },
}))

import { GET } from './route'

const session = { id: 'session_owner', userId: 'user_owner' }
const artifactId = 'artifact_csv'
const bytes = new TextEncoder().encode('\uFEFFDate,Description,Amount\r\n2026-09-01,Caf\u00e9,-4.50\r\n')
const request = new Request(`http://localhost/api/bank-import/sessions/${session.id}/artifacts/${artifactId}`)
const context = { params: Promise.resolve({ id: session.id, artifactId }) }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('BANK_IMPORT_ENABLED', '1')
  vi.stubEnv('BANK_IMPORT_ENABLED_USER_IDS', '')
  mocks.auth.mockResolvedValue({ userId: session.userId })
  mocks.findSession.mockResolvedValue(session)
})

afterEach(() => vi.unstubAllEnvs())

describe('GET bank-import artifact', () => {
  it('downloads the exact original bytes, including BOM and CRLF, with safe attachment headers', async () => {
    mocks.findArtifact.mockResolvedValue({
      filename: '..\\exports\\caf\u00e9"\r\n.csv',
      mimeType: 'text/csv',
      content: bytes,
    })

    const response = await GET(request, context)

    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
    expect(response.headers.get('Content-Type')).toBe('text/csv')
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="caf____.csv"; filename*=UTF-8\'\'caf%C3%A9___.csv',
    )
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(mocks.findSession).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: session.id, userId: session.userId },
    }))
    expect(mocks.findArtifact).toHaveBeenCalledWith({
      where: { id: artifactId, sessionId: session.id, purgedAt: null, content: { not: null } },
      select: { filename: true, mimeType: true, content: true },
    })
  })

  it.each([
    { label: 'unauthenticated caller', userId: null, status: 401, error: 'Unauthorized' },
    { label: 'non-owner', userId: 'user_other', status: 404, error: 'Import session not found' },
  ])('does not fetch an artifact for an $label', async ({ userId, status, error }) => {
    mocks.auth.mockResolvedValue({ userId })
    mocks.findSession.mockResolvedValue(null)

    const response = await GET(request, context)

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ data: null, error })
    expect(response.headers.get('Content-Disposition')).toBeNull()
    expect(mocks.findArtifact).not.toHaveBeenCalled()
    if (userId) {
      expect(mocks.findSession).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: session.id, userId },
      }))
    } else {
      expect(mocks.findSession).not.toHaveBeenCalled()
    }
  })

  it.each([
    { label: 'an artifact from another session', row: { sessionId: 'session_other', purgedAt: null, content: bytes } },
    { label: 'a purged artifact', row: { sessionId: session.id, purgedAt: new Date('2026-10-01'), content: bytes } },
    { label: 'an absent artifact', row: null },
    { label: 'an artifact without content', row: { sessionId: session.id, purgedAt: null, content: null } },
  ])('returns no download bytes for $label', async ({ row }) => {
    mocks.findArtifact.mockImplementation(async ({ where }) => {
      if (!row) return null
      if (where.id !== undefined && where.id !== artifactId) return null
      if (where.sessionId !== undefined && where.sessionId !== row.sessionId) return null
      if (where.purgedAt === null && row.purgedAt !== null) return null
      if (where.content?.not === null && row.content === null) return null
      return { filename: 'original.csv', mimeType: 'text/csv', content: row.content }
    })

    const response = await GET(request, context)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ data: null, error: 'Artifact not found or expired' })
    expect(response.headers.get('Content-Disposition')).toBeNull()
    expect(mocks.findArtifact).toHaveBeenCalledWith({
      where: { id: artifactId, sessionId: session.id, purgedAt: null, content: { not: null } },
      select: { filename: true, mimeType: true, content: true },
    })
  })
})
