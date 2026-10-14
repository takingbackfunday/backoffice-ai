import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findFirst: vi.fn(), update: vi.fn(), match: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({ auth: mocks.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: { transaction: { findFirst: mocks.findFirst, update: mocks.update } } }))
vi.mock('@/lib/invoice-matching', () => ({ matchInvoicePayments: mocks.match }))

import { PATCH } from './route'

const originalDate = new Date('2026-10-09T00:00:00.000Z')
let storedDate: Date
const patch = (body: unknown) => PATCH(new Request('http://localhost/api/transactions/synthetic-row', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id: 'synthetic-row' }) })

beforeEach(() => {
  vi.resetAllMocks()
  storedDate = originalDate
  mocks.auth.mockResolvedValue({ userId: 'synthetic-owner' })
  mocks.findFirst.mockResolvedValue({ id: 'synthetic-row', date: storedDate, workspaceId: null })
  mocks.update.mockImplementation(async ({ data }) => {
    storedDate = data.date ?? storedDate
    return { id: 'synthetic-row', date: storedDate }
  })
})

describe('PATCH transaction calendar date with mocked storage', () => {
  it.each(['2026-03-08', '2026-11-01', '2024-02-29', '2027-01-01'])('persists %s at UTC midnight without changing the day', async day => {
    const timestamp = `${day}T00:00:00.000Z`
    const response = await patch({ date: timestamp })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { id: 'synthetic-row', date: timestamp }, error: null })
    expect(storedDate.toISOString()).toBe(timestamp)
    expect(mocks.findFirst).toHaveBeenCalledExactlyOnceWith({ where: { id: 'synthetic-row', account: { userId: 'synthetic-owner' } } })
    expect(mocks.update.mock.calls[0][0].data.date).toEqual(new Date(timestamp))
    expect(mocks.match).not.toHaveBeenCalled()
  })

  it.each(['not-a-date', '2026-03-08', '2026-02-30T00:00:00.000Z', '', null])('rejects an invalid date (%s) before touching storage', async date => {
    const response = await patch({ date })
    expect(response.status).toBe(400)
    expect(mocks.findFirst).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(storedDate).toEqual(originalDate)
  })

  it('does not clear the date when another field is patched', async () => {
    const response = await patch({ notes: 'Synthetic note' })
    expect(response.status).toBe(200)
    expect(mocks.update.mock.calls[0][0].data).toEqual({ notes: 'Synthetic note' })
    expect(storedDate).toEqual(originalDate)
  })

  it('rejects unauthenticated edits without looking up a transaction', async () => {
    mocks.auth.mockResolvedValue({ userId: null })
    expect((await patch({ date: '2026-03-08T00:00:00.000Z' })).status).toBe(401)
    expect(mocks.findFirst).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('cannot persist a date on a transaction outside the owner scope', async () => {
    mocks.findFirst.mockResolvedValue(null)
    expect((await patch({ date: '2026-03-08T00:00:00.000Z' })).status).toBe(400)
    expect(mocks.findFirst.mock.calls[0][0].where.account).toEqual({ userId: 'synthetic-owner' })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(storedDate).toEqual(originalDate)
  })
})
