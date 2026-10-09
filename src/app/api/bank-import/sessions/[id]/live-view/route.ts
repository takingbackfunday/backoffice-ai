import { z } from 'zod'
import { authedRoute } from '@/lib/api-handler'
import { conflict, notFound, ok } from '@/lib/api-response'
import { requireBankImportSession } from '@/lib/bank-import/authz'
import { BROWSER_LIVE_STATUSES } from '@/lib/bank-import/status'
import { open } from '@/lib/bank-import/secret-box'
import { embeddableLiveViewUrl } from '@/lib/bank-import/live-view-url'
import { bankImportEnabledForUser, withBankImportFlag } from '@/lib/bank-import/flags'

const ParamsSchema = z.object({ id: z.string().min(1) })

export const GET = withBankImportFlag(authedRoute<{ id: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    if (!bankImportEnabledForUser(userId)) return notFound()
    const session = await requireBankImportSession(userId, params.id)
    if (!BROWSER_LIVE_STATUSES.has(session.status) || !session.liveUrlEnc) return conflict('Live view not available')
    const url = embeddableLiveViewUrl(open(session.liveUrlEnc))
    if (!url) return conflict('The browser provider did not supply an embeddable live view. Cancel and try again.')
    const response = ok({ url })
    response.headers.set('Cache-Control', 'no-store')
    return response
  },
}))
