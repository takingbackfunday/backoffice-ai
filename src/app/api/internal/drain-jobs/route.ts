import { ok, badRequest, serverError } from '@/lib/api-response'
import { drainPendingJobs } from '@/lib/background-jobs'

const MAX_BATCH = 5

export async function POST(request: Request) {
  const secret = request.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.INTERNAL_CRON_SECRET) {
    return badRequest('Invalid or missing cron secret')
  }

  try {
    let totalProcessed = 0
    let totalFailed = 0

    // Drain up to MAX_BATCH jobs per invocation to avoid long-running requests
    for (let i = 0; i < MAX_BATCH; i++) {
      const result = await drainPendingJobs()
      totalProcessed += result.processed
      totalFailed += result.failed

      // Stop early if no more pending jobs
      if (result.processed === 0 && result.failed === 0) break
    }

    return ok({
      processed: totalProcessed,
      failed: totalFailed,
      message: `Drained ${totalProcessed} job(s), ${totalFailed} failed`,
    })
  } catch (err) {
    console.error('drain-jobs error:', err)
    return serverError('Failed to drain background jobs')
  }
}
