import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { runAudaciousQuotePipeline, type PipelineEvent } from '@/lib/quote-generator/audacious-pipeline'
import { parsePreferences } from '@/types/preferences'
import { logger } from '@/lib/log'
import { checkDailyBudget, recordAgentUsage } from '@/lib/agent/usage'

const BodySchema = z.object({
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(2000),
  clarificationAnswers: z.array(z.string()).optional(),
})

function encode(event: PipelineEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  // Budget gate — fail early
  const budget = await checkDailyBudget(userId)
  if (!budget.ok) {
    return new Response(
      JSON.stringify({
        error: `Daily AI usage limit reached (${budget.used.toLocaleString()} / ${budget.cap.toLocaleString()} tokens). Try again tomorrow.`,
      }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let body: z.infer<typeof BodySchema>
  try {
    const raw = await request.json()
    const parsed = BodySchema.safeParse(raw)
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.issues.map(i => i.message).join('; ') }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }
    body = parsed.data
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Load user's work description for context
  const pref = await prisma.userPreference.findUnique({ where: { userId } })
  const workDescription = pref ? parsePreferences(pref.data).workDescription ?? null : null

  const t0 = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: PipelineEvent) {
        controller.enqueue(encode(event))
      }

      const keepAlive = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(': ping\n\n'))
      }, 5000)

      try {
        const pipeline = runAudaciousQuotePipeline({
          description: body.description,
          clarificationAnswers: body.clarificationAnswers,
          workDescription,
        })

        for await (const event of pipeline) {
          // Template events are deferred until DB save (see below)
          if (event.type === 'template') {
            try {
              const createdTemplate = await prisma.quoteTemplate.create({
                data: {
                  userId,
                  name: event.data.template.name,
                  sections: event.data.template.sections,
                },
              })

              send({
                type: 'template',
                data: {
                  ...event.data,
                  template: {
                    ...event.data.template,
                    id: createdTemplate.id,
                  },
                } as typeof event.data & { template: typeof event.data.template & { id: string } },
              })
            } catch (err) {
              logger.error('audacious-quote', 'DB save failed', {
                error: err instanceof Error ? err.message : String(err),
              })
              send({
                type: 'error',
                step: 'saving',
                message: 'Quote was generated but failed to save. Please try again.',
                detail: err instanceof Error ? err.message : String(err),
              })
            }
          } else {
            send(event)
          }
        }

        // Record usage
        const durationMs = Date.now() - t0
        recordAgentUsage({
          userId,
          endpoint: 'quote-generate-audacious',
          model: 'anthropic/claude-sonnet-4.6',
          inputTokens: 0, // pipeline doesn't track per-call usage granularly yet
          outputTokens: 0,
          toolRounds: 0,
          durationMs,
        }).catch(() => {})

      } catch (err) {
        logger.error('audacious-quote', 'Unhandled pipeline error', {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        })
        send({
          type: 'error',
          step: 'unknown',
          message: `Unexpected error: ${err instanceof Error ? err.message : 'Something went wrong'}. Please try again.`,
          detail: err instanceof Error ? err.stack : undefined,
        })
      } finally {
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
