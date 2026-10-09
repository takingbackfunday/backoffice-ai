import { createHash } from 'crypto'
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/log'
import { getBank } from './banks'
import { mimeFromFilename } from './mime'
import { BROWSER_LIVE_STATUSES, canTransition, TERMINAL_STATUSES, type BankImportCommandType, type BankImportStatusValue } from './status'
import { sanitizeTraceFields, type TraceFields, type TraceName, type TracePhase } from './trace'

export type BankImportEventType = 'status' | 'action' | 'warning' | 'artifact' | 'error' | 'trace'
export type { TraceFields, TraceName, TracePhase }

export const SESSION_TTL_MS = 20 * 60_000
export const REVIEW_TTL_MS = 24 * 60 * 60_000
export const ARTIFACT_RETENTION_MS = 7 * 24 * 60 * 60_000
export const TRACE_RETENTION_MS = 30 * 24 * 60 * 60_000
export const QUEUE_TIMEOUT_MS = 3 * 60_000
export const HEARTBEAT_STALE_MS = 90_000

export async function appendEvent(
  sessionId: string,
  type: BankImportEventType,
  message: string,
  data: Record<string, unknown> = {},
) {
  return prisma.bankImportEvent.create({
    data: { sessionId, type, message: message.slice(0, 300), data: data as Prisma.InputJsonObject },
  })
}

export async function appendTrace(sessionId: string, name: TraceName, phase: TracePhase, fields: TraceFields = {}) {
  const at = new Date().toISOString()
  const data = { traceId: sessionId, name, phase, at, ...sanitizeTraceFields(fields) }
  await appendEvent(sessionId, 'trace', name, data)
  logger.info('bank-import', 'trace', data)
}

export async function getLastTxnDate(accountId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ last: string | null }[]>`
    SELECT to_char(MAX(t."date"), 'YYYY-MM-DD') AS last FROM "Transaction" t WHERE t."accountId" = ${accountId}`
  return rows[0]?.last ?? null
}

export async function getLastTxnDatesForUser(userId: string): Promise<Map<string, string>> {
  const rows = await prisma.$queryRaw<{ accountId: string; last: string | null }[]>`
    SELECT t."accountId" AS "accountId", to_char(MAX(t."date"), 'YYYY-MM-DD') AS last
    FROM "Transaction" t JOIN "Account" a ON a.id = t."accountId"
    WHERE a."userId" = ${userId} GROUP BY t."accountId"`
  return new Map(rows.flatMap((row) => row.last ? [[row.accountId, row.last] as const] : []))
}

export async function claimNextSession(workerId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "BankImportSession"
    SET status = 'STARTING', "workerId" = ${workerId}, "heartbeatAt" = NOW(), "startedAt" = NOW(), "updatedAt" = NOW()
    WHERE id = (
      SELECT id FROM "BankImportSession"
      WHERE status = 'QUEUED' AND "expiresAt" > NOW()
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`
  const sessionId = rows[0]?.id
  if (!sessionId) return null
  await appendTrace(sessionId, 'session.state', 'event', { workerId, sessionStatus: 'STARTING', outcome: 'ok' }).catch(() => {})
  return sessionId
}

export async function heartbeat(sessionId: string, workerId: string): Promise<void> {
  await prisma.bankImportSession.updateMany({ where: { id: sessionId, workerId }, data: { heartbeatAt: new Date() } })
}

export async function transition(
  sessionId: string,
  from: BankImportStatusValue,
  to: BankImportStatusValue,
  patch: Prisma.BankImportSessionUpdateManyMutationInput = {},
  message?: string,
  traceFields: TraceFields = {},
): Promise<void> {
  if (!canTransition(from, to)) throw new Error('Invalid transition')
  const data: Prisma.BankImportSessionUpdateManyMutationInput = { status: to, ...patch }
  if (TERMINAL_STATUSES.has(to) || to === 'CAPTURED') data.liveUrlEnc = null
  if (TERMINAL_STATUSES.has(to)) data.finishedAt = new Date()
  const result = await prisma.bankImportSession.updateMany({ where: { id: sessionId, status: from }, data })
  if (result.count === 0) throw new Error('Session changed state concurrently')
  if (message) await appendEvent(sessionId, 'status', message, { status: to })
  await appendTrace(sessionId, 'session.state', 'event', { ...traceFields, sessionStatus: to, outcome: 'ok' }).catch(() => {})
}

export async function takeCommands(sessionId: string): Promise<BankImportCommandType[]> {
  const commands = await prisma.bankImportCommand.findMany({
    where: { sessionId, consumedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, type: true },
  })
  if (commands.length === 0) return []
  await prisma.bankImportCommand.updateMany({
    where: { id: { in: commands.map((command) => command.id) }, consumedAt: null },
    data: { consumedAt: new Date() },
  })
  return commands.map((command) => command.type as BankImportCommandType)
}

export async function saveArtifact(
  sessionId: string,
  file: { filename: string; mimeType: string; bytes: Buffer },
): Promise<{ id: string; duplicate: boolean }> {
  const sha256 = createHash('sha256').update(file.bytes).digest('hex')
  try {
    const artifact = await prisma.bankImportArtifact.create({
      data: {
        sessionId,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.bytes.byteLength,
        sha256,
        content: new Uint8Array(file.bytes),
      },
      select: { id: true },
    })
    return { id: artifact.id, duplicate: false }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.bankImportArtifact.findUnique({
        where: { sessionId_sha256: { sessionId, sha256 } },
        select: { id: true },
      })
      if (existing) return { id: existing.id, duplicate: true }
    }
    throw error
  }
}

export { mimeFromFilename }

async function transitionDuringSweep(
  session: { id: string; status: BankImportStatusValue },
  to: BankImportStatusValue,
  errorCode: string | undefined,
  message: string,
): Promise<boolean> {
  try {
    await transition(session.id, session.status, to, errorCode ? { errorCode } : {}, message)
    return true
  } catch (error) {
    if (error instanceof Error && error.message === 'Session changed state concurrently') return false
    throw error
  }
}

export async function sweep(): Promise<{ browsersToStop: { region: string; id: string }[] }> {
  const now = new Date()
  const browsersToStop = new Map<string, { region: string; id: string }>()
  const activeStatuses: BankImportStatusValue[] = ['QUEUED', 'STARTING', 'AWAITING_LOGIN', 'NAVIGATING', 'NEEDS_USER']

  const staleQueued = await prisma.bankImportSession.findMany({
    where: { status: 'QUEUED', createdAt: { lt: new Date(now.getTime() - QUEUE_TIMEOUT_MS) } },
    select: { id: true, status: true },
  })
  for (const session of staleQueued) {
    await transitionDuringSweep(session, 'FAILED', 'worker_unavailable', "The import service didn't start.")
  }

  const staleWorkers = await prisma.bankImportSession.findMany({
    where: {
      status: { in: ['STARTING', 'AWAITING_LOGIN', 'NAVIGATING', 'NEEDS_USER'] },
      heartbeatAt: { lt: new Date(now.getTime() - HEARTBEAT_STALE_MS) },
    },
    select: { id: true, status: true, browserRegion: true, browserId: true },
  })
  for (const session of staleWorkers) {
    const changed = await transitionDuringSweep(session, 'FAILED', 'worker_lost', 'The import service restarted. Please try again.')
    if (changed && session.browserRegion && session.browserId) {
      browsersToStop.set(session.browserId, { region: session.browserRegion, id: session.browserId })
    }
  }

  const expiredActive = await prisma.bankImportSession.findMany({
    where: { status: { in: activeStatuses }, expiresAt: { lt: now } },
    select: { id: true, status: true, browserRegion: true, browserId: true },
  })
  for (const session of expiredActive) {
    const changed = await transitionDuringSweep(session, 'EXPIRED', 'session_timeout', 'This import session timed out.')
    if (changed && session.browserRegion && session.browserId) {
      browsersToStop.set(session.browserId, { region: session.browserRegion, id: session.browserId })
    }
  }

  const expiredCaptured = await prisma.bankImportSession.findMany({
    where: { status: 'CAPTURED', expiresAt: { lt: now } },
    select: { id: true, status: true },
  })
  for (const session of expiredCaptured) {
    await transitionDuringSweep(session, 'EXPIRED', 'session_timeout', 'This unreviewed import expired.')
  }

  await prisma.bankImportArtifact.updateMany({
    where: { createdAt: { lt: new Date(now.getTime() - ARTIFACT_RETENTION_MS) }, content: { not: null } },
    data: { content: null, purgedAt: now },
  })
  await prisma.bankImportEvent.deleteMany({
    where: { type: 'trace', createdAt: { lt: new Date(now.getTime() - TRACE_RETENTION_MS) } },
  })

  return { browsersToStop: [...browsersToStop.values()] }
}

export const SNAPSHOT_INCLUDE = {
  account: { include: { institution: true } },
  artifacts: { select: { id: true, filename: true, mimeType: true, sizeBytes: true, purgedAt: true, createdAt: true } },
} as const

type SnapshotRow = Prisma.BankImportSessionGetPayload<{ include: typeof SNAPSHOT_INCLUDE }>

export interface SessionSnapshot {
  id: string
  status: BankImportStatusValue
  needsUserReason: string | null
  bankKey: string
  bankName: string
  accountId: string
  accountName: string
  dateFrom: string
  dateTo: string
  errorCode: string | null
  errorMessage: string | null
  hasLiveView: boolean
  artifacts: { id: string; filename: string; mimeType: string; sizeBytes: number; purged: boolean }[]
  createdAt: string
  startedAt: string | null
  capturedAt: string | null
  updatedAt: string
}

export function toSnapshot(row: SnapshotRow): SessionSnapshot {
  return {
    id: row.id,
    status: row.status,
    needsUserReason: row.needsUserReason,
    bankKey: row.bankKey,
    bankName: getBank(row.bankKey)?.displayName ?? row.bankKey,
    accountId: row.accountId,
    accountName: row.account.name,
    dateFrom: row.dateFrom,
    dateTo: row.dateTo,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    hasLiveView: !!row.liveUrlEnc && BROWSER_LIVE_STATUSES.has(row.status),
    artifacts: row.artifacts.map((artifact) => ({
      id: artifact.id,
      filename: artifact.filename,
      mimeType: artifact.mimeType,
      sizeBytes: artifact.sizeBytes,
      purged: artifact.purgedAt !== null,
    })),
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    capturedAt: row.capturedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }
}
