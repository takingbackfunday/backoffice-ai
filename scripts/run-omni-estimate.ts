#!/usr/bin/env tsx
/**
 * Dev diagnostic — runs the omni agent with an estimate editor page context and logs
 * every tool call + its exact arguments, plus any editor actions dispatched.
 *
 * Usage:
 *   pnpm tsx scripts/run-omni-estimate.ts <userId> "<question>"
 *
 * Example:
 *   pnpm tsx scripts/run-omni-estimate.ts user_abc123 "3 part series, 40 mins each..."
 */

export {}

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://neondb_owner:npg_NGJVWsFuk58h@ep-super-wave-alq120gl.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
process.env.DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? ''

const userId = process.argv[2]
const question = process.argv[3]

if (!userId || !question) {
  console.error('Usage: pnpm tsx scripts/run-omni-estimate.ts <userId> "<question>"')
  process.exit(1)
}

async function main() {
  // Patch tool-loop to log raw tool args before dispatch
  const toolLoopModule = await import('../src/lib/agent/tool-loop')
  const originalRunToolLoop = toolLoopModule.runToolLoop

  // We'll instrument via the dispatchTool wrapper in runOmniAgent instead

  const { runOmniAgent } = await import('../src/lib/agent/omni-agent')
  const { prisma } = await import('../src/lib/prisma')
  const { getOmniTools, dispatchOmniTool } = await import('../src/lib/agent/omni-tools')

  // Simulate being on the new estimate page
  const pageContext = {
    pathname: '/projects/falling-tree/estimates/new',
    routeTemplate: '/projects/[slug]/estimates/new',
    entityType: 'estimate' as const,
    entityId: undefined,
    entityName: undefined,
    snapshot: {
      title: '',
      currency: 'GBP',
      notes: '',
      sections: [{ id: 'default', name: 'New Section', collapsed: false, items: [{ id: 'item1', description: '', costRate: '', quantity: '1', unit: 'hrs', tags: '', isOptional: false, internalNotes: '', riskLevel: 'low' }] }],
    },
  }

  console.log(`\n=== Omni Agent Estimate Diagnostic ===`)
  console.log(`userId:   ${userId}`)
  console.log(`question: ${question}`)
  console.log(`page:     ${pageContext.pathname}`)
  console.log('='.repeat(60) + '\n')

  const editorActions: unknown[] = []

  const { answer, toolsUsed } = await runOmniAgent({
    userId,
    question,
    conversationHistory: [],
    pageContext,
    onStatus: (msg) => process.stdout.write(`  [status] ${msg}\n`),
    onToken: (text) => process.stdout.write(text),
    onAction: (target, action) => {
      editorActions.push({ target, action })
      console.log(`\n  [ACTION dispatched → ${target}]`)
      console.log(JSON.stringify(action, null, 2))
    },
    onLink: (link) => {
      console.log(`\n  [LINK] ${link.label ?? link.route} — ${link.reason}`)
    },
  })

  console.log('\n\n' + '='.repeat(60))
  console.log(`Tools used: ${toolsUsed.join(', ') || '(none)'}`)
  console.log(`Editor actions dispatched: ${editorActions.length}`)

  if (editorActions.length > 0) {
    console.log('\n--- Full editor actions ---')
    for (const [i, a] of editorActions.entries()) {
      console.log(`\n[${i + 1}]`, JSON.stringify(a, null, 2))
    }
  } else {
    console.log('\n⚠️  No editor actions were dispatched — the LLM did not call apply_estimate_edits')
  }

  console.log('\n--- Final answer ---')
  console.log(answer)

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
