import { z } from 'zod'
import { authedRoute } from '@/lib/api-handler'
import { fetchClientDetail } from '@/lib/studio-kpis'
import { ok } from '@/lib/api-response'

const ParamsSchema = z.object({ clientProfileId: z.string() })

export const GET = authedRoute<z.infer<typeof ParamsSchema>>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    const detail = await fetchClientDetail(userId, params.clientProfileId)
    return ok(detail)
  },
})
