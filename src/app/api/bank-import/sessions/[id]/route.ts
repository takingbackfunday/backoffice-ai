import { z } from 'zod'
import { authedRoute } from '@/lib/api-handler'
import { notFound, ok } from '@/lib/api-response'
import { requireBankImportSession } from '@/lib/bank-import/authz'
import { toSnapshot } from '@/lib/bank-import/sessions'
import { bankImportEnabledForUser, withBankImportFlag } from '@/lib/bank-import/flags'

const ParamsSchema = z.object({ id: z.string().min(1) })

export const GET = withBankImportFlag(authedRoute<{ id: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    if (!bankImportEnabledForUser(userId)) return notFound()
    return ok(toSnapshot(await requireBankImportSession(userId, params.id)))
  },
}))
