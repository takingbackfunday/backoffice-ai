import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { openrouterWithTools } from '@/lib/llm/openrouter'
import type { ChatMessage, ToolDefinition } from '@/lib/llm/openrouter'
import { query_transactions, aggregate_transactions } from '@/lib/agent/finance-tools'

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

// Tools the invoice AI can use to look up real project expenses
const INVOICE_AI_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'lookup_project_expenses',
      description: 'Look up transactions tagged to this client project. Use to find billable expenses, time-based charges, or costs to include in the invoice. Returns a list of recent transactions with amounts, descriptions, dates.',
      parameters: {
        type: 'object',
        properties: {
          dateFrom: { type: 'string', description: 'Start date YYYY-MM-DD' },
          dateTo: { type: 'string', description: 'End date YYYY-MM-DD' },
          descriptionContains: { type: 'string', description: 'Filter by description keyword' },
          limit: { type: 'number', description: 'Max results (default 50)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aggregate_project_expenses',
      description: 'Get total expenses for this project grouped by category or month. Use to summarise billable costs.',
      parameters: {
        type: 'object',
        required: ['groupBy'],
        properties: {
          groupBy: { type: 'string', enum: ['month', 'category', 'payee'], description: 'Group dimension' },
          dateFrom: { type: 'string', description: 'Start date YYYY-MM-DD' },
          dateTo: { type: 'string', description: 'End date YYYY-MM-DD' },
        },
      },
    },
  },
]

function parseInvoiceJson(raw: string): { text: string; actions: unknown[] } | null {
  let jsonStr = raw.trim()
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonStr = fenceMatch[1].trim()
  const braceMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (braceMatch) jsonStr = braceMatch[0]
  try {
    const parsed = JSON.parse(jsonStr)
    return { text: parsed.text ?? '', actions: parsed.actions ?? [] }
  } catch {
    return null
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const body = await request.json()
    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    const { messages, currentInvoice, clientName, company, paymentTermDays } = parsed.data
    const today = new Date().toISOString().split('T')[0]

    const projectWithJobs = await prisma.project.findFirst({
      where: { id, userId },
      select: { id: true, name: true, clientProfile: { select: { jobs: { select: { id: true, name: true }, where: { status: 'ACTIVE' } } } } },
    })
    if (!projectWithJobs) return notFound('Project not found')
    const project = projectWithJobs
    const availableJobs = projectWithJobs.clientProfile?.jobs ?? []

    const systemPrompt = `You are an invoice assistant for a freelance professional.
Today: ${today}. Client: ${clientName ?? 'the client'}${company ? ` (${company})` : ''}. Payment terms: ${paymentTermDays ?? 30} days net.
Project name in the finance system: "${project.name}".
${availableJobs.length > 0 ? `Available jobs: ${availableJobs.map(j => `"${j.name}" (id: ${j.id})`).join(', ')}.` : ''}

Current invoice state:
${JSON.stringify(currentInvoice, null, 2)}

The user will describe work done, request changes, or ask questions.
You have tools to look up real transactions tagged to this project — use them when the user asks about expenses, costs, or what to bill.

After any tool calls, respond with JSON ONLY — no prose outside the JSON object:
{
  "text": "friendly 1-2 sentence confirmation of what you did or answered",
  "actions": [
    { "type": "set_line_items", "lineItems": [{ "description": "...", "quantity": 1, "unitPrice": 0 }] },
    { "type": "set_due_date", "value": "YYYY-MM-DD" },
    { "type": "set_issue_date", "value": "YYYY-MM-DD" },
    { "type": "set_notes", "value": "..." },
    { "type": "set_tax", "label": "GST 15%", "amount": 262.50 },
    { "type": "set_currency", "value": "EUR" },
    { "type": "set_job", "jobId": "<id from available jobs list>" },
    { "type": "set_qty_unit", "lineItemIndex": 0, "unit": "hrs" },
    { "type": "ask_clarification", "question": "..." }
  ]
}

Rules:
- Never invent amounts. Use tool data or ask if unclear.
- Preserve existing line items unless user asks to change them.
- Default due date = today + ${paymentTermDays ?? 30} days if not set.
- Only include actions that actually change something.
- The "actions" array can be empty if user is only asking a question.
- For ask_clarification: include no other actions — just the question.
- For set_currency: use ISO 4217 codes (USD, EUR, GBP, CAD, AUD, etc.).
- For set_job: only use job IDs from the available jobs list above.
- For set_qty_unit: use short unit labels like "hrs", "days", "wks", "pages", "words", "units".`

    const llmMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    // Tool loop — max 3 rounds
    const MAX_ROUNDS = 3
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await openrouterWithTools(llmMessages, INVOICE_AI_TOOLS, 'anthropic/claude-sonnet-4.6')

      // No tool calls → final answer
      if (!response.tool_calls || response.tool_calls.length === 0) {
        const text = response.content ?? ''
        const result = parseInvoiceJson(text)
        return ok(result ?? { text, actions: [] })
      }

      // Push assistant message with tool calls
      llmMessages.push({
        role: 'assistant',
        content: response.content ?? '',
        // Tool calls are in the content for models that support it;
        // for OpenRouter we append them as stringified content for context
      })

      // Execute tool calls and push results
      for (const tc of response.tool_calls) {
        let toolResult: string
        try {
          const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
          if (tc.function.name === 'lookup_project_expenses') {
            toolResult = await query_transactions(userId, {
              projectNames: [project.name],
              dateFrom: args.dateFrom as string | undefined,
              dateTo: args.dateTo as string | undefined,
              descriptionContains: args.descriptionContains as string | undefined,
              limit: (args.limit as number | undefined) ?? 50,
            })
          } else if (tc.function.name === 'aggregate_project_expenses') {
            toolResult = await aggregate_transactions(userId, {
              groupBy: (args.groupBy as 'month' | 'category' | 'payee') ?? 'category',
              projectNames: [project.name],
              dateFrom: args.dateFrom as string | undefined,
              dateTo: args.dateTo as string | undefined,
            })
          } else {
            toolResult = 'Unknown tool'
          }
        } catch {
          toolResult = 'Tool execution failed'
        }

        llmMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: toolResult,
        })
      }
    }

    // Exhausted rounds — ask for final answer without tools
    llmMessages.push({ role: 'user', content: 'Please provide your final response now as the JSON object.' })
    const final = await openrouterWithTools(llmMessages, [], 'anthropic/claude-sonnet-4.6')
    const text = final.content ?? ''
    const result = parseInvoiceJson(text)
    return ok(result ?? { text, actions: [] })

  } catch (err) {
    console.error('[ai-assist]', err)
    return serverError('Failed to get AI response')
  }
}
