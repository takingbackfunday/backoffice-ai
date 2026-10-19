import { z } from 'zod'
import { runToolLoop } from '@/lib/agent/tool-loop'
import { RULES_AGENT_SYSTEM_PROMPT } from '@/lib/agent/run-rules-agent'
import { RULES_TOOLS } from '@/lib/agent/rules-tools'
import { StarterTemplateSchema } from '@/lib/quote-template-schemas'
import { DEEPSEEK_MODEL, openrouterChat, openrouterWithTools, type ChatMessage, type ToolDefinition } from '@/lib/llm/openrouter'
import { runAudaciousQuotePipeline } from '@/lib/quote-generator/audacious-pipeline'
import { getBank } from '@/lib/bank-import/banks'
import { decideNextAction } from '@/worker/navigator'
import type { PageSnapshot } from '@/worker/page-elements'
import { ValidationResultSchema } from '@/app/api/llm/validate-mapping/route'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function parseJson(raw: string, root: 'object' | 'array' = 'object'): unknown {
  let value = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const open = root === 'array' ? '[' : '{'
  const close = root === 'array' ? ']' : '}'
  const start = value.indexOf(open)
  const end = value.lastIndexOf(close)
  if (start >= 0 && end > start) value = value.slice(start, end + 1)
  return JSON.parse(value)
}

function object(value: unknown, label: string): Record<string, unknown> {
  assert(typeof value === 'object' && value !== null && !Array.isArray(value), `${label} must be an object`)
  return value as Record<string, unknown>
}

function tool(name: string, description: string, parameters: Record<string, unknown>): ToolDefinition {
  return { type: 'function', function: { name, description, parameters } }
}

const profileOutputSchema = z.object({
  templates: z.array(StarterTemplateSchema).min(1).max(4),
  serviceItems: z.array(z.object({
    description: z.string().min(1),
    unit: z.string().nullable().optional(),
    defaultRate: z.number().nonnegative(),
    defaultCostRate: z.number().nonnegative().nullable().optional(),
    tags: z.array(z.string()),
    groupName: z.string().optional(),
  })).min(1),
})

const cases: { name: string; run: () => Promise<void> }[] = [
  {
    name: 'transaction category ranking',
    run: async () => {
      const raw = await openrouterChat([
        { role: 'system', content: 'Rank the provided categories for this bank transaction. Return only a JSON array of {"id": string, "confidence": number} with valid IDs, descending confidence.' },
        { role: 'user', content: 'Description: TRADER JOE\'S MARKET. Payee: Trader Joe\'s. Amount: -42.18. Categories: [{"id":"groceries","name":"Groceries","group":"Personal"},{"id":"transport","name":"Transport","group":"Personal"},{"id":"software","name":"Software","group":"Business"}]' },
      ])
      const parsed = parseJson(raw, 'array')
      assert(Array.isArray(parsed) && parsed.length > 0, 'category ranking must return suggestions')
      const first = object(parsed[0], 'first category suggestion')
      assert(first.id === 'groceries', 'groceries must rank first for a supermarket transaction')
      assert(parsed.every((item) => ['groceries', 'transport', 'software'].includes(String(object(item, 'category suggestion').id))), 'category suggestions must use supplied IDs only')
    },
  },
  {
    name: 'CSV mapping and debit sign validation',
    run: async () => {
      const prompt = `You are a bank CSV expert. Validate these mappings and infer the amount sign. Return ONLY JSON with dateCol, amountCol, descCol, notesCol objects ({col, confidence, reason}) and amountSign ({value, confidence, reason}).
Headers: ["Posting Date","Details","Debit amount","Memo"]
Sample rows: [{"Posting Date":"2026-10-01","Details":"BLUEBIRD COFFEE","Debit amount":"12.50","Memo":"CARD"},{"Posting Date":"2026-10-02","Details":"PARKING GARAGE","Debit amount":"8.00","Memo":"CARD"}]
Proposed mapping: date=Posting Date, amount=Debit amount, description=Details, notes=Memo. Positive values in this debit column are expenses, so amountSign should be inverted.`
      const parsed = object(parseJson(await openrouterChat([{ role: 'user', content: prompt }], DEEPSEEK_MODEL, 4096)), 'mapping result')
      const validated = ValidationResultSchema.safeParse(parsed)
      assert(validated.success, 'mapping response must satisfy the application schema')
      assert(validated.data.dateCol.col === 'Posting Date', 'mapping should retain the date column')
      assert(validated.data.amountCol.col === 'Debit amount', 'mapping should retain the debit column')
      assert(validated.data.descCol.col === 'Details', 'mapping should select the transaction description')
      assert(validated.data.amountSign?.value === 'inverted', 'positive debits should be detected as inverted')
    },
  },
  {
    name: 'natural-language transaction search',
    run: async () => {
      const system = `You are a filter translator for a financial transactions table. Output a JSON object with a "filters" object and a one-sentence "explanation".

Today's date: 2026-10-19
Transaction date range in database: 2025-01-01 to 2026-10-19
Available categories: Food (id: cat-food), Transport (id: cat-transport)
Available payees: Uber
Available projects: none
Available accounts: Main Checking

IMPORTANT RULES:
- Amounts are signed: negative = expense, positive = income
- "expenses over $50" means amount <= -50, so set amountMax to "-50"
- Use "description" for keyword/merchant matching
- Use accountName when a specific bank account is referenced
- Date formats must be YYYY-MM-DD
- Only include relevant fields; use empty strings for irrelevant fields
- sortBy must be "date", "amount", "description", or "category"; sortDir must be "asc" or "desc"

Return ONLY JSON with this shape:
{"filters":{"search":"","description":"","accountName":"","payeeName":"","categoryId":"","workspaceId":"","amountMin":"","amountMax":"","dateFrom":"","dateTo":"","sortBy":"date","sortDir":"desc"},"explanation":"One sentence"}`
      const parsed = object(parseJson(await openrouterChat([
        { role: 'system', content: system },
        { role: 'user', content: 'Show Uber expenses over $50 from Main Checking between 2026-09-01 and 2026-09-30.' },
      ])), 'search result')
      const filters = object(parsed.filters, 'search filters')
      assert(String(filters.description).toLowerCase().includes('uber') || String(filters.payeeName).toLowerCase().includes('uber'), 'search should filter by Uber description or known payee')
      assert(filters.accountName === 'Main Checking', 'search should select the requested account')
      assert(Number(filters.amountMax) === -50, 'search should preserve signed expense semantics')
      assert(filters.dateFrom === '2026-09-01' && filters.dateTo === '2026-09-30', 'search should preserve the requested dates')
    },
  },
  {
    name: 'invoice note finalization',
    run: async () => {
      const invoice = { lineItems: [{ description: 'Electrical panel inspection', quantity: 2, unitPrice: 125 }], dueDate: '2026-10-31', currency: 'USD', notes: '', subtotal: 250, total: 250 }
      const prompt = `Review this invoice for a freelance electrician.

Invoice summary:
${JSON.stringify(invoice, null, 2)}

Client: Sample Client. Payment terms: 30 days net.

Return JSON ONLY: {"suggestedNotes":"complete payment terms paragraph, or null if notes already look good","questions":["clarifying question, or none"]}.

Notes guidance: cover payment method preference, late fee policy if appropriate, and a brief thank-you line. Professional but warm. Max 4 sentences. Return null if existing notes are already thorough.

Questions: ask only if something seems genuinely unclear or missing among the fields shown in the invoice summary. Do not ask about omitted fields managed elsewhere, such as invoice numbers, addresses, or company details.`
      const parsed = object(parseJson(await openrouterChat([{ role: 'user', content: prompt }], DEEPSEEK_MODEL)), 'invoice result')
      assert(parsed.suggestedNotes === null || typeof parsed.suggestedNotes === 'string', 'suggestedNotes must be a string or null')
      assert(Array.isArray(parsed.questions) && parsed.questions.every((question) => typeof question === 'string'), 'invoice questions must be strings')
      assert(!(parsed.questions as string[]).some((question) => /invoice number|invoice id/i.test(question)), 'finalizer must not ask about invoice identifiers that are outside its input')
    },
  },
  {
    name: 'invoice unit suggestion',
    run: async () => {
      const prompt = 'Given this line item, return JSON only: {"unit":"<short unit label>","confidence":"high"|"low"}. Use high only when the description clearly determines the unit. Line item: Two hours of brake repair labor.'
      const parsed = object(parseJson(await openrouterChat([{ role: 'user', content: prompt }], DEEPSEEK_MODEL)), 'unit result')
      assert(typeof parsed.unit === 'string' && parsed.unit.toLowerCase().includes('hour'), 'labor unit should be hours')
      assert(parsed.confidence === 'high', 'explicit hours should have high confidence')
    },
  },
  {
    name: 'quote-template structured generation',
    run: async () => {
      const prompt = `Generate one detailed quote template for a small residential bathroom renovation. Return only JSON: {"template":{"name":"...","sections":[{"name":"...","items":[{"description":"...","unit":"hr|day|x","quantity":1,"rate":100,"costRate":0,"tags":[],"isOptional":false}]}]}}. Include 2-4 phases, specific items, positive quantities and rates.`
      const parsed = object(parseJson(await openrouterChat([{ role: 'user', content: prompt }], DEEPSEEK_MODEL, 8192)), 'quote template result')
      const validated = StarterTemplateSchema.safeParse(parsed.template)
      assert(validated.success, 'generated quote template must satisfy the application schema')
      assert(validated.data.sections.length >= 2, 'quote template should include multiple project phases')
    },
  },
  {
    name: 'work-profile templates and service library',
    run: async () => {
      const prompt = `Generate quote templates and a reusable service-item library for this freelancer: "Independent bicycle mechanic specializing in repairs, tune-ups, and custom builds." Return only JSON shaped as {"templates":[{"name":"...","sections":[{"name":"...","items":[{"description":"...","unit":"hr|day|x","quantity":1,"rate":100,"costRate":0,"tags":[],"isOptional":false}]}]}],"serviceItems":[{"description":"...","unit":"hours","defaultRate":100,"defaultCostRate":0,"tags":[],"groupName":"..."}]}. Generate 2-4 templates; serviceItems must contain at least one item and use nonnegative numeric rates.`
      const parsed = profileOutputSchema.safeParse(parseJson(await openrouterChat([{ role: 'user', content: prompt }], DEEPSEEK_MODEL, 8192)))
      assert(parsed.success, 'work profile output must satisfy the application template/service-item schemas')
    },
  },
  {
    name: 'financial analysis narrative',
    run: async () => {
      const prompt = `You are a terse financial analyst. Use only these synthetic facts and return 3-5 concise bullet observations plus one action recommendation, plain text only: period Oct 1-15; income $1,500; expenses $1,000; net +$500; expenses are rent $800 and groceries $200; 12 transactions, all categorized; no uncategorized items.`
      const report = (await openrouterChat([{ role: 'user', content: prompt }], DEEPSEEK_MODEL)).trim()
      assert(report.length > 30, 'analysis report should not be empty')
      assert(/rent/i.test(report) && /grocer/i.test(report), 'analysis should reference the supplied top spending categories')
      assert(/500/.test(report), 'analysis should preserve the supplied net figure')
      assert(/recommend|action|consider|suggest/i.test(report), 'analysis should include an action recommendation')
    },
  },
  {
    name: 'rules-agent planning and suggestion tools',
    run: async () => {
      const planTool = RULES_TOOLS.find((item) => item.function.name === 'record_plan')
      const emitTool = RULES_TOOLS.find((item) => item.function.name === 'emit_rule_suggestion')
      assert(planTool && emitTool, 'production rules tools must expose planning and emission')
      const messages: ChatMessage[] = [
        { role: 'system', content: RULES_AGENT_SYSTEM_PROMPT },
        { role: 'user', content: `Financial database snapshot: one user; 3 transactions; all represent the same vendor.

AVAILABLE CATEGORIES:
- Food & Drink

EXISTING PAYEES:
- Bluebird Coffee

EXISTING RULES:
- none

UNCATEGORISED TRANSACTIONS:
- name:"Bluebird Coffee" | matchField:description | count:3 | total:-45.00 | descriptions: BLUEBIRD COFFEE #101 (-12.00) | BLUEBIRD COFFEE #102 (-15.00) | BLUEBIRD COFFEE #103 (-18.00)

TRANSACTIONS WITH CATEGORY BUT NO PAYEE:
- none

ALREADY-LABELLED PATTERNS WITHOUT A RULE:
- none

PROJECT-TAGGED TRANSACTIONS WITHOUT A PROJECT RULE:
- none

LIKELY ACCOUNT TRANSFERS:
- none

Call record_plan first. Then emit a rule for the Bluebird Coffee pattern using the exact category/payee names and a description-contains condition. Do not call database tools; all fixture data is already provided.` },
      ]
      let planned = false
      let emitted: Record<string, unknown> | null = null
      for (let round = 0; round < 4 && !emitted; round++) {
        const response = await openrouterWithTools(messages, round === 0 ? [planTool] : RULES_TOOLS, DEEPSEEK_MODEL)
        assert(response.tool_calls?.length, `rules agent must call a tool in round ${round + 1}`)
        messages.push({ role: 'assistant', content: response.content ?? '', tool_calls: response.tool_calls } as unknown as ChatMessage)
        for (const call of response.tool_calls) {
          const args = object(JSON.parse(call.function.arguments), `${call.function.name} arguments`)
          if (call.function.name === 'record_plan') {
            planned = true
            assert(String(args.summary).toLowerCase().includes('bluebird'), 'rule plan should identify the synthetic merchant')
            messages.push({ role: 'tool', tool_call_id: call.id, content: 'Synthetic plan recorded.' })
          } else if (call.function.name === 'emit_rule_suggestion') {
            assert(planned, 'rule suggestion must follow the plan')
            emitted = args
            messages.push({ role: 'tool', tool_call_id: call.id, content: 'Emitted: accepted by synthetic evaluator.' })
          } else if (call.function.name === 'finish_analysis') {
            messages.push({ role: 'tool', tool_call_id: call.id, content: 'FINISH_ANALYSIS' })
          } else {
            messages.push({ role: 'tool', tool_call_id: call.id, content: 'This fixture data is preloaded; no database access is available in this evaluation.' })
          }
        }
      }
      assert(emitted, 'rules agent must emit a suggestion within four rounds')
      assert(emitted.categoryName === 'Food & Drink', 'rule must copy the supplied category exactly')
      assert(emitted.payeeName === 'Bluebird Coffee', 'rule must reuse the exact known payee')
      const conditions = object(emitted.conditions, 'rule conditions')
      const all = Array.isArray(conditions.all) ? conditions.all : []
      assert(all.some((condition) => {
        const item = object(condition, 'rule condition')
        return item.field === 'description' && item.operator === 'contains' && String(item.value).toLowerCase().includes('bluebird')
      }), 'rule must anchor on a merchant description condition')
    },
  },
  {
    name: 'omni-agent tool loop and streamed answer',
    run: async () => {
      const lookupTool = tool('lookup_fixture_balance', 'Return the synthetic account balance. You must call this tool; do not infer the value.', {
        type: 'object', properties: {}, required: [],
      })
      const streamed: string[] = []
      const result = await runToolLoop({
        messages: [
          { role: 'system', content: 'Use tools for account data. Never invent financial values.' },
          { role: 'user', content: 'What is the exact remaining balance? Call lookup_fixture_balance first.' },
        ],
        tools: [lookupTool],
        dispatchTool: async () => JSON.stringify({ remaining: 37.5, currency: 'USD' }),
        model: DEEPSEEK_MODEL,
        maxRounds: 3,
        onStatus: () => {},
        onToken: (text) => streamed.push(text),
      })
      assert(result.toolsUsed.includes('lookup_fixture_balance'), 'assistant must call the fixture data tool')
      assert(/37\.5/.test(result.answer), 'final answer must use the tool result')
      assert(streamed.join('').length > 0, 'final answer must stream tokens')
    },
  },
  {
    name: 'bank-import safe navigation action',
    run: async () => {
      const snapshot: PageSnapshot = {
        url: 'https://secure.chase.com/web/activity/download',
        title: 'Download account activity',
        textExcerpt: 'Export account activity. CSV is selected. The requested date range is displayed. Click Download CSV to continue.',
        elements: [
          { id: 1, frameIndex: 0, tag: 'input', type: 'radio', text: 'CSV', checked: true, disabled: false },
          { id: 2, frameIndex: 0, tag: 'input', type: 'text', text: 'From date', value: '09/01/2026', disabled: false },
          { id: 3, frameIndex: 0, tag: 'input', type: 'text', text: 'To date', value: '09/30/2026', disabled: false },
          { id: 4, frameIndex: 0, tag: 'button', text: 'Download CSV', disabled: false },
        ],
        frameCount: 1,
        snapshotFailureCount: 0,
        locate: () => null,
      }
      const result = await decideNextAction({
        bank: getBank('chase')!,
        accountName: 'Synthetic Checking',
        from: '2026-09-01',
        to: '2026-09-30',
        snapshot,
        history: ['CSV is selected.', 'The requested date range is set and verified.'],
        notes: [],
      })
      assert(result.action?.action === 'download', 'navigator should select the safe download action')
      assert(result.action.intent === 'download_csv' && result.action.elementId === 4, 'navigator should target the CSV download button')
    },
  },
  {
    name: 'audacious quote pipeline with synthetic web search',
    run: async () => {
      const originalFetch = globalThis.fetch
      const originalTavilyKey = process.env.TAVILY_API_KEY
      process.env.TAVILY_API_KEY = 'synthetic-eval-only'
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (url === 'https://api.tavily.com/search') {
          return new Response(JSON.stringify({
            answer: 'Synthetic benchmark: experienced freelance Webflow implementations commonly range from $8,000 to $20,000.',
            results: [{ title: 'Synthetic pricing benchmark', url: 'https://synthetic.example.test/webflow-pricing', content: 'Synthetic fixture only: comparable 10-page SaaS Webflow projects cost $8,000-$20,000.', score: 1 }],
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        return originalFetch(input, init)
      }) as typeof fetch
      try {
        const events = []
        for await (const event of runAudaciousQuotePipeline({
          description: 'Redesign and build a 10-page B2B cybersecurity SaaS marketing site in Webflow. Deliverables include discovery, wireframes, visual design, responsive implementation, CMS migration, QA, and handoff. Timeline is eight weeks with two review rounds.',
          workDescription: 'Senior freelance digital product designer and Webflow developer for enterprise SaaS clients.',
          currency: 'USD',
        })) events.push(event)
        assert(events.some((event) => event.type === 'status' && event.step === 'searching'), 'quote pipeline should use its web-search tool')
        const generated = events.find((event) => event.type === 'template')
        const failure = events.find((event) => event.type === 'error')
        assert(generated?.type === 'template', `quote pipeline should generate and validate a template${failure?.type === 'error' ? ` (step ${failure.step}: ${failure.message})` : ''}`)
        assert(generated.data.searchSources.includes('https://synthetic.example.test/webflow-pricing'), 'quote should retain its synthetic research source')
        assert(generated.data.template.sections.length >= 3 && generated.data.template.sections.length <= 6, 'quote should include 3-6 project phases')
      } finally {
        globalThis.fetch = originalFetch
        if (originalTavilyKey === undefined) delete process.env.TAVILY_API_KEY
        else process.env.TAVILY_API_KEY = originalTavilyKey
      }
    },
  },
]

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY is required; load it from .env.local.')
  const filters = process.argv.filter((arg) => arg.startsWith('--case=')).map((arg) => arg.slice('--case='.length).toLowerCase())
  const selectedCases = filters.length
    ? cases.filter((evaluation) => filters.some((filter) => evaluation.name.toLowerCase().includes(filter)))
    : cases
  if (!selectedCases.length) throw new Error(`No evaluation case matched: ${filters.join(', ')}`)
  console.log(`Live synthetic evaluation: ${DEEPSEEK_MODEL}`)
  const results: { name: string; durationMs: number; error?: string }[] = []
  for (const evaluation of selectedCases) {
    const startedAt = Date.now()
    try {
      await evaluation.run()
      results.push({ name: evaluation.name, durationMs: Date.now() - startedAt })
      console.log(`PASS ${evaluation.name} (${Date.now() - startedAt}ms)`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown evaluation error'
      results.push({ name: evaluation.name, durationMs: Date.now() - startedAt, error: message })
      console.error(`FAIL ${evaluation.name}: ${message}`)
    }
  }

  const failed = results.filter((result) => result.error)
  console.log(`\nResult: ${results.length - failed.length}/${results.length} passed; OCR intentionally excluded.`)
  if (failed.length) process.exitCode = 1
}

main().catch((error) => {
  console.error('DeepSeek evaluation could not start:', error instanceof Error ? error.message : 'Unknown error')
  process.exitCode = 1
})
