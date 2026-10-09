import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'
import { appendEvent, appendTrace, takeCommands, transition, type BankImportEventType, type TraceFields, type TraceName, type TracePhase } from '@/lib/bank-import/sessions'
import type { BankImportCommandType, BankImportStatusValue } from '@/lib/bank-import/status'
import { logger } from '@/lib/log'

export class SessionCancelled extends Error {}
export class SessionTimedOut extends Error {}
export class SessionFailed extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

export class SessionContext {
  private pending: BankImportCommandType[] = []

  constructor(
    readonly sessionId: string,
    readonly userId: string,
    readonly workerId: string,
    public status: BankImportStatusValue,
    readonly deadline: number,
  ) {}

  emit(type: BankImportEventType, message: string, data?: Record<string, unknown>) {
    return appendEvent(this.sessionId, type, message, data)
  }

  async trace(name: TraceName, phase: TracePhase, fields: TraceFields = {}): Promise<void> {
    try {
      await appendTrace(this.sessionId, name, phase, { workerId: this.workerId, ...fields })
    } catch {
      logger.warn('bank-import', 'trace persistence failed', {
        traceId: this.sessionId,
        name,
        phase,
        outcome: 'error',
        errorCode: 'internal',
      })
    }
  }

  async setStatus(to: BankImportStatusValue, message: string, patch: Prisma.BankImportSessionUpdateManyMutationInput = {}) {
    if (to === this.status) {
      await prisma.bankImportSession.update({ where: { id: this.sessionId }, data: patch })
      await this.emit('status', message, { status: to })
      await this.trace('session.state', 'event', { sessionStatus: to, outcome: 'ok' })
    } else {
      await transition(this.sessionId, this.status, to, patch, message, { workerId: this.workerId })
      this.status = to
    }
  }

  async pollCommands(): Promise<void> {
    const commands = await takeCommands(this.sessionId)
    if (commands.includes('CANCEL')) throw new SessionCancelled('Cancelled by user')
    for (const command of commands) {
      if (!this.pending.includes(command)) this.pending.push(command)
    }
  }

  take(type: BankImportCommandType): boolean {
    const index = this.pending.indexOf(type)
    if (index === -1) return false
    this.pending = this.pending.filter((command) => command !== type)
    return true
  }

  checkDeadline(): void {
    if (Date.now() > this.deadline) throw new SessionTimedOut('Session timed out')
  }
}

export async function pollTakeover(ctx: SessionContext): Promise<boolean> {
  await ctx.pollCommands()
  return ctx.take('TAKEOVER')
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
