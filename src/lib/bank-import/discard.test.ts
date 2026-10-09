import { afterEach, describe, expect, it, vi } from 'vitest'
import { discardBankImportSession } from './discard'

afterEach(() => vi.unstubAllGlobals())

describe('discardBankImportSession', () => {
  it('sends an owner-authenticated cancellation and waits for acceptance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { accepted: true }, error: null })))
    vi.stubGlobal('fetch', fetchMock)

    await discardBankImportSession('session/with spaces')

    expect(fetchMock).toHaveBeenCalledWith('/api/bank-import/sessions/session%2Fwith%20spaces/commands', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'CANCEL' }), cache: 'no-store',
    })
  })

  it.each([
    { status: 409, body: { error: 'Session changed state' } },
    { status: 401, body: { error: 'Unauthorized' } },
    { status: 200, body: { data: { accepted: false } } },
    { status: 200, body: { data: { accepted: true }, error: 'Failed' } },
    { status: 200, body: {} },
  ])('does not accept an unsuccessful cancellation ($status)', async ({ status, body }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })))
    await expect(discardBankImportSession('session')).rejects.toThrow('Could not discard the bank download. Please try again.')
  })

  it('normalizes malformed responses and network errors', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('<html>error</html>'))
      .mockRejectedValueOnce(new Error('Sensitive network details'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(discardBankImportSession('session')).rejects.toThrow('Could not discard the bank download. Please try again.')
    await expect(discardBankImportSession('session')).rejects.toThrow('Could not discard the bank download. Please try again.')
  })
})
