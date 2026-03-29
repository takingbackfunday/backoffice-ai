import { openrouterChat } from '@/lib/llm/openrouter'
import type { DomainClassification } from '@/lib/agent/types'

const CLASSIFIER_MODEL = 'google/gemini-2.0-flash-lite-001'

export async function classifyDomain(question: string): Promise<DomainClassification> {
  const prompt = `You are a domain router for a property management and personal finance application.

Classify the following question into one or two domains:
- "finance": questions about bank transactions, income, expenses, categories, budgets, cash flow, payees, tax, rules
- "property": questions about properties, units, tenants, leases, rent, maintenance, occupancy, vacancies, tenant payments

Respond with ONLY valid JSON in this exact format:
{
  "primary": "finance" | "property",
  "secondary": "finance" | "property" | null,
  "reasoning": "one sentence explanation"
}

Question: ${question}`

  try {
    const raw = await openrouterChat([{ role: 'user', content: prompt }], CLASSIFIER_MODEL)
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON in response')
    const parsed = JSON.parse(match[0]) as DomainClassification
    if (parsed.primary !== 'finance' && parsed.primary !== 'property') throw new Error('Invalid domain')
    return parsed
  } catch {
    // Default: finance for anything ambiguous
    return { primary: 'finance', secondary: null, reasoning: 'Fallback due to classifier error.' }
  }
}
