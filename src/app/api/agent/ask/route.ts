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

      try {
        send({ type: 'status', message: 'Fetching your data…' })

        const [transactions, accounts, categoryGroups, payees, projects, activeRules] = await Promise.all([
          prisma.transaction.findMany({
            where: { account: { userId } },
            select: {
              id: true,
              amount: true,
              description: true,
              date: true,
              category: true,
              categoryId: true,
              projectId: true,
              notes: true,
              payee: { select: { name: true } },
              categoryRef: { select: { name: true, group: { select: { name: true } } } },
              account: { select: { name: true, currency: true } },
              project: { select: { name: true } },
            },
            orderBy: { date: 'desc' },
          }),
          prisma.account.findMany({
            where: { userId },
            select: { name: true, currency: true },
          }),
          prisma.categoryGroup.findMany({
            where: { userId },
            include: { categories: { select: { name: true } } },
          }),
          prisma.payee.findMany({
            where: { userId },
            select: { name: true },
          }),
          prisma.project.findMany({
            where: { userId },
            select: { name: true },
          }),
          prisma.categorizationRule.count({ where: { userId, isActive: true } }),
        ])

        send({ type: 'status', message: `Thinking over ${transactions.length} transactions…` })

        // ── Build context ──────────────────────────────────────────────────────

        const total = transactions.length
        const expenses = transactions.filter((t) => Number(t.amount) < 0)
        const income = transactions.filter((t) => Number(t.amount) > 0)
        const totalIncome = income.reduce((s, t) => s + Number(t.amount), 0)
        const totalExpenses = expenses.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

        const categorised = transactions.filter((t) => t.categoryId).length

        const dates = transactions.map((t) => new Date(t.date).getTime())
        const earliest = dates.length ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : 'n/a'
        const latest = dates.length ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : 'n/a'

        // Top categories by spend
        const byCat = new Map<string, number>()
        for (const tx of expenses) {
          const key = tx.categoryRef?.name ?? tx.category ?? '(uncategorised)'
          byCat.set(key, (byCat.get(key) ?? 0) + Math.abs(Number(tx.amount)))
        }
        const topCats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)

        // Top payees by spend
        const byPayee = new Map<string, number>()
        for (const tx of expenses) {
          const key = tx.payee?.name
          if (!key) continue
          byPayee.set(key, (byPayee.get(key) ?? 0) + Math.abs(Number(tx.amount)))
        }
        const topPayees = [...byPayee.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)

        // Monthly spend + per-month category breakdown (all time)
        const byMonth = new Map<string, number>()
        const byMonthCat = new Map<string, Map<string, number>>()
        for (const tx of expenses) {
          const d = new Date(tx.date)
          const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          const amt = Math.abs(Number(tx.amount))
          byMonth.set(month, (byMonth.get(month) ?? 0) + amt)
          const cat = tx.categoryRef?.name ?? tx.category ?? '(uncategorised)'
          if (!byMonthCat.has(month)) byMonthCat.set(month, new Map())
          const catMap = byMonthCat.get(month)!
          catMap.set(cat, (catMap.get(cat) ?? 0) + amt)
        }
        const monthlySpend = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))

        // Project totals
        const byProject = new Map<string, number>()
        for (const tx of transactions) {
          if (!tx.project) continue
          byProject.set(tx.project.name, (byProject.get(tx.project.name) ?? 0) + Math.abs(Number(tx.amount)))
        }
        const projectTotals = [...byProject.entries()].sort((a, b) => b[1] - a[1])

        // Category group breakdown
        const byGroup = new Map<string, number>()
        for (const tx of expenses) {
          const key = tx.categoryRef?.group?.name ?? '(no group)'
          byGroup.set(key, (byGroup.get(key) ?? 0) + Math.abs(Number(tx.amount)))
        }
        const groupBreakdown = [...byGroup.entries()].sort((a, b) => b[1] - a[1])

        const currencies = [...new Set(accounts.map((a) => a.currency))].join(', ')

        const contextBlock = `
FINANCIAL DATA SUMMARY
======================
Period: ${earliest} → ${latest}
Accounts: ${accounts.map((a) => a.name).join(', ')} (${currencies})
Transactions: ${total} total | ${income.length} income | ${expenses.length} expenses
Income: ${totalIncome.toFixed(2)} | Expenses: ${totalExpenses.toFixed(2)} | Net: ${(totalIncome - totalExpenses).toFixed(2)}
Categorised: ${categorised}/${total} (${Math.round((categorised / (total || 1)) * 100)}%)
Active rules: ${activeRules}
Projects: ${projects.map((p) => p.name).join(', ') || '(none)'}
Payees: ${payees.length} known
Category groups: ${categoryGroups.map((g) => g.name).join(', ') || '(none)'}

TOP SPEND CATEGORIES (all time):
${topCats.map(([c, a]) => `  ${c}: ${a.toFixed(2)}`).join('\n') || '  (none)'}

CATEGORY GROUP TOTALS:
${groupBreakdown.map(([g, a]) => `  ${g}: ${a.toFixed(2)}`).join('\n') || '  (none)'}

TOP PAYEES BY SPEND:
${topPayees.map(([p, a]) => `  ${p}: ${a.toFixed(2)}`).join('\n') || '  (none)'}

MONTHLY SPEND WITH CATEGORY BREAKDOWN (all time):
${monthlySpend.map(([m, a]) => {
  const cats = [...(byMonthCat.get(m)?.entries() ?? [])].sort((x, y) => y[1] - x[1]).slice(0, 5)
  const catLine = cats.map(([c, v]) => `${c} ${v.toFixed(2)}`).join(', ')
  return `  ${m}: ${a.toFixed(2)} [${catLine}]`
}).join('\n') || '  (none)'}

PROJECT TOTALS:
${projectTotals.map(([p, a]) => `  ${p}: ${a.toFixed(2)}`).join('\n') || '  (none)'}
`.trim()

        send({ type: 'status', message: 'Calling AI…' })

        const systemPrompt = `You are a concise personal finance assistant. The user will ask a question about their financial data. Answer it directly and specifically using the data provided. Be brief — no fluff, no unnecessary preamble. Use plain text only, no markdown. If the data doesn't contain enough information to answer, say so clearly.`

        const userPrompt = `${contextBlock}

USER QUESTION: ${question}`

        const keepAlive = setInterval(() => {
          controller.enqueue(new TextEncoder().encode(': ping\n\n'))
        }, 5000)

        let answer: string
        try {
          answer = await openrouterChat(
            [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            'anthropic/claude-sonnet-4-5'
          )
        } finally {
          clearInterval(keepAlive)
        }

        send({ type: 'answer', answer: answer.trim() })
        send({ type: 'done' })
      } catch (err) {
        send({ type: 'error', error: err instanceof Error ? err.message : 'Unknown error' })
      } finally {
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
