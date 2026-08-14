import type { ToolDefinition } from '@/lib/llm/openrouter'
import { FINANCE_TOOLS, dispatchTool as dispatchFinanceTool } from './finance-tools'
import { PROPERTY_TOOLS, dispatchPropertyTool } from './property-tools'
import { STUDIO_TOOLS, dispatchStudioTool } from './studio-tools'
import { runRulesAgent } from './run-rules-agent'
import { searchCapabilities, findCapability } from './site-capabilities-loader'
import { tavilySearch, formatSearchResultsForLlm, TavilyError } from '@/lib/llm/tavily'
import type { SerializablePageContext, EditorAction } from './page-context'

export interface LinkPayload {
  route: string
  anchor?: string
  label?: string
  reason: string
}

const PROPERTY_TOOL_NAMES = new Set(PROPERTY_TOOLS.map(t => t.function.name))
const STUDIO_TOOL_NAMES = new Set(STUDIO_TOOLS.map(t => t.function.name))

const SITE_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'lookup_site_capability',
      description: 'Search the app capability index for a page that handles a given task. Use when the user asks "where do I X" or you need to find which page handles a task.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Natural language description of the task or feature to find' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'link_user_to',
      description: 'Send the user a clickable link to a specific page or anchor. Always include a one-sentence reason describing what they will do there.',
      parameters: {
        type: 'object',
        required: ['route', 'reason'],
        properties: {
          route: { type: 'string', description: 'App route, e.g. /settings' },
          anchor: { type: 'string', description: 'Hash anchor, e.g. #business-address' },
          label: { type: 'string', description: 'Short link label; defaults to page title if omitted' },
          reason: { type: 'string', description: 'One sentence describing what the user will do there' },
        },
      },
    },
  },
]

const WEB_SEARCH_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the web for information. Use this for: market rates, pricing benchmarks, industry standards, current events, or any factual question that goes beyond the user\'s financial data. Returns summarized results with source URLs.',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
    },
  },
}

const CONSULT_RULES_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'consult_rules_agent',
    description: 'Hand off a rule-suggestion task to the rules agent. Use when the user asks for help creating categorisation rules or wants AI suggestions based on their uncategorised transactions.',
    parameters: {
      type: 'object',
      required: ['instruction'],
      properties: {
        instruction: { type: 'string', description: 'What the user wants the rules agent to do' },
      },
    },
  },
}

const APPLY_INVOICE_EDITS_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'apply_invoice_edits',
    description: 'Apply structured edits to the invoice the user is currently editing. Actions appear with a throb highlight and a confirm/undo bar. ONLY available when the user is on an invoice editor page.',
    parameters: {
      type: 'object',
      required: ['actions'],
      properties: {
        actions: {
          type: 'array',
          description: 'List of editor actions to apply',
          items: {
            type: 'object',
            required: ['type'],
            properties: {
              type: { type: 'string', enum: ['set_line_items', 'set_tax', 'set_due_date', 'set_notes', 'set_currency'] },
              lineItems: {
                type: 'array',
                description: 'Full replacement line items (for set_line_items)',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    description: { type: 'string' },
                    quantity: { type: 'string' },
                    qtyUnit: { type: 'string' },
                    unitPrice: { type: 'string' },
                    isTaxLine: { type: 'boolean' },
                  },
                },
              },
              label: { type: 'string', description: 'Tax label (for set_tax)' },
              amount: { type: 'number', description: 'Tax amount (for set_tax)' },
              value: { type: 'string', description: 'Value for set_due_date, set_notes, or set_currency' },
            },
          },
        },
      },
    },
  },
}

const APPLY_QUOTE_EDITS_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'apply_quote_edits',
    description: 'Apply structured edits to the quote the user is currently reviewing. Supports setting item prices/pricing fields, sections/scope (with cost fields — costRate/tags are internal, never client-visible), title, notes, terms, currency, and valid-until date. ONLY available when the user is on the quote generate/review page.',
    parameters: {
      type: 'object',
      required: ['actions'],
      properties: {
        actions: {
          type: 'array',
          description: 'List of editor actions to apply',
          items: {
            type: 'object',
            required: ['type'],
            properties: {
              type: { type: 'string', enum: ['set_sections', 'set_title', 'set_item_prices', 'set_notes', 'set_currency', 'set_quote_terms', 'set_valid_until'] },
              value: { type: 'string', description: 'String value for set_title, set_notes, set_currency, set_quote_terms, or set_valid_until (YYYY-MM-DD)' },
              sections: {
                type: 'array',
                description: 'Full replacement sections (for set_sections — replaces all existing sections and items)',
                items: {
                  type: 'object',
                  required: ['name', 'items'],
                  properties: {
                    name: { type: 'string' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['description', 'quantity', 'qtyUnit'],
                        properties: {
                          description: { type: 'string' },
                          quantity: { type: 'string', description: 'Number as string, e.g. "6"' },
                          qtyUnit: { type: 'string', description: 'Unit label, e.g. "hrs", "days", "eps"' },
                          unitPrice: { type: 'string', description: 'Sell price per unit as string, e.g. "150"' },
                          costRate: { type: 'string', description: 'Internal cost rate per unit as string, e.g. "120" — never client-visible' },
                          tags: { type: 'string', description: 'Comma-separated tags, e.g. "design, dev" — internal, never client-visible' },
                          isOptional: { type: 'boolean' },
                        },
                      },
                    },
                  },
                },
              },
              items: {
                type: 'array',
                description: 'Item prices to set (for set_item_prices — matched by description)',
                items: {
                  type: 'object',
                  required: ['description', 'unitPrice'],
                  properties: {
                    description: { type: 'string', description: 'Exact item description to match' },
                    unitPrice: { type: 'number', description: 'New sell price for this item' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
}

export function getOmniTools(pageContext?: SerializablePageContext): ToolDefinition[] {
  const base: ToolDefinition[] = [...FINANCE_TOOLS, ...PROPERTY_TOOLS, ...STUDIO_TOOLS, ...SITE_TOOLS, CONSULT_RULES_TOOL, WEB_SEARCH_TOOL]

  if (!pageContext) return base

  const cap = findCapability(pageContext.pathname)
  if (cap?.editorContext === 'invoice') base.push(APPLY_INVOICE_EDITS_TOOL)
  if (cap?.editorContext === 'quote') base.push(APPLY_QUOTE_EDITS_TOOL)

  return base
}

export async function dispatchOmniTool(opts: {
  userId: string
  name: string
  args: unknown
  pageContext?: SerializablePageContext
  onAction: (target: 'invoice' | 'quote', action: EditorAction) => void
  onLink: (link: LinkPayload) => void
}): Promise<string> {
  const { userId, name, args, onAction, onLink } = opts

  if (name === 'lookup_site_capability') {
    const query = (args as { query: string }).query ?? ''
    const matches = searchCapabilities(query, 5)
    return JSON.stringify(matches)
  }

  if (name === 'link_user_to') {
    const link = args as LinkPayload
    onLink(link)
    return `Linked user to ${link.route}${link.anchor ?? ''}.`
  }

  if (name === 'web_search') {
    const query = (args as { query: string }).query ?? ''
    try {
      const result = await tavilySearch(query, { maxResults: 5, includeAnswer: true })
      return formatSearchResultsForLlm(result)
    } catch (err) {
      if (err instanceof TavilyError) {
        return `Web search unavailable: ${err.message}`
      }
      return `Web search failed: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  if (name === 'consult_rules_agent') {
    const summaries: string[] = []
    let errorMsg: string | null = null
    await runRulesAgent(userId, (event) => {
      if (event.type === 'suggestion' && event.rule) {
        const conds = event.rule.conditions.all
          ? event.rule.conditions.all.map(c => `${c.field} ${c.operator} "${c.value}"`).join(' AND ')
          : event.rule.conditions.any
            ? event.rule.conditions.any.map(c => `${c.field} ${c.operator} "${c.value}"`).join(' OR ')
            : ''
        summaries.push(`- ${conds} → category: ${event.rule.categoryName}${event.rule.payeeName ? `, payee: ${event.rule.payeeName}` : ''} (${event.rule.confidence} confidence)`)
      }
      if (event.type === 'error') errorMsg = event.error ?? 'Unknown rules agent error'
    })
    if (errorMsg) return `Rules agent error: ${errorMsg}`
    if (!summaries.length) return 'Rules agent completed — no new suggestions found. All transactions may already be categorised.'
    return `Rules agent found ${summaries.length} suggestion(s):\n${summaries.join('\n')}\n\nNavigate to /rules to review and apply them.`
  }

  if (name === 'apply_invoice_edits') {
    const actions = (args as { actions: EditorAction[] }).actions ?? []
    for (const a of actions) onAction('invoice', a)
    return `Applied ${actions.length} edit(s) to the invoice. The user will see them highlighted in their editor with a confirm/undo bar.`
  }

  if (name === 'apply_quote_edits') {
    const actions = (args as { actions: EditorAction[] }).actions ?? []
    for (const a of actions) onAction('quote', a)
    return `Applied ${actions.length} edit(s) to the quote. The user will see them updated in their editor.`
  }

  if (PROPERTY_TOOL_NAMES.has(name)) return dispatchPropertyTool(userId, name, args)
  if (STUDIO_TOOL_NAMES.has(name)) return dispatchStudioTool(userId, name, args)
  return dispatchFinanceTool(userId, name, args)
}
