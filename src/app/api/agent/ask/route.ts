import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { openrouterChat } from '@/lib/llm/openrouter'

interface SseEvent {
  type: 'status' | 'answer' | 'done' | 'error'
  message?: string
  answer?: string
  error?: string
}

function encode(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

// ── Tool schema the LLM can invoke ────────────────────────────────────────────
interface LookupParams {
  dateFrom?: string   // YYYY-MM-DD
  dateTo?: string     // YYYY-MM-DD
  categories?: string[]
  payees?: string[]
  minAmount?: number
  maxAmount?: number
  limit?: number      // default 200, max 500
  description?: string // substring match
}

async function runLookup(userId: string, p: LookupParams): Promise<string> {
  const limit = Math.min(p.limit ?? 200, 500)

  const rows = await prisma.transaction.findMany({
    where: {
      account: { userId },
      ...(p.dateFrom || p.dateTo ? {
        date: {
          ...(p.dateFrom ? { gte: new Date(p.dateFrom) } : {}),
          ...(p.dateTo ? { lte: new Date(new Date(p.dateTo).setHours(23, 59, 59, 999)) } : {}),
        },
      } : {}),
      ...(p.categories?.length ? {
        OR: [
          { categoryRef: { name: { in: p.categories } } },
          ...(p.categories.includes('(uncategorised)') ? [{ categoryId: null }] : []),
        ],
      } : {}),
      ...(p.payees?.length ? {
        payee: { name: { in: p.payees } },
      } : {}),
      ...(p.minAmount !== undefined || p.maxAmount !== undefined ? {
        amount: {
          ...(p.minAmount !== undefined ? { gte: p.minAmount } : {}),
          ...(p.maxAmount !== undefined ? { lte: p.maxAmount } : {}),
        },
      } : {}),
      ...(p.description ? {
        description: { contains: p.description, mode: 'insensitive' as const },
      } : {}),
    },
    select: {
      date: true,
      amount: true,
      description: true,
      categoryRef: { select: { name: true } },
      category: true,
      payee: { select: { name: true } },
      account: { select: { name: true } },
      notes: true,
    },
    orderBy: { date: 'asc' },
    take: limit,
  })

  if (rows.length === 0) return '(no transactions matched)'

  const lines = rows.map((t) => {
    const date = new Date(t.date).toISOString().slice(0, 10)
    const amt = Number(t.amount).toFixed(2)
    const cat = t.categoryRef?.name ?? t.category ?? '(uncategorised)'
    const payee = t.payee?.name ?? '(no payee)'
    const desc = t.description.replace(/\|/g, '-').slice(0, 80)
    const notes = t.notes ? ` [note: ${t.notes.slice(0, 40)}]` : ''
    return `${date}|${amt}|${cat}|${payee}|${t.account.name}|${desc}${notes}`
  })

  const total = rows.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
  return `${rows.length} transactions (total: ${total.toFixed(2)}):\ndate|amount|category|payee|account|description\n${lines.join('\n')}`
}

// ── Parse a LOOKUP: {...} response from the LLM ───────────────────────────────
function parseLookup(text: string): LookupParams | null {
  // Strip markdown code fences
  const stripped = text.replace(/```(?:json)?/gi, '')
  const idx = stripped.search(/LOOKUP\s*:/i)
  if (idx === -1) return null
  // Find the opening brace after LOOKUP:
  const braceStart = stripped.indexOf('{', idx)
  if (braceStart === -1) return null
  // Walk forward counting braces to find the matching closing brace
  let depth = 0
  let braceEnd = -1
  for (let i = braceStart; i < stripped.length; i++) {
    if (stripped[i] === '{') depth++
    else if (stripped[i] === '}') {
      depth--
      if (depth === 0) { braceEnd = i; break }
    }
  }
  if (braceEnd === -1) return null
  try {
    return JSON.parse(stripped.slice(braceStart, braceEnd + 1)) as LookupParams
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return new Response('Unauthorized', { status: 401 })

  let question: string
  try {
    const body = await request.json()
    question = (body.question ?? '').trim()
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
        send({ type: 'status', message: 'Fetching summary data…' })

        // ── Phase 0: fetch aggregated data (lightweight — no tx rows yet) ──────
        const [accounts, categoryGroups, payees, projects, activeRules] = await Promise.all([
          prisma.account.findMany({ where: { userId }, select: { name: true, currency: true } }),
          prisma.categoryGroup.findMany({ where: { userId }, include: { categories: { select: { name: true } } } }),
          prisma.payee.findMany({ where: { userId }, select: { name: true } }),
          prisma.project.findMany({ where: { userId }, select: { name: true } }),
          prisma.categorizationRule.count({ where: { userId, isActive: true } }),
        ])

        // Aggregate stats in one DB pass
        const allTx = await prisma.transaction.findMany({
          where: { account: { userId } },
          select: {
            amount: true,
            date: true,
            categoryId: true,
            projectId: true,
            categoryRef: { select: { name: true, group: { select: { name: true } } } },
            category: true,
            payee: { select: { name: true } },
            project: { select: { name: true } },
          },
          orderBy: { date: 'asc' },
        })

        send({ type: 'status', message: `Building context over ${allTx.length} transactions…` })

        const expenses = allTx.filter((t) => Number(t.amount) < 0)
        const income = allTx.filter((t) => Number(t.amount) > 0)
        const totalIncome = income.reduce((s, t) => s + Number(t.amount), 0)
        const totalExpenses = expenses.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
        const categorised = allTx.filter((t) => t.categoryId).length

        const dates = allTx.map((t) => new Date(t.date).getTime())
        const earliest = dates.length ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : 'n/a'
        const latest = dates.length ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : 'n/a'

        const byCat = new Map<string, number>()
        for (const t of expenses) {
          const k = t.categoryRef?.name ?? t.category ?? '(uncategorised)'
          byCat.set(k, (byCat.get(k) ?? 0) + Math.abs(Number(t.amount)))
        }
        const topCats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)

        const byPayee = new Map<string, number>()
        for (const t of expenses) {
          const k = t.payee?.name; if (!k) continue
          byPayee.set(k, (byPayee.get(k) ?? 0) + Math.abs(Number(t.amount)))
        }
        const topPayees = [...byPayee.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)

        const byMonth = new Map<string, number>()
        const byMonthCat = new Map<string, Map<string, number>>()
        for (const t of expenses) {
          const d = new Date(t.date)
          const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          const amt = Math.abs(Number(t.amount))
          byMonth.set(m, (byMonth.get(m) ?? 0) + amt)
          const cat = t.categoryRef?.name ?? t.category ?? '(uncategorised)'
          if (!byMonthCat.has(m)) byMonthCat.set(m, new Map())
          const cm = byMonthCat.get(m)!
          cm.set(cat, (cm.get(cat) ?? 0) + amt)
        }
        const monthlySpend = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))

        const byProject = new Map<string, number>()
        for (const t of allTx) {
          if (!t.project) continue
          byProject.set(t.project.name, (byProject.get(t.project.name) ?? 0) + Math.abs(Number(t.amount)))
        }
        const projectTotals = [...byProject.entries()].sort((a, b) => b[1] - a[1])

        const byGroup = new Map<string, number>()
        for (const t of expenses) {
          const k = t.categoryRef?.group?.name ?? '(no group)'
          byGroup.set(k, (byGroup.get(k) ?? 0) + Math.abs(Number(t.amount)))
        }
        const groupBreakdown = [...byGroup.entries()].sort((a, b) => b[1] - a[1])

        const currencies = [...new Set(accounts.map((a) => a.currency))].join(', ')

        const summaryBlock = `
FINANCIAL SUMMARY
=================
Period: ${earliest} → ${latest}
Accounts: ${accounts.map((a) => a.name).join(', ')} (${currencies})
Transactions: ${allTx.length} total | ${income.length} income | ${expenses.length} expenses
Income: ${totalIncome.toFixed(2)} | Expenses: ${totalExpenses.toFixed(2)} | Net: ${(totalIncome - totalExpenses).toFixed(2)}
Categorised: ${categorised}/${allTx.length} (${Math.round((categorised / (allTx.length || 1)) * 100)}%)
Active rules: ${activeRules}
Projects: ${projects.map((p) => p.name).join(', ') || '(none)'}
Known payees: ${payees.length}
Categories: ${categoryGroups.flatMap((g) => g.categories).map((c) => c.name).join(', ') || '(none)'}

TOP SPEND CATEGORIES:
${topCats.map(([c, a]) => `  ${c}: ${a.toFixed(2)}`).join('\n') || '  (none)'}

CATEGORY GROUP TOTALS:
${groupBreakdown.map(([g, a]) => `  ${g}: ${a.toFixed(2)}`).join('\n') || '  (none)'}

TOP PAYEES BY SPEND:
${topPayees.map(([p, a]) => `  ${p}: ${a.toFixed(2)}`).join('\n') || '  (none)'}

MONTHLY SPEND (all time, top-5 categories per month):
${monthlySpend.map(([m, a]) => {
  const cats = [...(byMonthCat.get(m)?.entries() ?? [])].sort((x, y) => y[1] - x[1]).slice(0, 5)
  return `  ${m}: ${a.toFixed(2)} [${cats.map(([c, v]) => `${c} ${v.toFixed(2)}`).join(', ')}]`
}).join('\n') || '  (none)'}

PROJECT TOTALS:
${projectTotals.map(([p, a]) => `  ${p}: ${a.toFixed(2)}`).join('\n') || '  (none)'}`.trim()

        // ── Phase 1: ask LLM — can it answer from summaries, or does it need rows? ──
        send({ type: 'status', message: 'Reasoning…' })

        const systemPrompt = `You are a personal finance assistant with access to a financial database.

You will be given a summary of the user's finances and a question.

If the summary contains enough detail to answer fully, respond with:
ANSWER: <your answer>

If you need to look up specific transactions to answer properly, respond with a single tool call:
LOOKUP: <JSON object with any of these optional filters>
  dateFrom: "YYYY-MM-DD"
  dateTo: "YYYY-MM-DD"
  categories: ["category name", ...]   (use exact names from the summary; use "(uncategorised)" for uncategorised)
  payees: ["payee name", ...]
  minAmount: number   (raw signed amount, e.g. -5000 for expenses over 5000)
  maxAmount: number
  description: "substring to match"
  limit: number  (default 200, max 500)

Only use LOOKUP when you genuinely need transaction-level detail. Be as specific as possible with filters to keep the result set small.
After receiving lookup results you must give a final ANSWER.
Plain text only — no markdown, no code fences, ever.`

        const phase1 = await openrouterChat(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `${summaryBlock}\n\nUSER QUESTION: ${question}` },
          ],
          'anthropic/claude-sonnet-4-5'
        )

        // ── Parse phase 1 response ──────────────────────────────────────────────
        const lookup = parseLookup(phase1)
        console.log('[ask] phase1 raw:', JSON.stringify(phase1.slice(0, 300)))
        console.log('[ask] parsed lookup:', lookup)

        if (!lookup) {
          // LLM answered directly from summaries
          const answer = phase1.replace(/^ANSWER:\s*/i, '').trim()
          send({ type: 'answer', answer })
          send({ type: 'done' })
          return
        }

        // ── Phase 2: run the targeted DB lookup ─────────────────────────────────
        const filterDesc = [
          lookup.dateFrom || lookup.dateTo ? `${lookup.dateFrom ?? '…'} → ${lookup.dateTo ?? '…'}` : null,
          lookup.categories?.length ? `categories: ${lookup.categories.join(', ')}` : null,
          lookup.payees?.length ? `payees: ${lookup.payees.join(', ')}` : null,
          lookup.description ? `desc contains "${lookup.description}"` : null,
        ].filter(Boolean).join(' | ')

        send({ type: 'status', message: `Looking up transactions${filterDesc ? ` (${filterDesc})` : ''}…` })

        const lookupResult = await runLookup(userId, lookup)

        // ── Phase 3: final answer with transaction rows in context ───────────────
        send({ type: 'status', message: 'Composing answer…' })

        const phase2 = await openrouterChat(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `${summaryBlock}\n\nUSER QUESTION: ${question}` },
            { role: 'assistant', content: phase1 },
            { role: 'user', content: `LOOKUP RESULTS:\n${lookupResult}\n\nNow answer the question.` },
          ],
          'anthropic/claude-sonnet-4-5'
        )

        const answer = phase2.replace(/^ANSWER:\s*/i, '').trim()
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
