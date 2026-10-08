import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { ok, unauthorized, serverError } from '@/lib/api-response'
import { getJobsByIds, getRecentJobs } from '@/lib/background-jobs'
import { logger } from '@/lib/log'

const QuerySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(10),
  ids: z.string().optional().transform((s) => s ? s.split(',').filter(Boolean).slice(0, 20) : undefined),
})

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { searchParams } = new URL(request.url)
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams))
    const { limit, ids } = parsed.success ? parsed.data : { limit: 10, ids: undefined }

    const jobs = ids ? await getJobsByIds(userId, ids) : await getRecentJobs(userId, limit)
    return ok(jobs)
  } catch (err) {
    logger.error('jobs-recent', 'error', { message: err instanceof Error ? err.message : String(err) })
    return serverError('Failed to fetch recent jobs')
  }
}
