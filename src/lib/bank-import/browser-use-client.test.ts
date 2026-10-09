import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserUseError, createBrowser, stopBrowser } from './browser-use-client'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubEnv('BROWSER_USE_API_KEY_US', 'us-test-key')
  vi.stubEnv('BROWSER_USE_API_KEY_EU', 'eu-test-key')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => vi.unstubAllEnvs())

describe('Browser Use REST client', () => {
  it('creates a browser in the selected region with the expected headers and options', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'browser-1', status: 'RUNNING' }), { status: 200 }))

    await createBrowser('eu', {
      profileId: 'profile-1', proxyCountryCode: 'de', timeoutMinutes: 20, record: false, metadata: { app: 'backoffice' },
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.eu.browser-use.com/api/v4/browsers')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('X-Browser-Use-API-Key')).toBe('eu-test-key')
    expect(init.body).toContain('"proxyCountryCode":"de"')
    expect(init.body).toContain('"timeout":20')
  })

  it('stops a browser with PATCH', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await stopBrowser('us', 'abc')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.browser-use.com/api/v4/browsers/abc')
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe('{"action":"stop"}')
  })

  it('throws a sanitized BrowserUseError for provider failures', async () => {
    fetchMock.mockResolvedValueOnce(new Response('private response body', { status: 402 }))

    let caught: unknown
    try {
      await createBrowser('us', {
        profileId: null, proxyCountryCode: 'us', timeoutMinutes: 20, record: false, metadata: {},
      })
    } catch (error) { caught = error }
    expect(caught).toBeInstanceOf(BrowserUseError)
    expect(caught).toMatchObject({ status: 402 })
    expect((caught as Error).message).toBe('Browser Use request failed with status 402')
    expect((caught as Error).message).not.toContain('private response body')
  })

  it('fails without making a request when the region key is missing', async () => {
    vi.stubEnv('BROWSER_USE_API_KEY_US', '')
    await expect(stopBrowser('us', 'abc')).rejects.toThrow('BROWSER_USE_API_KEY_US')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('exposes provider status on the error without leaking provider details', () => {
    const error = new BrowserUseError(429, 'Browser Use request failed with status 429')
    expect(error.status).toBe(429)
    expect(error.message).not.toContain('http')
  })
})
