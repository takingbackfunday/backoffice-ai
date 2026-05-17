import { prisma } from '@/lib/prisma'
import { runToolLoop } from './tool-loop'
import { formatHistory } from './format-history'
import { findCapability, capabilityIndexSummary } from './site-capabilities-loader'
import { getOmniTools, dispatchOmniTool } from './omni-tools'
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
  onAction: (target: 'invoice' | 'estimate', action: EditorAction) => void
  onLink: (link: LinkPayload) => void
}

export interface OmniResult {
  answer: string
  toolsUsed: string[]
}

async function buildSnapshot(userId: string): Promise<string> {
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

  return `Financial database snapshot:
- Workspace types active: ${workspaceTypes.join(', ') || 'none'}${!hasProperty ? '\n- NOTE: This user has NO property workspaces. Never mention tenants, rent, maintenance requests, or property-related features.' : ''}${!hasClient ? '\n- NOTE: This user has NO freelance/client workspaces. Never mention invoices, clients, or studio features.' : ''}
- Accounts: ${accounts.length ? accounts.map(a => `${a.name} (${a.currency})`).join(', ') : 'none'}
- Transactions: ${txCount} total
- Date range: ${dateRange._min.date?.toISOString().slice(0, 10) ?? 'n/a'} → ${dateRange._max.date?.toISOString().slice(0, 10) ?? 'n/a'}
- Active rules: ${activeRules}

NON-DEDUCTIBLE CATEGORIES (exclude from revenue/expense/spending analysis unless user specifically asks):
${nonDeductibleCategoryNames.length ? nonDeductibleCategoryNames.map(n => `  - ${n}`).join('\n') : '  (none configured)'}`
}

function buildSystemPrompt(opts: {
  snapshot: string
  pageContext?: SerializablePageContext
  history: string
}): string {
  const { snapshot, pageContext, history } = opts
  const today = new Date().toISOString().slice(0, 10)

  const capability = pageContext ? findCapability(pageContext.pathname) : null
  const capIndex = capabilityIndexSummary()

  let contextSection = ''
  if (pageContext && capability) {
    contextSection = `CURRENT CONTEXT:
The user is on: ${capability.title} (${pageContext.pathname})
Page purpose: ${capability.purpose}`
    if (pageContext.entityType && pageContext.entityName) {
      contextSection += `\nThey are currently viewing/editing ${pageContext.entityType} "${pageContext.entityName}".`
    }
    if (capability.editorContext) {
      contextSection += `\nYou can use apply_${capability.editorContext}_edits to modify the form they're working on. Actions will appear in their editor with a throb highlight and a confirm/undo bar.`
    }
  } else if (pageContext) {
    contextSection = `CURRENT CONTEXT:
The user is on: ${pageContext.pathname}`
    if (pageContext.entityType && pageContext.entityName) {
      contextSection += `\nThey are currently viewing/editing ${pageContext.entityType} "${pageContext.entityName}".`
    }
  }

  return `You are Backoffice — an AI assistant embedded in a property/finance/freelance back-office app.

Today's date is ${today}.

USER'S DATA SHAPE:
${snapshot}

${contextSection ? contextSection + '\n\n' : ''}WHAT THIS APP CAN DO (compact index):
${capIndex}

For deeper detail on any page, call lookup_site_capability.

CONVERSATION SO FAR:
${history}

CRITICAL RULES:
1. NEVER state a dollar amount you have not directly read from a tool result. No estimates, no sums in your head.
2. For any total/sum, call aggregate_transactions — do NOT compute it yourself from a list of rows.
3. Non-deductible categories are excluded from revenue/expense queries unless the user explicitly asks about them.
4. If the user asks where to do something or find a feature, call lookup_site_capability first, then call link_user_to to give them a clickable destination. Always explain in one short sentence what they will do there. When linking to a specific invoice, use the projectSlug from the tool result (not the clientId/projectId). Invoice URLs follow the pattern /projects/{projectSlug}/invoices/{invoiceId}.
5. If on an editor page and the user asks for a change to the entity they're editing, prefer apply_*_edits over instructing them to type. Confirm destructive changes (delete a line item, change currency) before applying.
6. Plain text only. No markdown formatting — no #, no **, no bullet syntax, no backticks.`
}

export async function runOmniAgent(ctx: OmniContext): Promise<OmniResult> {
  const { userId, question, conversationHistory, pageContext, onStatus, onToken, onAction, onLink } = ctx

  onStatus('Loading your data overview…')
  const snapshot = await buildSnapshot(userId)

  const history = formatHistory(conversationHistory)

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt({ snapshot, pageContext, history }) },
    { role: 'user', content: question },
  ]

  const tools = getOmniTools(pageContext)

  const { answer, toolsUsed } = await runToolLoop({
    messages,
    tools,
    dispatchTool: (name, args) => dispatchOmniTool({ userId, name, args, pageContext, onAction, onLink }),
    model: AGENT_MODEL,
    maxRounds: MAX_ROUNDS,
    onStatus,
    onToken,
  })

  return { answer, toolsUsed }
}
