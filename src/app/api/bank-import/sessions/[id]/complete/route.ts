import { z } from 'zod'
import { authedRoute } from '@/lib/api-handler'
import { conflict, notFound, ok } from '@/lib/api-response'
import { requireBankImportSession } from '@/lib/bank-import/authz'
import { transition } from '@/lib/bank-import/sessions'
import { bankImportEnabledForUser, withBankImportFlag } from '@/lib/bank-import/flags'

const ParamsSchema = z.object({ id: z.string().min(1) })
const BodySchema = z.object({ imported: z.number().int().nonnegative(), skipped: z.number().int().nonnegative() })

export const POST = withBankImportFlag(authedRoute<{ id: string }, z.infer<typeof BodySchema>>({
  paramsSchema: ParamsSchema,
  bodySchema: BodySchema,
  handler: async ({ userId, params, body }) => {
    if (!bankImportEnabledForUser(userId)) return notFound()
    const session = await requireBankImportSession(userId, params.id)
    if (session.status === 'COMPLETE') return ok({ completed: true })
    if (session.status !== 'CAPTURED') return conflict('Only a reviewed bank import can be completed')
    await transition(session.id, 'CAPTURED', 'COMPLETE', {
      importedCount: body.imported,
      skippedCount: body.skipped,
    }, `Imported ${body.imported} transactions`)
    return ok({ completed: true })
  },
}))
