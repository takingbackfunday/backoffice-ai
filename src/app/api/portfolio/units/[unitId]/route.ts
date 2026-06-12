import { z } from 'zod'
import { authedRoute } from '@/lib/api-handler'
import { fetchUnitDetail } from '@/lib/studio-kpis'
import { ok } from '@/lib/api-response'

const ParamsSchema = z.object({ unitId: z.string() })

export const GET = authedRoute<z.infer<typeof ParamsSchema>>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    const detail = await fetchUnitDetail(userId, params.unitId)
    return ok(detail)
  },
})
