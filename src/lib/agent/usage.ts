import { prisma } from '@/lib/prisma'

const DAILY_TOKEN_CAP = Number(process.env.AGENT_DAILY_TOKEN_CAP) || 500_000

export async function recordAgentUsage(opts: {
  userId: string
  endpoint: string
  model: string
  inputTokens: number
  outputTokens: number
  toolRounds: number
  durationMs: number
}): Promise<void> {
  try {
    await prisma.agentUsage.create({ data: opts })
  } catch (err) {
    // Fire-and-forget — never block or crash the agent on usage recording failure
    console.error('[agent-usage] failed to record:', err instanceof Error ? err.message : err)
  }
}

export async function checkDailyBudget(userId: string): Promise<{ ok: boolean; used: number; cap: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const result = await prisma.agentUsage.aggregate({
    where: { userId, createdAt: { gte: since } },
    _sum: { inputTokens: true, outputTokens: true },
  })
  const used = (result._sum.inputTokens ?? 0) + (result._sum.outputTokens ?? 0)
  return { ok: used < DAILY_TOKEN_CAP, used, cap: DAILY_TOKEN_CAP }
}
