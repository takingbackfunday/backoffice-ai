import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { ok, unauthorized, serverError } from '@/lib/api-response'
import { getRecentJobs } from '@/lib/background-jobs'
import { logger } from '@/lib/log'

const QuerySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(10),
})

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { searchParams } = new URL(request.url)
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams))
    const { limit } = parsed.success ? parsed.data : { limit: 10 }

    const jobs = await getRecentJobs(userId, limit)
    return ok(jobs)
  } catch (err) {
    logger.error('jobs-recent', 'error', { message: err instanceof Error ? err.message : String(err) })
    return serverError('Failed to fetch recent jobs')
  }
}
