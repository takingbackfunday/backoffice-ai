import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { parsePreferences } from '@/types/preferences'
import { runRulesAgent } from '@/lib/agent/run-rules-agent'
import { checkDailyBudget } from '@/lib/agent/usage'
import { logger } from '@/lib/log'
import type { RulesSseEvent } from '@/lib/agent/rules-tools'

function encode(event: RulesSseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Budget gate
  const budget = await checkDailyBudget(userId)
  if (!budget.ok) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', error: `You've hit your daily AI limit (${budget.used.toLocaleString()} / ${budget.cap.toLocaleString()} tokens used in the last 24h). Try again tomorrow.` })}\n\n`,
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    )
  }

  const COOLDOWN_MS = 30_000
  const pref = await prisma.userPreference.findUnique({ where: { userId } })
  const lastRun = parsePreferences(pref?.data).lastRulesAgentRun
  if (lastRun && Date.now() - lastRun < COOLDOWN_MS) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', error: 'Please wait 30 seconds between analyses.' })}\n\n`,
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    )
  }
  await prisma.userPreference.upsert({
    where: { userId },
    update: { data: { ...parsePreferences(pref?.data), lastRulesAgentRun: Date.now() } as never },
    create: { userId, data: { lastRulesAgentRun: Date.now() } },
  })

  const stream = new ReadableStream({
    async start(controller) {
      const runId = Math.random().toString(36).slice(2, 10)

      function send(event: RulesSseEvent) {
        controller.enqueue(encode(event))
      }

      const keepAlive = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(': ping\n\n'))
      }, 5000)

      const HARD_TIMEOUT_MS = 55_000
      const abortController = new AbortController()
      let timedOut = false
      let emitCount = 0

      const hardTimeout = setTimeout(() => {
        timedOut = true
        abortController.abort()
        logger.warn('rules-agent', 'hard timeout', { runId })
        const msg = emitCount > 0
          ? `Analysis timed out after ${Math.round(HARD_TIMEOUT_MS / 1000)}s — ${emitCount} suggestion${emitCount === 1 ? '' : 's'} found so far. Try running again for more.`
          : `Analysis timed out after ${Math.round(HARD_TIMEOUT_MS / 1000)}s — the AI model took too long to respond. Please try again.`
        send({ type: 'error', error: msg })
      }, HARD_TIMEOUT_MS)

      try {
        const result = await runRulesAgent(userId, (event) => {
          if (event.type === 'suggestion') emitCount++
          send(event)
        }, { signal: abortController.signal, runId })

        if (!timedOut) {
          send({ type: 'done', uncategorised: result.uncategorised, noPayee: result.noPayee })
          await new Promise(r => setTimeout(r, 200))
        }
      } catch (err) {
        logger.error('rules-agent', 'error', { runId, message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined })
        if (!timedOut) send({ type: 'error', error: err instanceof Error ? err.message : 'Unknown error' })
      } finally {
        clearTimeout(hardTimeout)
        clearInterval(keepAlive)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
