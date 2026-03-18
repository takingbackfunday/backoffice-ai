import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { openrouterChat } from '@/lib/llm/openrouter'
import { unauthorized } from '@/lib/api-response'

interface SseEvent {
  type: 'status' | 'report' | 'done' | 'error'
  message?: string
  report?: string
  error?: string
}

function encode(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return unauthorized()

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: SseEvent) { controller.enqueue(encode(event)) }

      try {
        send({ type: 'status', message: 'Fetching data…' })

        const [transactions, rules, projects, accounts] = await Promise.all([
          prisma.transaction.findMany({
            where: { account: { userId } },
            select: {
              id: true, amount: true, description: true, date: true,
              categoryId: true, category: true, projectId: true,
              payeeId: true, payee: { select: { name: true } },
              account: { select: { name: true, currency: true } },
              project: { select: { name: true } },
            },
          }),
          prisma.categorizationRule.count({ where: { userId, isActive: true } }),
          prisma.project.findMany({ where: { userId }, select: { id: true, name: true } }),
          prisma.account.findMany({ where: { userId }, select: { name: true, currency: true } }),
        ])

        send({ type: 'status', message: `Analysing ${transactions.length} transactions…` })

        // ── Compute stats ──────────────────────────────────────────────────────

        const total = transactions.length
        const categorised = transactions.filter((t) => t.categoryId).length
        const uncategorised = total - categorised
        const tagged = transactions.filter((t) => t.projectId).length
        const untagged = total - tagged

        const income = transactions.filter((t) => Number(t.amount) > 0)
        const expenses = transactions.filter((t) => Number(t.amount) < 0)
        const totalIncome = income.reduce((s, t) => s + Number(t.amount), 0)
        const totalExpenses = expenses.reduce((s, t) => s + Number(t.amount), 0)

        // Top 5 spend categories
        const byCat = new Map<string, number>()
        for (const tx of expenses) {
          const key = tx.category ?? '(uncategorised)'
          byCat.set(key, (byCat.get(key) ?? 0) + Math.abs(Number(tx.amount)))
        }
        const topCategories = [...byCat.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)

        // Top 5 payees by spend
        const byPayee = new Map<string, number>()
        for (const tx of expenses) {
          const key = tx.payee?.name ?? '(no payee)'
          if (key === '(no payee)') continue
          byPayee.set(key, (byPayee.get(key) ?? 0) + Math.abs(Number(tx.amount)))
        }
        const topPayees = [...byPayee.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)

        // Project spend breakdown
        const byProject = new Map<string, number>()
        for (const tx of transactions) {
          if (!tx.project) continue
          byProject.set(tx.project.name, (byProject.get(tx.project.name) ?? 0) + Math.abs(Number(tx.amount)))
        }
        const projectBreakdown = [...byProject.entries()]
          .sort((a, b) => b[1] - a[1])

        // Date range
        const dates = transactions.map((t) => new Date(t.date).getTime())
        const earliest = dates.length ? new Date(Math.min(...dates)).toLocaleDateString() : 'n/a'
        const latest = dates.length ? new Date(Math.max(...dates)).toLocaleDateString() : 'n/a'

        // Currency
        const currencies = [...new Set(accounts.map((a) => a.currency))].join(', ')

        send({ type: 'status', message: 'Calling AI…' })

        const systemPrompt = `You are a terse financial analyst. Respond only with a plain-text report — no markdown headers, no verbose prose. Use short bullet points and compact stats. Think CLI output, not an essay.`

        const userPrompt = `Generate a brief financial snapshot report for this user's data.

STATS:
- Period: ${earliest} → ${latest}
- Accounts: ${accounts.map((a) => a.name).join(', ')} (${currencies})
- Transactions: ${total} total | ${income.length} income | ${expenses.length} expenses
- Income: ${totalIncome.toFixed(2)} | Expenses: ${Math.abs(totalExpenses).toFixed(2)} | Net: ${(totalIncome + totalExpenses).toFixed(2)}
- Categorised: ${categorised}/${total} (${Math.round((categorised / (total || 1)) * 100)}%)
- Project-tagged: ${tagged}/${total} (${Math.round((tagged / (total || 1)) * 100)}%)
- Active rules: ${rules}
- Projects: ${projects.map((p) => p.name).join(', ') || '(none)'}

TOP SPEND CATEGORIES:
${topCategories.map(([cat, amt]) => `  ${cat}: ${amt.toFixed(2)}`).join('\n') || '  (none)'}

TOP PAYEES BY SPEND:
${topPayees.map(([p, amt]) => `  ${p}: ${amt.toFixed(2)}`).join('\n') || '  (none)'}

PROJECT SPEND:
${projectBreakdown.map(([p, amt]) => `  ${p}: ${amt.toFixed(2)}`).join('\n') || '  (none)'}

Write 3–5 tight bullet observations + a 1-line action recommendation. No fluff. Use plain text only — no asterisks, no markdown.`

        const keepAlive = setInterval(() => {
          controller.enqueue(new TextEncoder().encode(': ping\n\n'))
        }, 5000)

        let report: string
        try {
          report = await openrouterChat(
            [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            'mistralai/mistral-small-2603'
          )
        } finally {
          clearInterval(keepAlive)
        }

        send({ type: 'report', report: report.trim() })
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
