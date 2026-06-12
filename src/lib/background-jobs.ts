import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { runRulesAgentInBackground } from '@/lib/agent/run-rules-agent'
import { matchInvoicePayments } from '@/lib/invoice-matching'
import { matchReceiptTransactions } from '@/lib/receipt-matching'

export type JobType = 'rules-agent' | 'invoice-matching' | 'receipt-matching'

export type JobPayload = {
  'rules-agent': { userId: string }
  'invoice-matching': { userId: string; importedIds: string[] }
  'receipt-matching': { userId: string; importedIds: string[] }
}

const MAX_ATTEMPTS = 3

/**
 * Enqueue a background job. Inserts a PENDING row and optionally kicks an
 * immediate in-process drain (best-effort, keeps current latency characteristics).
 */
export async function enqueueJob<T extends JobType>(
  type: T,
  userId: string,
  payload: JobPayload[T],
): Promise<string> {
  const job = await prisma.backgroundJob.create({
    data: {
      userId,
      type,
      payload: payload as unknown as Prisma.InputJsonValue,
      status: 'PENDING',
    },
  })

  // Best-effort immediate drain — don't await, don't block the response.
  // If the machine suspends before this resolves, the cron drain will pick it up.
  drainSingleJob(job.id).catch((err) => {
    console.error(`[bg-jobs] immediate drain failed for ${job.id}:`, err instanceof Error ? err.message : err)
  })

  return job.id
}

/**
 * Claim and execute a single job by ID (best-effort, used for immediate drain).
 */
async function drainSingleJob(jobId: string): Promise<void> {
  const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } })
  if (!job || job.status !== 'PENDING') return
  await executeJob(job)
}

/**
 * Claim and execute all PENDING jobs (used by the cron drain endpoint).
 * Uses atomic claim via raw SQL with FOR UPDATE SKIP LOCKED.
 */
export async function drainPendingJobs(): Promise<{ processed: number; failed: number }> {
  const claimed = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "BackgroundJob"
    SET status = 'RUNNING', "startedAt" = NOW()
    WHERE id = (
      SELECT id FROM "BackgroundJob"
      WHERE status = 'PENDING' AND attempts < ${MAX_ATTEMPTS}
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `

  if (claimed.length === 0) {
    return { processed: 0, failed: 0 }
  }

  const jobId = claimed[0].id
  const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } })
  if (!job) return { processed: 0, failed: 0 }

  try {
    await executeJob(job)
    return { processed: 1, failed: 0 }
  } catch {
    return { processed: 0, failed: 1 }
  }
}

/**
 * Execute a single job based on its type.
 */
async function executeJob(job: {
  id: string
  type: string
  payload: unknown
  attempts: number
}): Promise<void> {
  const payload = job.payload as Record<string, unknown>

  try {
    switch (job.type) {
      case 'rules-agent': {
        const userId = payload.userId as string
        await runRulesAgentInBackground(userId)
        break
      }
      case 'invoice-matching': {
        const userId = payload.userId as string
        const importedIds = payload.importedIds as string[]
        await matchInvoicePayments(userId, importedIds)
        break
      }
      case 'receipt-matching': {
        const userId = payload.userId as string
        const importedIds = payload.importedIds as string[]
        await matchReceiptTransactions(userId, importedIds)
        break
      }
      default:
        throw new Error(`Unknown job type: ${job.type}`)
    }

    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: { status: 'DONE', completedAt: new Date() },
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    const newAttempts = job.attempts + 1
    const newStatus = newAttempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING'

    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: newStatus,
        attempts: newAttempts,
        lastError: errorMessage,
      },
    })

    if (newStatus === 'FAILED') {
      console.error(`[bg-jobs] job ${job.id} (${job.type}) failed after ${newAttempts} attempts:`, errorMessage)
    }
  }
}

/**
 * Get recent jobs for a user (for status polling in the UI).
 */
export async function getRecentJobs(userId: string, limit = 10) {
  return prisma.backgroundJob.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      type: true,
      status: true,
      attempts: true,
      lastError: true,
      createdAt: true,
      completedAt: true,
    },
  })
}
