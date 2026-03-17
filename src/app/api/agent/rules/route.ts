import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { openrouterChat } from '@/lib/llm/openrouter'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SseEvent {
  type: 'status' | 'suggestion' | 'done' | 'error'
  message?: string
  rule?: RuleSuggestionRaw & { categoryId: string | null; payeeId: string | null }
  reasoning?: string
  matchCount?: number
  error?: string
}

interface RuleSuggestionRaw {
  conditions: {
    all?: { field: string; operator: string; value: string | number | string[] }[]
    any?: { field: string; operator: string; value: string | number | string[] }[]
  }
  categoryName: string
  payeeName: string | null
  confidence: 'high' | 'medium'
  reasoning: string
}

// ── SSE helper ────────────────────────────────────────────────────────────────

function encode(event: SseEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const { userId } = await auth()
  if (!userId) {
    return new Response('Unauthorized', { status: 401 })
  }

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: SseEvent) {
        controller.enqueue(encode(event))
      }

      try {
        // Step 1 – fetch data
        send({ type: 'status', message: 'Fetching transactions…' })

        const [transactions, existingRules, categories, payees] = await Promise.all([
          prisma.transaction.findMany({
            where: { account: { userId } },
            select: {
              id: true,
              amount: true,
              description: true,
              date: true,
              categoryId: true,
              payeeId: true,
              payee: { select: { id: true, name: true } },
            },
          }),
          prisma.categorizationRule.findMany({
            where: { userId, isActive: true },
            include: { categoryRef: { include: { group: true } } },
          }),
          prisma.category.findMany({
            where: { userId },
            include: { group: { select: { id: true, name: true } } },
          }),
          prisma.payee.findMany({
            where: { userId },
            select: { id: true, name: true },
          }),
        ])

        // Step 2 – compute analytics
        const uncategorisedCount = transactions.filter((t) => !t.categoryId).length
        const noPayeeCount = transactions.filter((t) => !t.payeeId).length
        send({ type: 'status', message: `Analysing ${uncategorisedCount} uncategorised and ${noPayeeCount} unmatched-payee transactions…` })

        const uncategorised = transactions.filter((t) => !t.categoryId)

        // Group uncategorised txns by their best identifier
        // Only use first-word grouping if it's ≥5 chars (avoids junk keys like "THE", "WM")
        type PayeeGroup = { count: number; total: number; samples: string[]; matchField: 'payeeName' | 'description'; matchValue: string }
        const byPayee = new Map<string, PayeeGroup>()
        for (const tx of uncategorised) {
          let matchField: 'payeeName' | 'description'
          let key: string
          if (tx.payee?.name) {
            matchField = 'payeeName'
            key = tx.payee.name
          } else {
            // Use first meaningful token (≥5 chars) or first two words, whichever is more specific
            const words = tx.description.trim().split(/\s+/)
            const firstMeaningful = words.find((w) => w.length >= 5) ?? words[0]
            // Use up to 2 words as key to avoid over-grouping on short prefixes
            const twoWords = words.slice(0, 2).join(' ')
            key = twoWords.length >= 6 ? twoWords : firstMeaningful
            matchField = 'description'
          }
          if (!key || key.length < 2) continue
          const entry = byPayee.get(key) ?? { count: 0, total: 0, samples: [], matchField, matchValue: key }
          entry.count++
          entry.total += Number(tx.amount)
          if (entry.samples.length < 3) entry.samples.push(tx.description.slice(0, 60))
          byPayee.set(key, entry)
        }

        // Top 20 by count, minimum 2 transactions to be worth suggesting
        const uncategorisedByPayee = [...byPayee.entries()]
          .filter(([, v]) => v.count >= 2)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 20)
          .map(([name, v]) => ({ name, count: v.count, totalAmount: v.total, sampleDescriptions: v.samples, matchField: v.matchField }))

        // Singletons — uncategorised txns that didn't land in any group (count === 1)
        // Collect the actual transaction objects for these
        const groupedKeys = new Set(
          [...byPayee.entries()].filter(([, v]) => v.count >= 2).map(([k]) => k)
        )
        const singletonTxns: { id: string; description: string; amount: number }[] = []
        for (const tx of uncategorised) {
          let key: string
          if (tx.payee?.name) {
            key = tx.payee.name
          } else {
            const words = tx.description.trim().split(/\s+/)
            const firstMeaningful = words.find((w) => w.length >= 5) ?? words[0]
            const twoWords = words.slice(0, 2).join(' ')
            key = twoWords.length >= 6 ? twoWords : firstMeaningful
          }
          if (!groupedKeys.has(key)) {
            singletonTxns.push({ id: tx.id, description: tx.description, amount: Number(tx.amount) })
          }
        }
        // Deduplicate by description (same description = same merchant, only show once)
        const seenSingletonDescs = new Set<string>()
        const singletons = singletonTxns
          .filter((t) => {
            const key = t.description.toLowerCase()
            if (seenSingletonDescs.has(key)) return false
            seenSingletonDescs.add(key)
            return true
          })
          .slice(0, 20)

        // Description clusters — only for txns with no payee
        // Only include clusters where the key appears in all samples (avoids false grouping)
        const noPayeeTxns = uncategorised.filter((t) => !t.payee)
        const descClusters = new Map<string, { count: number; total: number; samples: string[] }>()
        for (const tx of noPayeeTxns) {
          const words = tx.description.trim().split(/\s+/)
          const key = words.slice(0, 2).join(' ')
          if (!key || key.length < 4) continue
          const e = descClusters.get(key) ?? { count: 0, total: 0, samples: [] }
          e.count++
          e.total += Number(tx.amount)
          if (e.samples.length < 3) e.samples.push(tx.description.slice(0, 60))
          descClusters.set(key, e)
        }
        // Only include clusters already represented in uncategorisedByPayee if they add new info
        const uncategorisedKeys = new Set(uncategorisedByPayee.map((u) => u.name.toLowerCase()))
        const descriptionClusters = [...descClusters.entries()]
          .filter(([key, v]) => v.count >= 2 && !uncategorisedKeys.has(key.toLowerCase()))
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 10)
          .map(([cluster, v]) => ({ cluster, count: v.count, totalAmount: v.total }))

        // No-payee groups — transactions that have a category but no payee assigned
        // Group by description prefix, suggest a payeeName only (no category change needed)
        const noPayeeWithCategory = transactions.filter((t) => t.categoryId && !t.payeeId)
        const noPayeeGroups = new Map<string, { count: number; samples: string[]; categoryId: string }>()
        for (const tx of noPayeeWithCategory) {
          const words = tx.description.trim().split(/\s+/)
          const firstMeaningful = words.find((w) => w.length >= 5) ?? words[0]
          const twoWords = words.slice(0, 2).join(' ')
          const key = twoWords.length >= 6 ? twoWords : firstMeaningful
          if (!key || key.length < 3) continue
          const e = noPayeeGroups.get(key) ?? { count: 0, samples: [], categoryId: tx.categoryId! }
          e.count++
          if (e.samples.length < 3) e.samples.push(tx.description.slice(0, 60))
          noPayeeGroups.set(key, e)
        }
        const noPayeePatterns = [...noPayeeGroups.entries()]
          .filter(([, v]) => v.count >= 2)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 15)
          .map(([name, v]) => ({ name, count: v.count, samples: v.samples }))

        // Recurring amounts — only uncategorised, only where all matching txns share a description prefix
        // This avoids amount-only rules that would match unrelated transactions
        const uncatAmounts = uncategorised.map((t) => Number(t.amount)).sort((a, b) => a - b)
        const recurringAmounts: { amount: number; count: number; sampleDescription: string; sharedPrefix: string }[] = []
        const seenAmounts = new Set<number>()
        for (const amt of uncatAmounts) {
          if (seenAmounts.has(amt)) continue
          const similar = uncatAmounts.filter((a) => Math.abs(a - amt) / (Math.abs(amt) || 1) <= 0.02)
          if (similar.length >= 3) {
            const matchingTxns = uncategorised.filter((t) => Math.abs(Number(t.amount) - amt) / (Math.abs(amt) || 1) <= 0.02)
            // Only include if matching txns share a common description prefix (makes rule more specific)
            const firstWords = matchingTxns.map((t) => t.description.trim().split(/\s+/).slice(0, 2).join(' ').toLowerCase())
            const commonPrefix = firstWords[0]
            const allSharePrefix = firstWords.every((w) => w === commonPrefix)
            if (allSharePrefix) {
              recurringAmounts.push({ amount: amt, count: similar.length, sampleDescription: matchingTxns[0]?.description ?? '', sharedPrefix: commonPrefix })
            }
            similar.forEach((a) => seenAmounts.add(a))
          }
        }

        // Existing rule summaries
        const existingRuleSummary = existingRules.map((r) => {
          const defs = (r.conditions as { all?: unknown[]; any?: unknown[] }).all ??
            (r.conditions as { any?: unknown[] }).any ?? []
          const condStr = (defs as { field: string; operator: string; value: unknown }[])
            .map((c) => `${c.field} ${c.operator} ${JSON.stringify(c.value)}`)
            .join(' AND ')
          return `${condStr} → ${r.categoryRef?.name ?? r.categoryName}`
        })

        // Category list — names only (LLM matches by name; id resolution is done server-side)
        const categoryList = categories.map((c) => ({
          name: c.name,
          groupName: c.group?.name ?? '',
        }))

        // Build payee name → id map
        const payeeMap = new Map(payees.map((p) => [p.name.toLowerCase(), p.id]))

        // Build category name → id map
        const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))

        // Step 3 – call LLM
        send({ type: 'status', message: 'Calling AI…' })

        const systemPrompt = `You are a financial categorisation assistant. Analyse transaction patterns and suggest automation rules. Always respond with valid JSON only — no markdown, no explanation outside the JSON array.`

        const userPrompt = `You are analysing a user's bank transactions to suggest categorisation rules.

EXISTING RULES (do not duplicate):
${existingRuleSummary.length > 0 ? existingRuleSummary.join('\n') : '(none)'}

AVAILABLE CATEGORIES:
${categoryList.map((c) => `- ${c.name} (${c.groupName})`).join('\n')}

TRANSACTION PATTERNS:
Uncategorised groups (top 20) — IMPORTANT: use the "matchField" column as the condition field:
${uncategorisedByPayee.map((p) => `- name:"${p.name}" | matchField:${p.matchField} | ${p.count} txns | total: ${p.totalAmount.toFixed(2)} | samples: ${p.sampleDescriptions.join('; ')}`).join('\n') || '(none)'}

Description clusters (no payee):
${descriptionClusters.map((d) => `- "${d.cluster}" | ${d.count} txns | total: ${d.totalAmount.toFixed(2)}`).join('\n') || '(none)'}

Recurring amounts (only shown where all matching transactions share a description prefix — use description condition, not amount):
${recurringAmounts.slice(0, 10).map((r) => `- ${r.amount.toFixed(2)} | ${r.count} times | description prefix: "${r.sharedPrefix}" | sample: "${r.sampleDescription}"`).join('\n') || '(none)'}

Individual uncategorised transactions (one-offs — use world knowledge to suggest a category, use "equals" or "contains" on description):
${singletons.length > 0 ? singletons.map((t) => `- description: "${t.description}" | amount: ${t.amount.toFixed(2)}`).join('\n') : '(none)'}

Transactions with no payee assigned (already have a category — suggest a payeeName only, keep categoryName matching their existing category or omit by setting categoryName to the same value):
${noPayeePatterns.length > 0 ? noPayeePatterns.map((p) => `- name:"${p.name}" | ${p.count} txns | samples: ${p.samples.join('; ')}`).join('\n') : '(none)'}

Return a JSON array of rule suggestions. Each item must have this exact shape:
{
  "conditions": { "all": [{ "field": "payeeName"|"description", "operator": "contains"|"equals"|"starts_with"|"oneOf", "value": string|string[] }] },
  "categoryName": string,
  "payeeName": string|null,
  "confidence": "high"|"medium",
  "reasoning": string
}

Rules:
- Suggest at most 20 rules total
- NEVER suggest a rule that uses only an amount condition — amount rules are too broad and will match unrelated transactions. Always use description or payeeName as the primary condition
- For each group in "Uncategorised groups", use the exact "matchField" value shown — if matchField is "description" use field:"description", if "payeeName" use field:"payeeName"
- When matchField is "payeeName", also set "payeeName" to the group name so a payee gets assigned
- When matchField is "description", look at the sample descriptions and infer a clean, human-readable payee name if you can confidently identify the real-world merchant (e.g. samples "AMAZON MKTPLACE PMTS", "AMAZON.COM*X12" → payeeName "Amazon"). If you cannot confidently identify a single merchant, set "payeeName" to null
- For "Transactions with no payee assigned": infer the real-world merchant name from the description samples and set "payeeName" to that name. Set categoryName to a matching category from the list above
- Do not suggest a rule if a similar pattern is already covered by existing rules (same merchant/description → same category)
- Each suggestion must cover a distinct set of transactions — do not suggest two rules that would match the same transactions
- Only suggest rules where you see 2+ matching transactions, EXCEPT for "Individual uncategorised transactions" where 1 transaction is acceptable if you are confident in the category based on world knowledge
- For individual transactions, set confidence to "medium" since there is only one data point
- categoryName must exactly match one of the available category names listed above
- reasoning should be 1 sentence`


        // Keep-alive ping every 5s so the CDN doesn't drop the SSE connection
        const keepAlive = setInterval(() => {
          controller.enqueue(new TextEncoder().encode(': ping\n\n'))
        }, 5000)

        let rawResponse: string
        try {
          rawResponse = await openrouterChat(
            [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            'anthropic/claude-sonnet-4-5'
          )
        } finally {
          clearInterval(keepAlive)
        }


        // Step 4 – parse and stream suggestions
        send({ type: 'status', message: 'Parsing suggestions…' })

        let suggestions: RuleSuggestionRaw[] = []
        try {
          const cleaned = rawResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
          const parsed = JSON.parse(cleaned)
          if (!Array.isArray(parsed)) {
            suggestions = []
          } else {
            // Validate each suggestion has required shape before using it
            suggestions = parsed.filter((s): s is RuleSuggestionRaw => {
              if (typeof s !== 'object' || s === null) return false
              if (typeof s.categoryName !== 'string' || !s.categoryName.trim()) return false
              if (!['high', 'medium'].includes(s.confidence)) return false
              if (typeof s.reasoning !== 'string') return false
              const defs = s.conditions?.all ?? s.conditions?.any
              if (!Array.isArray(defs) || defs.length === 0) return false
              // Reject amount-only rules
              const hasNonAmountCondition = defs.some((d: { field?: string }) => d.field !== 'amount')
              if (!hasNonAmountCondition) return false
              return true
            })
          }
        } catch {
          suggestions = []
        }

        if (suggestions.length === 0) {
          send({ type: 'status', message: 'No new rule suggestions found.' })
        }

        // Helper: get matched tx IDs for a set of condition defs
        function getMatchedIds(defs: { field: string; operator: string; value: string | number | string[] }[]): Set<string> {
          const ids = new Set<string>()
          for (const tx of transactions) {
            const matches = defs.every((def) => {
              let txVal: string
              if (def.field === 'payeeName') {
                txVal = tx.payee?.name ?? ''
              } else if (def.field === 'description') {
                txVal = tx.description
              } else if (def.field === 'amount') {
                txVal = String(Number(tx.amount))
              } else {
                txVal = ''
              }
              const v = String(def.value).toLowerCase()
              const t = txVal.toLowerCase()
              if (def.operator === 'contains') return t.includes(v)
              if (def.operator === 'equals') return t === v
              if (def.operator === 'starts_with') return t.startsWith(v)
              if (def.operator === 'gt') return Number(txVal) > Number(def.value)
              if (def.operator === 'lt') return Number(txVal) < Number(def.value)
              if (def.operator === 'oneOf') return (def.value as string[]).some((ov) => t === ov.toLowerCase())
              return false
            })
            if (matches) ids.add(tx.id)
          }
          return ids
        }

        // Pre-compute transaction IDs already covered by existing rules
        const coveredByExisting = new Set<string>()
        for (const rule of existingRules) {
          const defs = (rule.conditions as { all?: unknown[]; any?: unknown[] }).all ??
            (rule.conditions as { any?: unknown[] }).any ?? []
          const matched = getMatchedIds(defs as { field: string; operator: string; value: string | number | string[] }[])
          matched.forEach((id) => coveredByExisting.add(id))
        }

        // Track IDs claimed by suggestions within this run to avoid intra-run dupes
        const coveredThisRun = new Set<string>()

        for (const suggestion of suggestions) {
          // Resolve categoryId
          const resolvedCategoryId = categoryMap.get(suggestion.categoryName.toLowerCase()) ?? null

          // Resolve payeeId
          const resolvedPayeeId = suggestion.payeeName
            ? (payeeMap.get(suggestion.payeeName.toLowerCase()) ?? null)
            : null

          const defs = suggestion.conditions.all ?? suggestion.conditions.any ?? []
          const matchedIds = getMatchedIds(defs as { field: string; operator: string; value: string | number | string[] }[])

          // Count only transactions not already covered by existing rules or earlier suggestions
          const newIds = [...matchedIds].filter((id) => !coveredByExisting.has(id) && !coveredThisRun.has(id))
          const matchCount = newIds.length

          // Skip if this suggestion doesn't add meaningful new coverage (>50% overlap)
          const overlapWithExisting = [...matchedIds].filter((id) => coveredByExisting.has(id)).length
          const overlapWithRun = [...matchedIds].filter((id) => coveredThisRun.has(id)).length
          const totalMatched = matchedIds.size
          if (totalMatched > 0 && (overlapWithExisting + overlapWithRun) / totalMatched > 0.5) continue

          // Mark these transactions as claimed for the rest of this run
          newIds.forEach((id) => coveredThisRun.add(id))

          // Allow medium-confidence suggestions (singletons) even if matchCount is 0
          // They may not match due to exact string differences but are still useful suggestions
          if (matchCount === 0 && suggestion.confidence !== 'medium') continue

          send({
            type: 'suggestion',
            rule: {
              conditions: suggestion.conditions,
              categoryName: suggestion.categoryName,
              categoryId: resolvedCategoryId,
              payeeName: suggestion.payeeName,
              payeeId: resolvedPayeeId,
              confidence: suggestion.confidence,
              reasoning: suggestion.reasoning,
            },
            reasoning: suggestion.reasoning,
            matchCount,
          })

          // Small delay between suggestions for streaming feel
          await new Promise((r) => setTimeout(r, 80))
        }

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
