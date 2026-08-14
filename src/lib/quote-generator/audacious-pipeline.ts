import { openrouterWithTools, type ChatMessage, type ToolDefinition } from '@/lib/llm/openrouter'
import { tavilySearch, formatSearchResultsForLlm, TavilyError } from '@/lib/llm/tavily'
import { StarterTemplateSchema, type StarterTemplate } from '@/lib/quote-template-schemas'
import { logger } from '@/lib/log'

// ── Types ───────────────────────────────────────────────────────────

export interface ClarificationQuestion {
  question: string
  context: string
  suggestions: string[]
}

export interface PipelineResult {
  template: StarterTemplate
  searchSources: string[]
  assumptions: string[]
  pricingRationale: string
}

export type PipelineEvent =
  | { type: 'status'; step: string; message: string }
  | { type: 'clarification_needed'; questions: ClarificationQuestion[] }
  | { type: 'template'; data: PipelineResult }
  | { type: 'error'; step: string; message: string; detail?: string }
  | { type: 'done' }

// ── System prompt ───────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an aggressive pricing strategist for freelance professionals. Your job is to generate the most audacious, comprehensive quote template possible for the described project.

CONTEXT: The freelancers using this system routinely undercharge and under-scope their work. Your job is to push them toward what their work is actually worth.

PRICING RULES:
- Price at the TOP of the market range for the freelancer's discipline and experience level
- Use value-based pricing (what is this worth to the client's business?) not just hourly rates
- Every line item should have a premium rate — not "competitive", PREMIUM
- Include quantity and unit that make sense (hr/day/x)

SCOPE RULES:
- Break the project into 3-6 logical phases/sections
- Each section should have 2-6 specific, actionable line items
- Include items that freelancers typically FORGET to charge for:
  - Discovery/research/strategy phases
  - Project management and client communication
  - Revisions (specify how many rounds)
  - File preparation and delivery
  - Rush fees or expedited delivery as optional add-ons
  - Licensing or usage rights
  - Source file handover as optional
  - Post-delivery support period as optional
- Mark premium add-ons as isOptional: true

CLARIFICATION — READ CAREFULLY:
If the project description is too vague to generate a confident quote (missing key details like: project scale, timeline, client industry, deliverable format), you MUST respond with ONLY this exact JSON — no natural language, no prose, no explanations:
{"needs_clarification": true, "questions": [{"question": "...", "context": "why this matters", "suggestions": ["option1", "option2", "option3"]}]}

If you respond with natural language instead of this JSON format, the pipeline will error and the user will see "The AI returned malformed JSON" instead of your questions. You must use the exact structured format above.

Only ask clarification questions if the description is genuinely ambiguous. 1-3 questions max. If you can make reasonable assumptions, do so instead.

OUTPUT FORMAT (use when you have enough information):
Respond with ONLY valid JSON:
{
  "template": {
    "name": "Project title",
    "sections": [
      {
        "name": "Section name",
        "items": [
          {
            "description": "Specific deliverable or activity",
            "unit": "hr|day|x",
            "quantity": <number>,
            "rate": <premium rate in dollars>,
            "costRate": <internal cost, 0 if unknown>,
            "tags": ["keyword1", "keyword2"],
            "isOptional": false
          }
        ]
      }
    ]
  },
  "assumptions": ["assumption 1", "assumption 2"],
  "pricing_rationale": "1-2 sentences explaining the pricing strategy"
}

WEB SEARCH:
You have access to a web_search tool. Use it to verify that your proposed rates are within market range for this type of work. Search for typical freelance rates, project costs, or industry pricing benchmarks relevant to the project description. Do at least 1 search, at most 3.

Return ONLY valid JSON — no markdown, no code fences, no prose before or after.`

// ── Tools ───────────────────────────────────────────────────────────

const WEB_SEARCH_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the web for market rates, pricing benchmarks, or industry standards for freelance services. Use this to validate that your proposed pricing is at market-top level.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query, e.g. "freelance video production rates 2025" or "brand identity design pricing benchmark"',
        },
      },
      required: ['query'],
    },
  },
}

// ── Pipeline ────────────────────────────────────────────────────────

const MODEL = 'anthropic/claude-sonnet-4.6'
const MAX_TOOL_ROUNDS = 5

export async function* runAudaciousQuotePipeline(opts: {
  description: string
  clarificationAnswers?: string[]
  workDescription?: string | null
}): AsyncGenerator<PipelineEvent> {
  const { description, clarificationAnswers, workDescription } = opts

  // ── Step 0: Build messages ────────────────────────────────────────
  yield { type: 'status', step: 'analyzing', message: 'Analyzing project description...' }

  const userParts: string[] = [description]

  if (workDescription) {
    userParts.push(`\nFreelancer's general line of work: ${workDescription}`)
  }

  if (clarificationAnswers && clarificationAnswers.length > 0) {
    userParts.push(`\nAdditional context from clarification:`)
    for (const answer of clarificationAnswers) {
      userParts.push(`- ${answer}`)
    }
  }

  userParts.push('\nGenerate the most audacious, comprehensive quote template for this project. Price aggressively. Include everything the freelancer should be charging for but probably isn\'t.')

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userParts.join('\n') },
  ]

  // ── Step 1-N: Tool loop with web search ───────────────────────────
  const searchSources: string[] = []
  let raw = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let response: Awaited<ReturnType<typeof openrouterWithTools>>

    try {
      response = await openrouterWithTools(messages, [WEB_SEARCH_TOOL], MODEL)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('audacious-quote', 'LLM call failed', { round, error: msg })
      yield {
        type: 'error',
        step: 'generation',
        message: `AI generation failed${round > 0 ? ` on round ${round + 1}` : ''}. ${msg}`,
        detail: msg,
      }
      return
    }

    // No tool calls → we have the final content
    if (!response.tool_calls || response.tool_calls.length === 0) {
      raw = response.content ?? ''

      // Check for clarification request
      const clarification = tryParseClarification(raw)
      if (clarification) {
        logger.info('audacious-quote', 'clarification requested', { questionCount: clarification.length })
        yield { type: 'clarification_needed', questions: clarification }
        return
      }

      break
    }

    // Append assistant message once (before tool results)
    const assistantMsg: Record<string, unknown> = { role: 'assistant' }
    if (response.content) assistantMsg.content = response.content
    if (response.tool_calls) assistantMsg.tool_calls = response.tool_calls
    if (!assistantMsg.content && !assistantMsg.tool_calls) assistantMsg.content = ''
    messages.push(assistantMsg as unknown as ChatMessage)

    // Execute tool calls
    for (const tc of response.tool_calls) {
      const toolName = tc.function.name

      if (toolName === 'web_search') {
        yield { type: 'status', step: 'searching', message: `Searching the web: ${tc.function.arguments.slice(0, 80)}...` }

        let searchResult: string
        try {
          const args = JSON.parse(tc.function.arguments) as { query: string }
          const searchResponse = await tavilySearch(args.query, { maxResults: 5, includeAnswer: true })

          for (const r of searchResponse.results ?? []) {
            searchSources.push(r.url)
          }

          searchResult = formatSearchResultsForLlm(searchResponse)
        } catch (err) {
          if (err instanceof TavilyError) {
            searchResult = `Web search unavailable: ${err.message}. Proceed with your best pricing estimate based on your training data.`
          } else {
            searchResult = `Web search failed: ${err instanceof Error ? err.message : String(err)}. Proceed with your best pricing estimate.`
          }
          logger.warn('audacious-quote', 'search failed, continuing without', {
            error: err instanceof Error ? err.message : String(err),
          })
        }

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: searchResult,
        })
      } else {
        // Unknown tool — return error result so model can correct
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: `Unknown tool: ${toolName}. Only web_search is available.`,
        })
      }
    }

    yield { type: 'status', step: 'generating', message: `Generating quote (round ${round + 1})...` }
  }

  // ── Step N: Parse and validate output ─────────────────────────────
  yield { type: 'status', step: 'validating', message: 'Validating generated quote...' }

  if (!raw) {
    yield {
      type: 'error',
      step: 'generation',
      message: 'The AI produced no output after all tool rounds. This usually means the model ran out of context or the search results were too large. Try a shorter, more focused description.',
    }
    return
  }

  // Extract JSON
  let jsonStr = raw.trim()
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonStr = fenceMatch[1].trim()
  const objMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (objMatch) jsonStr = objMatch[0]

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    // Try repair heuristics (same as existing route)
    const repaired = tryRepairJson(jsonStr)
    if (repaired) {
      try { parsed = JSON.parse(repaired) } catch { /* fall through */ }
    }
    if (parsed === undefined) {
      logger.error('audacious-quote', 'JSON parse failed', { raw: raw.slice(0, 500) })
      yield {
        type: 'error',
        step: 'parsing',
        message: 'The AI returned malformed JSON. This can happen with very complex descriptions. Try simplifying or shortening your description.',
        detail: jsonStr.slice(0, 500),
      }
      return
    }
  }

  // Check again for clarification in the parsed output (belt-and-braces)
  const clarification = tryParseClarification(raw)
  if (clarification) {
    yield { type: 'clarification_needed', questions: clarification }
    return
  }

  // Manual extraction — the output wraps template with extra fields
  const parsedObj = parsed as Record<string, unknown>
  const templateData = parsedObj.template ?? parsedObj
  const assumptions = Array.isArray(parsedObj.assumptions) ? parsedObj.assumptions as string[] : []
  const pricingRationale = typeof parsedObj.pricing_rationale === 'string' ? parsedObj.pricing_rationale : ''

  const result = StarterTemplateSchema.safeParse(templateData)
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    logger.error('audacious-quote', 'Schema validation failed', {
      errors: result.error.issues.map(i => i.message),
    })
    yield {
      type: 'error',
      step: 'validation',
      message: `The generated quote didn't match the expected format: ${issues}. Try again — this is usually a one-off.`,
      detail: issues,
    }
    return
  }

  yield {
    type: 'template',
    data: {
      template: result.data,
      searchSources: [...new Set(searchSources)],
      assumptions,
      pricingRationale,
    },
  }

  yield { type: 'done' }
}

// ── Helpers ─────────────────────────────────────────────────────────

function tryParseClarification(raw: string): ClarificationQuestion[] | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    if (parsed.needs_clarification === true && Array.isArray(parsed.questions)) {
      return (parsed.questions as Record<string, unknown>[]).map(q => ({
        question: String(q.question ?? ''),
        context: String(q.context ?? ''),
        suggestions: Array.isArray(q.suggestions) ? q.suggestions.map(String) : [],
      }))
    }
  } catch {
    // not a clarification — that's fine
  }

  const naturalLangPatterns = [
    /need a bit more information/i,
    /need a little more information/i,
    /need more detail/i,
    /could you (describe|tell me|elaborate|clarify|provide)/i,
    /i('d| would) need (to know|more)/i,
    /to help you better/i,
    /what type of work/i,
    /what kind of project/i,
    /what's the scope/i,
  ]
  if (naturalLangPatterns.some(p => p.test(raw))) {
    return [{
      question: 'Could you describe your project in more detail?',
      context: 'The AI needs more specific information about the project to generate a useful quote template.',
      suggestions: ['Brand identity design', 'Website development', 'Video production', 'Social media strategy'],
    }]
  }

  return null
}

function tryRepairJson(s: string): string | null {
  const firstBrace = s.indexOf('{')
  const lastBrace = s.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1) return null
  s = s.slice(firstBrace, lastBrace + 1)
  s = s.replace(/,(\s*[}\]])/g, '$1')
  s = s.replace(/(["\d])\s*\n\s*(?=["\d{])/g, '$1,')
  s = s.replace(/}\s*{/g, '},{')
  return s
}
