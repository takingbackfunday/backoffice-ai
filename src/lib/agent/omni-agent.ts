import { prisma } from '@/lib/prisma'
import { runToolLoop } from './tool-loop'
import { formatHistory } from './format-history'
import { getOmniTools, dispatchOmniTool } from './omni-tools'
import { recordAgentUsage, checkDailyBudget } from './usage'
import { buildOmniSystemPrompt } from './prompts/omni'
import type { ChatMessage } from '@/lib/llm/openrouter'
import type { ConversationTurn } from './types'
import type { SerializablePageContext, EditorAction } from './page-context'
import type { LinkPayload } from './omni-tools'

const AGENT_MODEL = 'anthropic/claude-sonnet-4.6'
const MAX_ROUNDS = 8

export interface OmniContext {
  userId: string
  question: string
  conversationHistory: ConversationTurn[]
  pageContext?: SerializablePageContext
  onStatus: (message: string) => void
  onToken: (text: string) => void
  onAction: (target: 'invoice' | 'estimate' | 'quote', action: EditorAction) => void
  onLink: (link: LinkPayload) => void
}

export interface OmniResult {
  answer: string
  toolsUsed: string[]
}

// ── Snapshot cache (60s TTL per userId) ──────────────────────────────────────

const snapshotCache = new Map<string, { data: string; expiresAt: number }>()
const SNAPSHOT_TTL_MS = 60_000

export function invalidateSnapshotCache(userId: string) {
  snapshotCache.delete(userId)
}

async function buildSnapshot(userId: string): Promise<string> {
  const cached = snapshotCache.get(userId)
  if (cached && Date.now() < cached.expiresAt) return cached.data

  const [txCount, accounts, activeRules, nonDeductibleGroups, dateRange, workspaces] = await Promise.all([
    prisma.transaction.count({ where: { account: { userId } } }),
    prisma.account.findMany({ where: { userId }, select: { name: true, currency: true } }),
    prisma.categorizationRule.count({ where: { userId, isActive: true } }),
    prisma.categoryGroup.findMany({
      where: { userId, taxType: 'non_deductible' },
      select: { name: true, categories: { select: { name: true } } },
    }),
    prisma.transaction.aggregate({
      where: { account: { userId } },
      _min: { date: true },
      _max: { date: true },
    }),
    prisma.workspace.findMany({ where: { userId }, select: { type: true } }),
  ])

  const nonDeductibleCategoryNames = nonDeductibleGroups.flatMap(g => g.categories.map(c => c.name))
  const workspaceTypes = [...new Set(workspaces.map(w => w.type))]
  const hasProperty = workspaceTypes.includes('PROPERTY')
  const hasClient = workspaceTypes.includes('CLIENT')

  const data = `Financial database snapshot:
- Workspace types active: ${workspaceTypes.join(', ') || 'none'}${!hasProperty ? '\n- NOTE: This user has NO property workspaces. Never mention tenants, rent, maintenance requests, or property-related features.' : ''}${!hasClient ? '\n- NOTE: This user has NO freelance/client workspaces. Never mention invoices, clients, or studio features.' : ''}
- Accounts: ${accounts.length ? accounts.map(a => `${a.name} (${a.currency})`).join(', ') : 'none'}
- Transactions: ${txCount} total
- Date range: ${dateRange._min.date?.toISOString().slice(0, 10) ?? 'n/a'} → ${dateRange._max.date?.toISOString().slice(0, 10) ?? 'n/a'}
- Active rules: ${activeRules}

NON-DEDUCTIBLE CATEGORIES (exclude from revenue/expense/spending analysis unless user specifically asks):
${nonDeductibleCategoryNames.length ? nonDeductibleCategoryNames.map(n => `  - ${n}`).join('\n') : '  (none configured)'}`

  snapshotCache.set(userId, { data, expiresAt: Date.now() + SNAPSHOT_TTL_MS })
  return data
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function runOmniAgent(ctx: OmniContext): Promise<OmniResult> {
  const { userId, question, conversationHistory, pageContext, onStatus, onToken, onAction, onLink } = ctx

  // Budget gate — check before spending tokens
  const budget = await checkDailyBudget(userId)
  if (!budget.ok) {
    const msg = `You've hit your daily AI limit (${budget.used.toLocaleString()} / ${budget.cap.toLocaleString()} tokens used in the last 24h). Try again tomorrow.`
    onStatus(msg)
    return { answer: msg, toolsUsed: [] }
  }

  onStatus('Loading your data overview…')
  const snapshot = await buildSnapshot(userId)

  const history = formatHistory(conversationHistory)

  const messages: ChatMessage[] = [
    { role: 'system', content: buildOmniSystemPrompt({ snapshot, pageContext, history }) },
    { role: 'user', content: question },
  ]

  const tools = getOmniTools(pageContext)

  const t0 = Date.now()
  const { answer, toolsUsed, usage } = await runToolLoop({
    messages,
    tools,
    dispatchTool: (name, args) => dispatchOmniTool({ userId, name, args, pageContext, onAction, onLink }),
    model: AGENT_MODEL,
    maxRounds: MAX_ROUNDS,
    onStatus,
    onToken,
  })

  // Record usage (fire-and-forget)
  recordAgentUsage({
    userId,
    endpoint: 'omni',
    model: AGENT_MODEL,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    toolRounds: toolsUsed.length,
    durationMs: Date.now() - t0,
  })

  return { answer, toolsUsed }
}
