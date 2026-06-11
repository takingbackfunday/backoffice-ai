import { findCapability, capabilityIndexSummary } from '../site-capabilities-loader'
import type { SerializablePageContext } from '../page-context'

export function buildOmniSystemPrompt(opts: {
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
