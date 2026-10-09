import { beforeEach, describe, expect, it, vi } from 'vitest'

const { takeCommands } = vi.hoisted(() => ({ takeCommands: vi.fn() }))

vi.mock('@/lib/bank-import/sessions', () => ({
  appendEvent: vi.fn(),
  appendTrace: vi.fn(),
  takeCommands,
  transition: vi.fn(),
}))
vi.mock('@/lib/log', () => ({ logger: { warn: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ prisma: { bankImportSession: { update: vi.fn() } } }))

import { pollTakeover, SessionContext } from './session-context'

describe('pollTakeover', () => {
  beforeEach(() => takeCommands.mockReset())

  it('polls the durable queue before checking for takeover', async () => {
    takeCommands.mockResolvedValue(['TAKEOVER'])
    const context = new SessionContext('session', 'user', 'worker', 'NAVIGATING', Date.now() + 60_000)

    await expect(pollTakeover(context)).resolves.toBe(true)
    expect(takeCommands).toHaveBeenCalledWith('session')
    expect(context.take('TAKEOVER')).toBe(false)
  })

  it('coalesces rapid repeated takeover clicks into one pause', async () => {
    takeCommands.mockResolvedValueOnce(['TAKEOVER', 'TAKEOVER', 'TAKEOVER']).mockResolvedValueOnce([])
    const context = new SessionContext('session', 'user', 'worker', 'NAVIGATING', Date.now() + 60_000)

    await expect(pollTakeover(context)).resolves.toBe(true)
    await expect(pollTakeover(context)).resolves.toBe(false)
  })

  it('leaves unrelated commands pending while polling for takeover', async () => {
    takeCommands.mockResolvedValue(['RESUME_AGENT', 'TAKEOVER'])
    const context = new SessionContext('session', 'user', 'worker', 'NAVIGATING', Date.now() + 60_000)

    await expect(pollTakeover(context)).resolves.toBe(true)
    expect(context.take('RESUME_AGENT')).toBe(true)
  })

  it('propagates cancellation while polling', async () => {
    takeCommands.mockResolvedValue(['CANCEL', 'TAKEOVER'])
    const context = new SessionContext('session', 'user', 'worker', 'NAVIGATING', Date.now() + 60_000)

    await expect(pollTakeover(context)).rejects.toBeInstanceOf(Error)
  })
})
