import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { openrouterChat } from '@/lib/llm/openrouter'

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})

const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
})

const CurrentInvoiceSchema = z.object({
  lineItems: z.array(LineItemSchema),
  tax: z.object({ label: z.string(), amount: z.number() }).nullable().optional(),
  dueDate: z.string().optional(),
  issueDate: z.string().optional(),
  currency: z.string().optional(),
  notes: z.string().optional(),
  subtotal: z.number().optional(),
  total: z.number().optional(),
})

const RequestSchema = z.object({
  messages: z.array(MessageSchema).min(1),
  currentInvoice: CurrentInvoiceSchema,
  clientName: z.string().optional(),
  company: z.string().nullable().optional(),
  paymentTermDays: z.number().optional(),
})

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    // Verify project belongs to user
    const project = await prisma.project.findFirst({
      where: { id, userId },
      select: { id: true },
    })
    if (!project) return notFound('Project not found')

    const body = await request.json()
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    const { messages, currentInvoice, clientName, company, paymentTermDays } = parsed.data
    const today = new Date().toISOString().split('T')[0]

    const systemPrompt = `You are an invoice assistant for a freelance professional.
Today: ${today}. Client: ${clientName ?? 'the client'}${company ? ` (${company})` : ''}. Payment terms: ${paymentTermDays ?? 30} days net.

Current invoice state:
${JSON.stringify(currentInvoice, null, 2)}

The user will describe work done, request changes, or ask questions.
Respond with JSON ONLY — no prose outside the JSON object:
{
  "text": "friendly 1-2 sentence confirmation of what you did or answered",
  "actions": [
    { "type": "set_line_items", "lineItems": [{ "description": "...", "quantity": 1, "unitPrice": 0 }] },
    { "type": "set_due_date", "value": "YYYY-MM-DD" },
    { "type": "set_notes", "value": "..." },
    { "type": "set_tax", "label": "GST 15%", "amount": 262.50 },
    { "type": "ask_clarification", "question": "..." }
  ]
}

Rules:
- Never invent amounts. Ask if unclear.
- Preserve existing line items unless user asks to change them.
- Default due date = today + ${paymentTermDays ?? 30} days if not set.
- Only include actions that actually change something.
- The "actions" array can be empty if user is only asking a question.
- For ask_clarification: include no other actions — just the question.`

    const llmMessages: { role: 'user' | 'assistant' | 'system'; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ]

    const raw = await openrouterChat(llmMessages, 'anthropic/claude-sonnet-4.6')

    // Parse JSON response — strip markdown code fences if present
    let jsonStr = raw.trim()
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()
    // Fallback: extract first {...} block
    const braceMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (braceMatch) jsonStr = braceMatch[0]

    let parsed2: { text: string; actions: unknown[] }
    try {
      parsed2 = JSON.parse(jsonStr)
    } catch {
      return ok({ text: raw, actions: [] })
    }

    return ok({ text: parsed2.text ?? '', actions: parsed2.actions ?? [] })
  } catch (err) {
    console.error('[ai-assist]', err)
    return serverError('Failed to get AI response')
  }
}
