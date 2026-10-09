import { basename } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import type { BankConfig } from '@/lib/bank-import/banks'
import { BrowserUseError, createBrowser, listDownloads, stopBrowser } from '@/lib/bank-import/browser-use-client'
import { mimeFromFilename } from '@/lib/bank-import/mime'
import type { TraceFields, TraceName, TracePhase } from '@/lib/bank-import/trace'
import { logger } from '@/lib/log'

export const MAX_FILE_BYTES = 20 * 1024 * 1024
export interface CapturedFile { name: string; bytes: Buffer }
export type TraceCallback = (name: TraceName, phase: TracePhase, fields?: TraceFields) => Promise<void>

export interface ProvidedBrowser {
  context: BrowserContext
  page: Page
  liveUrl: string | null
  browserId: string | null
  /** Returns only newly available files and never throws. */
  pollNewDownloads(): Promise<CapturedFile[]>
  close(): Promise<void>
}

export async function openBrowser(opts: {
  bank: BankConfig
  sessionId: string
  profileId: string | null
  record: boolean
  timeoutMinutes: number
  trace: TraceCallback
}): Promise<ProvidedBrowser> {
  return process.env.BANK_WORKER_LOCAL_BROWSER === '1' ? openLocal(opts) : openBrowserUse(opts)
}

async function openBrowserUse(opts: {
  bank: BankConfig
  sessionId: string
  profileId: string | null
  record: boolean
  timeoutMinutes: number
  trace: TraceCallback
}): Promise<ProvidedBrowser> {
  const createStarted = Date.now()
  await opts.trace('browser.create', 'start', { providerOperation: 'create_browser' })
  let cloud
  try {
    cloud = await createBrowser(opts.bank.region, {
      profileId: opts.profileId,
      proxyCountryCode: opts.bank.proxyCountryCode,
      timeoutMinutes: opts.timeoutMinutes,
      record: opts.record,
      metadata: { app: 'backoffice', sessionId: opts.sessionId },
    })
    await opts.trace('browser.create', 'end', { providerOperation: 'create_browser', outcome: 'ok', durationMs: Date.now() - createStarted })
  } catch (error) {
    await opts.trace('browser.create', 'end', {
      providerOperation: 'create_browser',
      providerStatus: error instanceof BrowserUseError ? error.status : undefined,
      outcome: 'error', errorCode: 'browser_start', durationMs: Date.now() - createStarted,
    })
    throw error
  }
  const connectStarted = Date.now()
  await opts.trace('browser.connect', 'start', {})
  if (!cloud.cdpUrl) {
    await opts.trace('browser.connect', 'end', { outcome: 'error', errorCode: 'browser_connect', durationMs: Date.now() - connectStarted })
    await stopCloudBrowser(opts.bank.region, cloud.id, opts.trace)
    throw new Error('Browser connection unavailable')
  }

  let browser: Browser
  try {
    browser = await chromium.connectOverCDP(cloud.cdpUrl, { timeout: 30_000 })
    await opts.trace('browser.connect', 'end', { outcome: 'ok', durationMs: Date.now() - connectStarted })
  } catch (error) {
    await opts.trace('browser.connect', 'end', { outcome: 'error', errorCode: 'browser_connect', durationMs: Date.now() - connectStarted })
    await stopCloudBrowser(opts.bank.region, cloud.id, opts.trace)
    throw error
  }

  const context = browser.contexts()[0]
  if (!context) {
    await browser.close().catch(() => {})
    await stopCloudBrowser(opts.bank.region, cloud.id, opts.trace)
    throw new Error('Browser context unavailable')
  }
  const page = context.pages()[0] ?? await context.newPage()
  const seen = new Set<string>()
  const seedStarted = Date.now()
  await opts.trace('download.poll', 'start', { providerOperation: 'list_downloads' })
  try {
    const initial = await listDownloads(opts.bank.region, cloud.id)
    initial.forEach((file) => seen.add(file.path))
    await opts.trace('download.poll', 'end', { providerOperation: 'list_downloads', outcome: 'ok', durationMs: Date.now() - seedStarted })
  } catch {
    await opts.trace('download.poll', 'end', { providerOperation: 'list_downloads', outcome: 'error', errorCode: 'download_failed', durationMs: Date.now() - seedStarted })
  }

  return {
    context,
    page,
    liveUrl: cloud.liveUrl,
    browserId: cloud.id,
    async pollNewDownloads() {
      const startedAt = Date.now()
      await opts.trace('download.poll', 'start', { providerOperation: 'list_downloads' })
      try {
        const files = await listDownloads(opts.bank.region, cloud.id)
        const captured: CapturedFile[] = []
        for (const file of files) {
          if (seen.has(file.path)) continue
          if (file.size > MAX_FILE_BYTES) {
            seen.add(file.path)
            await opts.trace('download.poll', 'event', {
              fileKind: fileKind(file.path), fileSizeBytes: file.size, outcome: 'ignored', errorCode: 'artifact_too_large',
            })
            continue
          }
          if (!file.url) continue
          const response = await fetch(file.url)
          if (!response.ok) {
            await response.body?.cancel().catch(() => {})
            await opts.trace('download.poll', 'event', { outcome: 'error', errorCode: 'download_failed' })
            continue
          }
          const bytes = Buffer.from(await response.arrayBuffer())
          seen.add(file.path)
          if (bytes.byteLength > MAX_FILE_BYTES) {
            await opts.trace('download.poll', 'event', {
              fileKind: fileKind(file.path), fileSizeBytes: bytes.byteLength, outcome: 'ignored', errorCode: 'artifact_too_large',
            })
            continue
          }
          captured.push({ name: basename(file.path.replace(/\\/g, '/')), bytes })
        }
        await opts.trace('download.poll', 'end', {
          providerOperation: 'list_downloads', outcome: 'ok', retryCount: 0, durationMs: Date.now() - startedAt,
        })
        return captured
      } catch {
        await opts.trace('download.poll', 'end', {
          providerOperation: 'list_downloads', outcome: 'error', errorCode: 'download_failed', durationMs: Date.now() - startedAt,
        })
        return []
      }
    },
    async close() {
      await browser.close().catch(() => {})
      await stopCloudBrowser(opts.bank.region, cloud.id, opts.trace)
    },
  }
}

async function openLocal(opts: { sessionId: string; trace: TraceCallback }): Promise<ProvidedBrowser> {
  const createStarted = Date.now()
  await opts.trace('browser.create', 'start', {})
  let browser: Browser
  let context: BrowserContext
  let page: Page
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: process.env.BANK_WORKER_HEADLESS === '1' })
    context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } })
    page = await context.newPage()
    await opts.trace('browser.create', 'end', { outcome: 'ok', durationMs: Date.now() - createStarted })
  } catch {
    await opts.trace('browser.create', 'end', { outcome: 'error', errorCode: 'browser_start', durationMs: Date.now() - createStarted })
    throw new Error('Local browser could not start')
  }
  const queue: CapturedFile[] = []
  const attach = (target: Page) => target.on('download', async (download) => {
    try {
      const stream = await download.createReadStream()
      if (!stream) return
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        size += buffer.byteLength
        if (size > MAX_FILE_BYTES) {
          stream.destroy()
          await opts.trace('download.poll', 'event', { fileKind: fileKind(download.suggestedFilename()), fileSizeBytes: size, outcome: 'ignored', errorCode: 'artifact_too_large' })
          return
        }
        chunks.push(buffer)
      }
      queue.push({ name: download.suggestedFilename(), bytes: Buffer.concat(chunks) })
    } catch {
      logger.warn('bank-import', 'local download capture failed', { traceId: opts.sessionId, errorCode: 'download_failed' })
      await opts.trace('download.poll', 'event', { outcome: 'error', errorCode: 'download_failed' })
    }
  })
  context.pages().forEach(attach)
  context.on('page', attach)
  return {
    context,
    page,
    liveUrl: null,
    browserId: null,
    async pollNewDownloads() { return queue.splice(0) },
    async close() {
      const stopStarted = Date.now()
      await opts.trace('browser.stop', 'start', {})
      try {
        await browser.close()
        await opts.trace('browser.stop', 'end', { outcome: 'ok', durationMs: Date.now() - stopStarted })
      } catch {
        await opts.trace('browser.stop', 'end', { outcome: 'error', errorCode: 'browser_stop', durationMs: Date.now() - stopStarted })
        throw new Error('Local browser could not close')
      }
    },
  }
}

function fileKind(name: string): TraceFields['fileKind'] {
  const mime = mimeFromFilename(name)
  if (mime === 'text/csv') return 'csv'
  if (mime === 'text/plain') return 'txt'
  if (mime.includes('spreadsheetml')) return 'xlsx'
  if (mime === 'application/vnd.ms-excel') return 'xls'
  if (mime === 'application/pdf') return 'pdf'
  return 'other'
}

async function stopCloudBrowser(region: BankConfig['region'], id: string, trace: TraceCallback): Promise<void> {
  const startedAt = Date.now()
  await trace('browser.stop', 'start', { providerOperation: 'stop_browser' })
  try {
    await stopBrowser(region, id)
    await trace('browser.stop', 'end', { providerOperation: 'stop_browser', outcome: 'ok', durationMs: Date.now() - startedAt })
  } catch (error) {
    await trace('browser.stop', 'end', {
      providerOperation: 'stop_browser',
      providerStatus: error instanceof BrowserUseError ? error.status : undefined,
      outcome: 'error', errorCode: 'browser_stop', durationMs: Date.now() - startedAt,
    })
    throw error
  }
}
