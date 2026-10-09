import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findSession: vi.fn(),
  findArtifacts: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    bankImportSession: { findFirst: mocks.findSession },
    bankImportArtifact: { findMany: mocks.findArtifacts },
  },
}))

import { GET } from './route'

const session = {
  id: 'session_owner',
  userId: 'user_owner',
  accountId: 'account_owner',
  status: 'CAPTURED',
  bankKey: 'n26',
  dateFrom: '2026-09-01',
  dateTo: '2026-09-30',
}
const csvText = 'Date,Description,Amount\r\n2026-09-01,"Coffee, shop",-4.50\r\n'
const request = new Request(`http://localhost/api/bank-import/sessions/${session.id}/files`)
const context = { params: Promise.resolve({ id: session.id }) }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('BANK_IMPORT_ENABLED', '1')
  vi.stubEnv('BANK_IMPORT_ENABLED_USER_IDS', '')
  mocks.auth.mockResolvedValue({ userId: session.userId })
  mocks.findSession.mockResolvedValue(session)
})

afterEach(() => vi.unstubAllEnvs())

describe('GET bank-import session files', () => {
  it('returns owner-scoped original metadata and preserves the CSV mapping content', async () => {
    mocks.findArtifacts.mockResolvedValue([{
      id: 'artifact_csv',
      filename: 'C:\\exports\\activity"?.csv',
      mimeType: 'text/csv; charset=utf-8',
      content: new TextEncoder().encode(`\uFEFF${csvText}`),
    }])

    const response = await GET(request, context)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.findSession).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: session.id, userId: session.userId },
    }))
    expect(mocks.findArtifacts).toHaveBeenCalledWith({
      where: { sessionId: session.id, purgedAt: null, content: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, filename: true, mimeType: true, content: true },
    })
    expect(await response.json()).toEqual({
      data: {
        accountId: session.accountId,
        bankName: 'N26',
        dateFrom: session.dateFrom,
        dateTo: session.dateTo,
        files: [{
          filename: 'N26 2026-09-01 to 2026-09-30.csv',
          headers: ['Date', 'Description', 'Amount'],
          csvText,
          source: 'csv',
          original: {
            kind: 'bank',
            sessionId: session.id,
            artifactId: 'artifact_csv',
            filename: 'activity__.csv',
            mimeType: 'text/csv; charset=utf-8',
          },
        }],
        unsupported: [],
      },
      error: null,
    })
  })

  it('gives distinct CSV artifacts unique synthetic names without losing original references', async () => {
    const artifacts = [
      { id: 'artifact_first', filename: '../first.csv', csvText },
      { id: 'artifact_second', filename: '../second.csv', csvText: csvText.replace('Coffee, shop', 'Market') },
    ]
    mocks.findArtifacts.mockResolvedValue(artifacts.map(artifact => ({
      id: artifact.id,
      filename: artifact.filename,
      mimeType: 'text/csv',
      content: new TextEncoder().encode(artifact.csvText),
    })))

    const response = await GET(request, context)
    const { data } = await response.json()

    expect(response.status).toBe(200)
    expect(data.files).toEqual(artifacts.map((artifact, index) => ({
      filename: `N26 2026-09-01 to 2026-09-30 - ${index + 1}.csv`,
      headers: ['Date', 'Description', 'Amount'],
      csvText: artifact.csvText,
      source: 'csv',
      original: {
        kind: 'bank',
        sessionId: session.id,
        artifactId: artifact.id,
        filename: index === 0 ? 'first.csv' : 'second.csv',
        mimeType: 'text/csv',
      },
    })))
    expect(data.unsupported).toEqual([])
  })

  it('retains original metadata for viewing or downloading an unsupported captured PDF', async () => {
    mocks.findArtifacts.mockResolvedValue([{
      id: 'artifact_pdf',
      filename: '../statements/statement?.pdf',
      mimeType: 'application/pdf',
      content: new TextEncoder().encode('%PDF-1.7\n%%EOF'),
    }])

    const response = await GET(request, context)
    const { data } = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(data.files).toEqual([])
    expect(data.unsupported).toEqual([{
      artifactId: 'artifact_pdf',
      filename: 'statement_.pdf',
      reason: expect.stringContaining('PDF statements'),
      original: {
        kind: 'bank',
        sessionId: session.id,
        artifactId: 'artifact_pdf',
        filename: 'statement_.pdf',
        mimeType: 'application/pdf',
      },
    }])
  })

  it.each([
    { label: 'unauthenticated caller', userId: null, status: 401, error: 'Unauthorized' },
    { label: 'non-owner', userId: 'user_other', status: 404, error: 'Import session not found' },
  ])('does not fetch artifacts for an $label', async ({ userId, status, error }) => {
    mocks.auth.mockResolvedValue({ userId })
    mocks.findSession.mockResolvedValue(null)

    const response = await GET(request, context)

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ data: null, error })
    expect(mocks.findArtifacts).not.toHaveBeenCalled()
    if (userId) {
      expect(mocks.findSession).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: session.id, userId },
      }))
    } else {
      expect(mocks.findSession).not.toHaveBeenCalled()
    }
  })
})
