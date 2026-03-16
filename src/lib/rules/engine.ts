export interface Rule<TFact, TResult> {
  id: string
  name: string
  priority: number // lower = evaluated first
  condition: (fact: TFact) => boolean
  action: (fact: TFact) => TResult
}

export type EvalStrategy = 'first' | 'all'

export function evaluateRules<TFact, TResult>(
  fact: TFact,
  rules: Rule<TFact, TResult>[],
  strategy: EvalStrategy = 'first'
): TResult[] {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority)
  const results: TResult[] = []

  for (const rule of sorted) {
    if (rule.condition(fact)) {
      results.push(rule.action(fact))
      if (strategy === 'first') break
    }
  }

  return results
}
