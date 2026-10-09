import { describe, expect, it } from 'vitest'
import { classifyRoute, sanitizeTraceFields, sanitizeTraceRecord } from './trace'

describe('sanitizeTraceFields', () => {
  it('keeps bounded diagnostic fields and drops arbitrary or sensitive fields', () => {
    const fields = sanitizeTraceFields({
      stepIndex: 2,
      navigationMode: 'replay',
      intent: 'open_export_options',
      routeAfter: 'export',
      durationMs: 420,
      errorCode: 'internal',
      accountName: 'Personal Checking',
      pageText: 'My payee and balance',
      liveViewUrl: 'https://live.browser-use.com/?token=secret',
      filename: 'account-statement.csv',
      prompt: 'password: secret',
      errorMessage: 'https://bank.example/account/12345678',
      count: -1,
      extra: { token: 'hidden' },
    })

    expect(fields).toEqual({
      stepIndex: 2,
      navigationMode: 'replay',
      intent: 'open_export_options',
      routeAfter: 'export',
      durationMs: 420,
      errorCode: 'internal',
    })
    expect(JSON.stringify(fields)).not.toMatch(/Personal Checking|payee|balance|live\.browser-use|statement\.csv|password|12345678|hidden/)
  })

  it('rejects sensitive values even when placed in an allowed field', () => {
    expect(sanitizeTraceFields({ errorCode: 'password=secret' })).toEqual({})
    expect(sanitizeTraceFields({ workerId: 'my worker with secret' })).toEqual({})
    expect(sanitizeTraceFields({ providerStatus: 700 })).toEqual({})
  })
})

describe('classifyRoute', () => {
  it.each([
    ['chase', 'https://secure.chase.com/web/auth/logon?user=123#/login', 'login'],
    ['chase', 'https://secure.chase.com/web/auth/dashboard#/dashboard', 'dashboard'],
    ['chase', 'https://secure.chase.com/accounts/activity/123?account=456', 'activity'],
    ['n26', 'https://app.n26.com/account/export?token=secret#/download', 'export'],
    ['n26', 'https://app.n26.com/feed', 'dashboard'],
    ['n26', 'https://evil.example/login?secret=yes', 'other'],
    ['chase', 'https://secure.chase.com/private/12345?secret=yes#balance', 'other'],
  ] as const)('classifies a route without exposing its URL: %s', (bank, url, expected) => {
    const route = classifyRoute(bank, url)
    expect(route).toBe(expected)
    expect(JSON.stringify(route)).not.toMatch(/https|123|secret|balance/)
  })
})

describe('sanitizeTraceRecord', () => {
  it('preserves the trace envelope and drops unsafe payload fields', () => {
    expect(sanitizeTraceRecord({
      traceId: 'session_123', name: 'navigation.step', phase: 'end', at: '2026-10-08T12:00:00.000Z',
      outcome: 'ok', elementIndex: 2, pageText: 'private bank balance',
    })).toEqual({
      traceId: 'session_123', name: 'navigation.step', phase: 'end', at: '2026-10-08T12:00:00.000Z',
      outcome: 'ok', elementIndex: 2,
    })
  })

  it('rejects invalid trace envelopes', () => {
    expect(sanitizeTraceRecord({ traceId: 'session', name: 'unknown', phase: 'event', at: '2026-10-08' })).toBeNull()
    expect(sanitizeTraceRecord({ traceId: 'session', name: 'session.created', phase: 'event', at: 'not-a-date' })).toBeNull()
  })
})
