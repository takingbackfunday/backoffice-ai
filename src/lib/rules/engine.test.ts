import { describe, it, expect } from 'vitest'
import { evaluateRules, type Rule, type EvalStrategy } from '@/lib/rules/engine'

interface TestFact {
  value: number
  category: string
}

interface TestResult {
  action: string
  value: number
}

describe('evaluateRules', () => {
  const rules: Rule<TestFact, TestResult>[] = [
    {
      id: 'rule-1',
      name: 'High Value',
      priority: 10,
      condition: (fact) => fact.value > 100,
      action: (fact) => ({ action: 'flag-review', value: fact.value }),
    },
    {
      id: 'rule-2',
      name: 'Medium Value',
      priority: 20,
      condition: (fact) => fact.value > 50,
      action: (fact) => ({ action: 'log', value: fact.value }),
    },
    {
      id: 'rule-3',
      name: 'Low Value',
      priority: 30,
      condition: (fact) => fact.value > 0,
      action: (fact) => ({ action: 'ignore', value: fact.value }),
    },
    {
      id: 'rule-4',
      name: 'Category A',
      priority: 5,
      condition: (fact) => fact.category === 'A',
      action: (fact) => ({ action: 'category-a', value: fact.value }),
    },
  ]

  describe('strategy: first (default)', () => {
    it('returns only the first matching rule by priority', () => {
      const fact: TestFact = { value: 75, category: 'B' }
      const results = evaluateRules(fact, rules, 'first')
      expect(results).toHaveLength(1)
      expect(results[0].action).toBe('log')
    })

    it('returns first match even if lower priority rules also match', () => {
      const fact: TestFact = { value: 150, category: 'A' }
      const results = evaluateRules(fact, rules, 'first')
      expect(results).toHaveLength(1)
      expect(results[0].action).toBe('category-a') // priority 5 wins
    })

    it('returns empty array when no rules match', () => {
      const fact: TestFact = { value: -10, category: 'Z' }
      const results = evaluateRules(fact, rules, 'first')
      expect(results).toHaveLength(0)
    })

    it('sorts by priority before evaluating', () => {
      const unsortedRules = [...rules].reverse()
      const fact: TestFact = { value: 75, category: 'B' }
      const results = evaluateRules(fact, unsortedRules, 'first')
      expect(results[0].action).toBe('log') // priority 20, not 30
    })

    it('does not mutate original rules array', () => {
      const originalRules = [...rules]
      evaluateRules({ value: 75, category: 'B' }, rules, 'first')
      expect(rules).toEqual(originalRules)
    })
  })

  describe('strategy: all', () => {
    it('returns all matching rules in priority order', () => {
      const fact: TestFact = { value: 150, category: 'B' }
      const results = evaluateRules(fact, rules, 'all')
      expect(results).toHaveLength(3)
      expect(results.map(r => r.action)).toEqual(['flag-review', 'log', 'ignore'])
    })

    it('returns empty array when no rules match', () => {
      const fact: TestFact = { value: -10, category: 'Z' }
      const results = evaluateRules(fact, rules, 'all')
      expect(results).toHaveLength(0)
    })

    it('only returns each matching rule once', () => {
      const duplicateRules: Rule<TestFact, TestResult>[] = [
        { id: 'r1', name: 'R1', priority: 10, condition: () => true, action: () => ({ action: 'a', value: 1 }) },
        { id: 'r2', name: 'R2', priority: 20, condition: () => true, action: () => ({ action: 'b', value: 2 }) },
      ]
      const results = evaluateRules({ value: 1, category: 'X' }, duplicateRules, 'all')
      expect(results).toHaveLength(2)
    })
  })

  describe('priority ordering', () => {
    it('lower priority number = evaluated first', () => {
      const priorityRules: Rule<TestFact, TestResult>[] = [
        { id: 'high', name: 'High', priority: 100, condition: () => true, action: () => ({ action: 'high', value: 1 }) },
        { id: 'low', name: 'Low', priority: 1, condition: () => true, action: () => ({ action: 'low', value: 1 }) },
      ]
      const results = evaluateRules({ value: 1, category: 'X' }, priorityRules, 'first')
      expect(results[0].action).toBe('low')
    })

    it('maintains stable order for same priority', () => {
      const samePriorityRules: Rule<TestFact, TestResult>[] = [
        { id: 'a', name: 'A', priority: 10, condition: () => true, action: () => ({ action: 'a', value: 1 }) },
        { id: 'b', name: 'B', priority: 10, condition: () => true, action: () => ({ action: 'b', value: 1 }) },
      ]
      const results = evaluateRules({ value: 1, category: 'X' }, samePriorityRules, 'all')
      expect(results.map(r => r.action)).toEqual(['a', 'b'])
    })
  })

  describe('edge cases', () => {
    it('handles empty rules array', () => {
      const results = evaluateRules({ value: 1, category: 'X' }, [], 'first')
      expect(results).toHaveLength(0)
    })

    it('works with complex fact objects', () => {
      interface ComplexFact {
        nested: { value: number }
        tags: string[]
      }
      const complexRules: Rule<ComplexFact, string>[] = [
        { id: 'r1', name: 'R1', priority: 1, condition: (f) => f.nested.value > 5, action: () => 'gt5' },
        { id: 'r2', name: 'R2', priority: 2, condition: (f) => f.tags.includes('special'), action: () => 'special' },
      ]
      const results = evaluateRules(
        { nested: { value: 10 }, tags: ['normal'] },
        complexRules,
        'all'
      )
      expect(results).toEqual(['gt5'])
    })

    it('condition errors propagate', () => {
      const badRules: Rule<TestFact, TestResult>[] = [
        { id: 'bad', name: 'Bad', priority: 1, condition: () => { throw new Error('oops') }, action: () => ({ action: 'x', value: 1 }) },
      ]
      expect(() => evaluateRules({ value: 1, category: 'X' }, badRules, 'first')).toThrow('oops')
    })
  })
})