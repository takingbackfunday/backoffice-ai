import type { BrowserRegion } from './banks'

const BASE: Record<BrowserRegion, string> = {
  us: 'https://api.browser-use.com/api/v4',
  eu: 'https://api.eu.browser-use.com/api/v4',
}

export class BrowserUseError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'BrowserUseError'
  }
}

function apiKey(region: BrowserRegion): string {
  const key = region === 'eu' ? process.env.BROWSER_USE_API_KEY_EU : process.env.BROWSER_USE_API_KEY_US
  if (!key) throw new Error(`BROWSER_USE_API_KEY_${region.toUpperCase()} is not set`)
  return key
}

async function call<T>(region: BrowserRegion, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE[region]}${path}`, {
    ...init,
    headers: { 'X-Browser-Use-API-Key': apiKey(region), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    throw new BrowserUseError(response.status, `Browser Use request failed with status ${response.status}`)
  }
  if (response.status === 204) return undefined as T
  const body = await response.text()
  return (body ? JSON.parse(body) : undefined) as T
}

export interface CloudBrowser { id: string; status: string; liveUrl: string | null; cdpUrl: string | null; timeoutAt: string }
export interface CloudDownload { path: string; size: number; lastModified: string; url?: string | null }

export function createBrowser(region: BrowserRegion, opts: {
  profileId: string | null
  proxyCountryCode: 'us' | 'de'
  timeoutMinutes: number
  record: boolean
  metadata: Record<string, string>
}): Promise<CloudBrowser> {
  return call<CloudBrowser>(region, '/browsers', {
    method: 'POST',
    body: JSON.stringify({
      profileId: opts.profileId,
      proxyCountryCode: opts.proxyCountryCode,
      timeout: opts.timeoutMinutes,
      enableRecording: opts.record,
      metadata: opts.metadata,
      browserScreenWidth: 1280,
      browserScreenHeight: 800,
    }),
  })
}

export async function stopBrowser(region: BrowserRegion, id: string): Promise<void> {
  await call(region, `/browsers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ action: 'stop' }) })
}

export async function listDownloads(region: BrowserRegion, id: string): Promise<CloudDownload[]> {
  const response = await call<{ files: CloudDownload[] }>(region, `/browsers/${encodeURIComponent(id)}/downloads?includeUrls=true&limit=100`)
  return response?.files ?? []
}

export function createProfile(region: BrowserRegion, opts: { name: string; userId: string }): Promise<{ id: string }> {
  return call<{ id: string }>(region, '/profiles', { method: 'POST', body: JSON.stringify(opts) })
}

export async function deleteProfile(region: BrowserRegion, id: string): Promise<void> {
  await call(region, `/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
