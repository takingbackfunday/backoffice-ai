import { auth } from '@clerk/nextjs/server'
import { orchestrate } from '@/lib/agent/orchestrator'
import type { SseEvent, ConversationTurn } from '@/lib/agent/types'

function encode(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  let question: string
  let conversationHistory: ConversationTurn[]
  let sessionId: string | undefined

  try {
    const body = await request.json()
    question = (body.question ?? '').trim()
    conversationHistory = Array.isArray(body.conversationHistory) ? body.conversationHistory : []
    sessionId = body.sessionId ?? undefined
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (!question) return new Response('Missing question', { status: 400 })

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: SseEvent) { controller.enqueue(encode(event)) }

      const keepAlive = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(': ping\n\n'))
      }, 5000)

      try {
        if (sessionId) {
          send({ type: 'session', sessionId, turnCount: conversationHistory.length })
        }

        const t0 = Date.now()
        const { answer, toolsUsed } = await orchestrate({
          userId,
          question,
          conversationHistory,
          send,
        })

        console.log('[ask-route] done', JSON.stringify({
          totalMs: Date.now() - t0,
          toolsUsed,
          answerLen: answer.length,
          turnCount: conversationHistory.length,
        }))

        send({ type: 'answer', answer })
        send({ type: 'done' })

      } catch (err) {
        send({ type: 'error', error: err instanceof Error ? err.message : 'Unknown error' })
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
