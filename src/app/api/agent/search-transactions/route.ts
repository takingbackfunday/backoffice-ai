import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { openrouterChat } from '@/lib/llm/openrouter'
import { ok, unauthorized, serverError, badRequest } from '@/lib/api-response'

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return unauthorized()

  let query: string
  try {
    const body = await request.json()
    query = (body.query ?? '').trim()
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (!query) return new Response('Missing query', { status: 400 })

  try {
    const [categoryGroups, payees, projects, accounts, dateRange] = await Promise.all([
      prisma.categoryGroup.findMany({
        where: { userId },
        include: { categories: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      }),
      prisma.payee.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.project.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.account.findMany({ where: { userId }, select: { name: true }, orderBy: { name: 'asc' } }),
      prisma.transaction.aggregate({
        where: { account: { userId } },
        _min: { date: true },
        _max: { date: true },
      }),
    ])

    const today = new Date().toISOString().slice(0, 10)
    const minDate = dateRange._min.date?.toISOString().slice(0, 10) ?? today
    const maxDate = dateRange._max.date?.toISOString().slice(0, 10) ?? today

    const categoryList = categoryGroups.map((g) =>
      `${g.name}:\n${g.categories.map((c) => `  - ${c.name} (id: ${c.id})`).join('\n')}`
    ).join('\n') || '(none)'

    const payeeList = payees.map((p) => `  - ${p.name}`).join('\n') || '(none)'
    const projectList = projects.map((p) => `  - ${p.name} (id: ${p.id})`).join('\n') || '(none)'
    const accountList = accounts.map((a) => `  - ${a.name}`).join('\n') || '(none)'

    const systemPrompt = `You are a filter translator for a financial transactions table. The user will describe what transactions they want to see in natural language. You must output a JSON object with filter values that match the database query parameters.

Today's date: ${today}
Transaction date range in database: ${minDate} to ${maxDate}

Available categories (use the id for categoryId):
${categoryList}

Available payees (use the name for payeeName):
${payeeList}

Available projects (use the id for projectId):
${projectList}

Available accounts (use the name for accountName):
${accountList}

IMPORTANT RULES:
- Amounts in the database are SIGNED: negative = expense, positive = income
- When the user says "expenses over $50", they mean transactions where amount <= -50, so set amountMax to "-50"
- When the user says "income over $1000", they mean amount >= 1000, so set amountMin to "1000"
- For "expenses between $100 and $500", set amountMin to "-500" and amountMax to "-100"
- Use "description" for keyword/merchant matching (case-insensitive substring match)
- Use "search" only when the query is very broad and should match across description, notes, category, payee, and account
- Use "payeeName" when the user references a known payee by name (case-insensitive substring match)
- Use "categoryId" when the user references a category — resolve fuzzy names to the best matching category ID from the list above
- Use "projectId" when the user references a project — resolve to the best matching project ID
- Use "accountName" when the user references a specific bank account
- Date formats must be YYYY-MM-DD
- For relative dates like "last month", "this quarter", "past 90 days", calculate the actual dates based on today's date
- Only include fields that are relevant to the query. Leave irrelevant fields as empty strings.
- sortBy must be one of: "date", "amount", "description", "category"
- sortDir must be "asc" or "desc"

Respond with ONLY a JSON object, no markdown, no explanation outside the JSON:
{
  "filters": {
    "search": "",
    "description": "",
    "accountName": "",
    "payeeName": "",
    "categoryId": "",
    "projectId": "",
    "amountMin": "",
    "amountMax": "",
    "dateFrom": "",
    "dateTo": "",
    "sortBy": "date",
    "sortDir": "desc"
  },
  "explanation": "One-sentence summary of what the filters show"
}`

    console.log('[search-transactions] query:', query)

    const raw = await openrouterChat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query },
      ],
      'google/gemini-2.0-flash-lite-001'
    )

    // Strip markdown code fences if the model wrapped the JSON
    const cleaned = raw.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim()

    let parsed: { filters: Record<string, string>; explanation: string }
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('[search-transactions] JSON parse failed, raw:', raw.slice(0, 500))
      return badRequest('Failed to parse AI response')
    }

    // Log the active filters (non-empty values only)
    const activeFilters = Object.fromEntries(Object.entries(parsed.filters).filter(([, v]) => v !== ''))
    console.log('[search-transactions] result:', { activeFilters, explanation: parsed.explanation })

    return ok({ filters: parsed.filters, explanation: parsed.explanation ?? '' })
  } catch (err) {
    console.error('[search-transactions] error:', err instanceof Error ? err.message : err)
    return serverError('AI search failed')
  }
}
