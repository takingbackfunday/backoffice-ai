#!/usr/bin/env tsx
/**
 * Dev tool — runs the production rules agent for a given userId and prints results.
 * Always uses the same code path as the SSE route, so improvements reflect immediately.
 * Usage: pnpm tsx scripts/run-rules-agent.ts <userId>
 */

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://neondb_owner:npg_NGJVWsFuk58h@ep-super-wave-alq120gl.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
process.env.DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL

const userId = process.argv[2]
if (!userId) {
  console.error('Usage: pnpm tsx scripts/run-rules-agent.ts <userId>')
  process.exit(1)
}

async function main() {
  const { runRulesAgent } = await import('../src/lib/agent/run-rules-agent')
  const { prisma } = await import('../src/lib/prisma')

  console.log(`\n🤖 Rules agent starting for userId: ${userId}\n`)

  type Suggestion = {
    rule: {
      categoryName: string; payeeName: string | null
      workspaceName: string | null; confidence: string; impact: string
      reasoning: string; conditions: { all?: unknown[]; any?: unknown[] }
    }
    matchCount: number; totalAmount: number
    sampleTransactions?: { description: string; amount: number }[]
  }
  const suggestions: Suggestion[] = []
  let totalRejections = 0

  const t0 = Date.now()

  const result = await runRulesAgent(userId, (event) => {
    if (event.type === 'status') {
      process.stdout.write(`  ${event.message}\n`)
    } else if (event.type === 'suggestion' && event.rule) {
      const r = event.rule
      suggestions.push({ rule: r, matchCount: event.matchCount ?? 0, totalAmount: event.totalAmount ?? 0, sampleTransactions: event.sampleTransactions })
      process.stdout.write(`    ✓ [${r.categoryName}] ${r.payeeName ?? '(no payee)'}${r.workspaceName ? ` → project:${r.workspaceName}` : ''} (${event.matchCount} txns)\n`)
    } else if (event.type === 'error') {
      process.stdout.write(`  ✗ Error: ${event.error}\n`)
      totalRejections++
    }
  })

  const elapsedMs = Date.now() - t0

  console.log('\n' + '═'.repeat(80))
  console.log(`✅ ANALYSIS COMPLETE — ${suggestions.length} suggestions in ${(elapsedMs / 1000).toFixed(1)}s\n`)

  for (const [i, s] of suggestions.entries()) {
    const r = s.rule
    const condStr = (r.conditions.all ?? r.conditions.any ?? [])
      .map((c: unknown) => {
        const cond = c as { field: string; operator: string; value: unknown }
        return `${cond.field} ${cond.operator} "${cond.value}"`
      })
      .join(r.conditions.all ? ' AND ' : ' OR ')
    console.log(`${i + 1}. [${r.confidence.toUpperCase()} / ${r.impact}] ${r.categoryName}`)
    console.log(`   Payee:    ${r.payeeName ?? '(none)'}`)
    if (r.workspaceName) console.log(`   Project:  ${r.workspaceName}`)
    console.log(`   Matches:  ~${s.matchCount} txns, £${s.totalAmount?.toFixed(2) ?? '?'} total`)
    console.log(`   Cond:     ${condStr}`)
    console.log(`   Reason:   ${r.reasoning}`)
    if (s.sampleTransactions?.length) {
      console.log(`   Samples:  ${s.sampleTransactions.slice(0, 2).map(t => `"${t.description.slice(0, 50)}" (${t.amount})`).join(' | ')}`)
    }
    console.log()
  }

  const withProject = suggestions.filter(s => s.rule.workspaceName).length
  const withPayee = suggestions.filter(s => s.rule.payeeName).length
  const highConf = suggestions.filter(s => s.rule.confidence === 'high').length
  console.log('─'.repeat(80))
  console.log(`Summary: ${suggestions.length} total | ${highConf} high confidence | ${withPayee} with payee | ${withProject} with project`)
  console.log(`Uncategorised: ${result.uncategorised} | No-payee: ${result.noPayee}`)

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
