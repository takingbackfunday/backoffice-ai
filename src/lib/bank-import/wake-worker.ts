import { logger } from '@/lib/log'
import { appendTrace } from './sessions'

/** Fire-and-forget. Fly's proxy auto-starts the stopped worker machine on this request. */
export function wakeWorker(sessionId: string): void {
  const url = process.env.WORKER_WAKE_URL
  if (!url) {
    void appendTrace(sessionId, 'worker.wake', 'event', { outcome: 'ignored', errorCode: 'worker_unavailable' }).catch(() => {})
    return
  }
  const startedAt = Date.now()
  void appendTrace(sessionId, 'worker.wake', 'start', {}).catch(() => {})
  fetch(url, {
    method: 'POST',
    headers: { 'x-worker-secret': process.env.INTERNAL_CRON_SECRET ?? '' },
    signal: AbortSignal.timeout(25_000),
  }).then((response) => {
    const fields = { providerStatus: response.status, outcome: response.ok ? 'ok' as const : 'error' as const, durationMs: Date.now() - startedAt }
    void appendTrace(sessionId, 'worker.wake', 'end', fields).catch(() => {
      logger.warn('bank-import', 'worker wake trace failed', { traceId: sessionId, errorCode: 'internal' })
    })
  }).catch(() => {
    void appendTrace(sessionId, 'worker.wake', 'end', {
      outcome: 'error', errorCode: 'worker_unavailable', durationMs: Date.now() - startedAt,
    }).catch(() => logger.warn('bank-import', 'worker wake trace failed', { traceId: sessionId, errorCode: 'internal' }))
  })
}
