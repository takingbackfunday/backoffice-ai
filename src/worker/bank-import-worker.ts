import http from 'node:http'
import os from 'node:os'
import { prisma } from '@/lib/prisma'
import { stopBrowser } from '@/lib/bank-import/browser-use-client'
import { claimNextSession, sweep } from '@/lib/bank-import/sessions'
import type { BrowserRegion } from '@/lib/bank-import/banks'
import { logger } from '@/lib/log'
import { runSession } from './run-session'

const WORKER_ID = `${process.env.FLY_MACHINE_ID ?? os.hostname()}-${process.pid}`
const PORT = Number(process.env.BANK_WORKER_PORT ?? 8081)
const MAX_CONCURRENT = Number(process.env.BANK_WORKER_CONCURRENCY ?? 3)
const IDLE_EXIT_MS = Number(process.env.BANK_WORKER_IDLE_EXIT_MS ?? 600_000)
const LOOP_MS = 3000
const SWEEP_EVERY_MS = 30_000

const active = new Map<string, Promise<void>>()
let lastActivity = Date.now()
let lastSweep = 0
let shuttingDown = false
let ticking = false
let shutdownPromise: Promise<void> | null = null
let server: http.Server

async function tick(): Promise<void> {
  if (ticking || shuttingDown) return
  ticking = true
  try {
    if (Date.now() - lastSweep >= SWEEP_EVERY_MS) {
      lastSweep = Date.now()
      const result = await sweep()
      await Promise.all(result.browsersToStop.map(async (browser) => {
        try { await stopBrowser(browser.region as BrowserRegion, browser.id) } catch {
          logger.warn('bank-worker', 'orphan browser stop failed', { workerId: WORKER_ID, outcome: 'error', errorCode: 'browser_stop' })
        }
      }))
    }

    while (!shuttingDown && active.size < MAX_CONCURRENT) {
      const sessionId = await claimNextSession(WORKER_ID)
      if (!sessionId) break
      lastActivity = Date.now()
      const task = runSession(sessionId, WORKER_ID)
        .catch(() => {
          logger.error('bank-worker', 'session runner rejected', { traceId: sessionId, workerId: WORKER_ID, errorCode: 'internal' })
        })
        .finally(() => {
          active.delete(sessionId)
          lastActivity = Date.now()
        })
      active.set(sessionId, task)
    }
  } catch {
    logger.error('bank-worker', 'worker tick failed', { workerId: WORKER_ID, errorCode: 'internal' })
  } finally {
    ticking = false
  }

  if (IDLE_EXIT_MS > 0 && active.size === 0 && Date.now() - lastActivity > IDLE_EXIT_MS) {
    void shutdown(0)
  }
}

function shutdown(code: number): Promise<void> {
  if (shutdownPromise) return shutdownPromise
  shuttingDown = true
  shutdownPromise = (async () => {
    await new Promise<void>((resolve) => {
      if (!server?.listening) return resolve()
      server.close(() => resolve())
    })
    const sessions = Promise.allSettled([...active.values()]).then(() => {})
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 280_000))
    await Promise.race([sessions, timeout])
    await prisma.$disconnect().catch(() => {})
    process.exit(code)
  })()
  return shutdownPromise
}

function sendJson(response: http.ServerResponse, status: number, value: Record<string, unknown>): void {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  response.end(JSON.stringify(value))
}

function startServer(): void {
  server = http.createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://worker.local').pathname
    if (request.method === 'GET' && path === '/health') {
      sendJson(response, 200, { ok: true, active: active.size })
      return
    }
    if (request.method === 'POST' && path === '/wake') {
      const secret = process.env.INTERNAL_CRON_SECRET
      if (!secret || request.headers['x-worker-secret'] !== secret) {
        sendJson(response, 401, { ok: false })
        return
      }
      lastActivity = Date.now()
      sendJson(response, 202, { ok: true })
      void tick()
      return
    }
    sendJson(response, 404, { ok: false })
  })
  server.listen(PORT, '0.0.0.0', () => logger.info('bank-worker', 'worker started', { workerId: WORKER_ID, port: PORT }))
}

if (process.env.BROWSER_USE_API_KEY_US || process.env.BROWSER_USE_API_KEY_EU || process.env.BANK_WORKER_LOCAL_BROWSER === '1') {
  startServer()
  setInterval(() => { void tick() }, LOOP_MS)
  void tick()
} else {
  logger.error('bank-worker', 'browser provider is not configured', { workerId: WORKER_ID, errorCode: 'browser_start' })
  process.exit(1)
}

process.on('SIGTERM', () => { void shutdown(0) })
process.on('SIGINT', () => { void shutdown(0) })
