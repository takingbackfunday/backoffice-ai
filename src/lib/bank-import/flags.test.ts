import { NextResponse } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bankImportEnabledForUser, withBankImportFlag } from './flags'

afterEach(() => vi.unstubAllEnvs())

describe('withBankImportFlag', () => {
  it('returns 404 before invoking the protected handler when disabled', async () => {
    vi.stubEnv('BANK_IMPORT_ENABLED', '0')
    const handler = vi.fn(async () => NextResponse.json({ ok: true }))
    const response = await withBankImportFlag(handler)(new Request('https://app.test/api/bank-import'))
    expect(response.status).toBe(404)
    expect(handler).not.toHaveBeenCalled()
  })

  it('delegates to the handler when enabled', async () => {
    vi.stubEnv('BANK_IMPORT_ENABLED', '1')
    const handler = vi.fn(async () => NextResponse.json({ ok: true }))
    const response = await withBankImportFlag(handler)(new Request('https://app.test/api/bank-import'))
    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('restricts production QA to the configured Clerk IDs', () => {
    vi.stubEnv('BANK_IMPORT_ENABLED', '1')
    vi.stubEnv('BANK_IMPORT_ENABLED_USER_IDS', 'user_1, user_2')
    expect(bankImportEnabledForUser('user_1')).toBe(true)
    expect(bankImportEnabledForUser('user_3')).toBe(false)
  })

  it('allows all users when the allowlist is empty', () => {
    vi.stubEnv('BANK_IMPORT_ENABLED', '1')
    vi.stubEnv('BANK_IMPORT_ENABLED_USER_IDS', '')
    expect(bankImportEnabledForUser('any-user')).toBe(true)
  })
})
