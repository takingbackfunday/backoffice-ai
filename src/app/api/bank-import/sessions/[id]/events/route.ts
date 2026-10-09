import { auth } from '@clerk/nextjs/server'
import { notFound, unauthorized } from '@/lib/api-response'
import { bankImportEnabled, bankImportEnabledForUser } from '@/lib/bank-import/flags'
import { TERMINAL_STATUSES } from '@/lib/bank-import/status'
import { appendTrace, SNAPSHOT_INCLUDE, toSnapshot } from '@/lib/bank-import/sessions'
import { wakeWorker } from '@/lib/bank-import/wake-worker'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!bankImportEnabled()) return notFound()
  const { userId } = await auth()
  if (!userId) return unauthorized()
  if (!bankImportEnabledForUser(userId)) return notFound()
  const { id } = await params
  const owned = await prisma.bankImportSession.findFirst({ where: { id, userId }, select: { id: true } })
  if (!owned) return notFound('Import session not found')

  const url = new URL(request.url)
  const requestedAfter = Number(url.searchParams.get('after') ?? request.headers.get('last-event-id') ?? 0)
  let after = Number.isSafeInteger(requestedAfter) && requestedAfter > 0 ? requestedAfter : 0
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        const deadline = Date.now() + 5 * 60_000
        let lastWake = 0
        let lastPing = 0
        let lastSnapshotKey = ''
        try {
          while (!request.signal.aborted && Date.now() < deadline) {
            const events = await prisma.bankImportEvent.findMany({
              where: { sessionId: id, id: { gt: after } },
              orderBy: { id: 'asc' },
              take: 100,
            })
            for (const event of events) {
              after = event.id
              controller.enqueue(encoder.encode(`id: ${event.id}\ndata: ${JSON.stringify({ type: 'event', event })}\n\n`))
            }

            const row = await prisma.bankImportSession.findUnique({ where: { id }, include: SNAPSHOT_INCLUDE })
            if (!row) break
            const snapshot = toSnapshot(row)
            const key = `${snapshot.status}|${snapshot.needsUserReason ?? ''}|${snapshot.updatedAt}|${snapshot.artifacts.length}`
            if (key !== lastSnapshotKey) {
              lastSnapshotKey = key
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'snapshot', session: snapshot })}\n\n`))
            }

            if (snapshot.status === 'QUEUED' && Date.now() - lastWake >= 15_000) {
              lastWake = Date.now()
              wakeWorker(id)
            }
            if (TERMINAL_STATUSES.has(snapshot.status) || snapshot.status === 'CAPTURED') {
              controller.enqueue(encoder.encode('data: {"type":"end"}\n\n'))
              break
            }
            if (Date.now() - lastPing >= 15_000) {
              lastPing = Date.now()
              controller.enqueue(encoder.encode(': ping\n\n'))
            }
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }
        } catch {
          await appendTrace(id, 'session.state', 'event', { outcome: 'error', errorCode: 'internal' }).catch(() => {})
        } finally {
          try { controller.close() } catch { /* stream may already be cancelled */ }
        }
      })()
    },
    cancel() {},
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
