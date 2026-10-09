import { z } from 'zod'
import { authedRoute } from '@/lib/api-handler'
import { conflict, notFound, ok } from '@/lib/api-response'
import { requireBankImportSession } from '@/lib/bank-import/authz'
import { appendEvent, appendTrace, transition } from '@/lib/bank-import/sessions'
import { TERMINAL_STATUSES, type BankImportCommandType } from '@/lib/bank-import/status'
import { prisma } from '@/lib/prisma'
import { bankImportEnabledForUser, withBankImportFlag } from '@/lib/bank-import/flags'

const ParamsSchema = z.object({ id: z.string().min(1) })
const BodySchema = z.object({ type: z.enum(['LOGIN_DONE', 'TAKEOVER', 'RESUME_AGENT', 'CANCEL']) })

export const POST = withBankImportFlag(authedRoute<{ id: string }, z.infer<typeof BodySchema>>({
  paramsSchema: ParamsSchema,
  bodySchema: BodySchema,
  handler: async ({ userId, params, body }) => {
    if (!bankImportEnabledForUser(userId)) return notFound()
    const session = await requireBankImportSession(userId, params.id)
    if (body.type === 'CANCEL' && session.status === 'QUEUED') {
      await transition(session.id, 'QUEUED', 'CANCELLED', {}, 'Cancelled')
      return ok({ accepted: true })
    }
    if (TERMINAL_STATUSES.has(session.status) || session.status === 'CAPTURED') return conflict('This import session can no longer accept commands')
    await prisma.bankImportCommand.create({ data: { sessionId: session.id, type: body.type as BankImportCommandType } })
    await appendEvent(session.id, 'action', 'Your instruction was sent to the assistant.', { command: body.type })
    await appendTrace(session.id, 'session.command', 'event', { commandType: body.type, outcome: 'ok' })
    return ok({ accepted: true })
  },
}))
