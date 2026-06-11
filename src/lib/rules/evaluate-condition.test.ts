import { describe, it, expect } from 'vitest'
import { getFieldValue, evaluateOperator, matchesConditions } from '@/lib/rules/evaluate-condition'

const baseTx = {
  description: 'Starbucks Coffee',
  payeeName: 'Starbucks',
  amount: -5.50,
  accountName: 'Checking',
  rawDescription: 'SQ *STARBUCKS 123 MAIN ST',
  currency: 'USD',
  notes: 'Morning coffee',
  tags: ['food', 'daily'],
  date: new Date('2024-01-15'),
}

describe('getFieldValue', () => {
  it('returns description', () => {
    expect(getFieldValue(baseTx, 'description')).toBe('Starbucks Coffee')
  })

  it('returns payeeName', () => {
    expect(getFieldValue(baseTx, 'payeeName')).toBe('Starbucks')
  })

  it('returns rawDescription', () => {
    expect(getFieldValue(baseTx, 'rawDescription')).toBe('SQ *STARBUCKS 123 MAIN ST')
  })

  it('returns amount as number', () => {
    expect(getFieldValue(baseTx, 'amount')).toBe(-5.50)
  })

  it('returns currency', () => {
    expect(getFieldValue(baseTx, 'currency')).toBe('USD')
  })

  it('returns accountName', () => {
    expect(getFieldValue(baseTx, 'accountName')).toBe('Checking')
  })

  it('returns notes', () => {
    expect(getFieldValue(baseTx, 'notes')).toBe('Morning coffee')
  })

  it('returns tags array', () => {
    expect(getFieldValue(baseTx, 'tag')).toEqual(['food', 'daily'])
  })

  it('returns date as YYYY-MM-DD', () => {
    expect(getFieldValue(baseTx, 'date')).toBe('2024-01-15')
  })

  it('returns month as YYYY-MM', () => {
    expect(getFieldValue(baseTx, 'month')).toBe('2024-01')
  })

  it('returns dayOfWeek as lowercase string', () => {
    expect(getFieldValue(baseTx, 'dayOfWeek')).toBe('monday')
  })

  it('returns null for unknown field', () => {
    expect(getFieldValue(baseTx, 'unknown')).toBeNull()
  })

  it('handles null payeeName', () => {
    const tx = { ...baseTx, payeeName: null }
    expect(getFieldValue(tx, 'payeeName')).toBeNull()
  })

  it('handles missing date', () => {
    const tx = { ...baseTx, date: undefined }
    expect(getFieldValue(tx, 'date')).toBeNull()
    expect(getFieldValue(tx, 'month')).toBeNull()
    expect(getFieldValue(tx, 'dayOfWeek')).toBeNull()
  })
})

describe('evaluateOperator', () => {
  describe('string operators', () => {
    it('contains - case insensitive', () => {
      expect(evaluateOperator('Starbucks Coffee', 'contains', 'starbucks')).toBe(true)
      expect(evaluateOperator('Starbucks Coffee', 'contains', 'STARBUCKS')).toBe(true)
      expect(evaluateOperator('Starbucks Coffee', 'contains', 'pizza')).toBe(false)
    })

    it('not_contains', () => {
      expect(evaluateOperator('Starbucks Coffee', 'not_contains', 'pizza')).toBe(true)
      expect(evaluateOperator('Starbucks Coffee', 'not_contains', 'starbucks')).toBe(false)
    })

    it('equals - case insensitive', () => {
      expect(evaluateOperator('Starbucks', 'equals', 'STARBUCKS')).toBe(true)
      expect(evaluateOperator('Starbucks', 'equals', 'starbucks')).toBe(true)
      expect(evaluateOperator('Starbucks', 'equals', 'coffee')).toBe(false)
    })

    it('not_equals', () => {
      expect(evaluateOperator('Starbucks', 'not_equals', 'coffee')).toBe(true)
      expect(evaluateOperator('Starbucks', 'not_equals', 'STARBUCKS')).toBe(false)
    })

    it('starts_with', () => {
      expect(evaluateOperator('Starbucks Coffee', 'starts_with', 'star')).toBe(true)
      expect(evaluateOperator('Starbucks Coffee', 'starts_with', 'coffee')).toBe(false)
    })

    it('ends_with', () => {
      expect(evaluateOperator('Starbucks Coffee', 'ends_with', 'coffee')).toBe(true)
      expect(evaluateOperator('Starbucks Coffee', 'ends_with', 'star')).toBe(false)
    })

    it('regex', () => {
      expect(evaluateOperator('Starbucks 123', 'regex', 'starbucks \\d+')).toBe(true)
      expect(evaluateOperator('Starbucks', 'regex', '\\d+')).toBe(false)
      expect(evaluateOperator('Starbucks', 'regex', '[invalid')).toBe(false) // invalid regex returns false
    })
  })

  describe('numeric operators', () => {
    it('gt', () => {
      expect(evaluateOperator(10, 'gt', 5)).toBe(true)
      expect(evaluateOperator(5, 'gt', 10)).toBe(false)
      expect(evaluateOperator('10', 'gt', '5')).toBe(true) // string numbers
    })

    it('lt', () => {
      expect(evaluateOperator(5, 'lt', 10)).toBe(true)
      expect(evaluateOperator(10, 'lt', 5)).toBe(false)
    })

    it('gte', () => {
      expect(evaluateOperator(10, 'gte', 10)).toBe(true)
      expect(evaluateOperator(10, 'gte', 5)).toBe(true)
      expect(evaluateOperator(5, 'gte', 10)).toBe(false)
    })

    it('lte', () => {
      expect(evaluateOperator(10, 'lte', 10)).toBe(true)
      expect(evaluateOperator(5, 'lte', 10)).toBe(true)
      expect(evaluateOperator(10, 'lte', 5)).toBe(false)
    })
  })

  describe('array operators (tags)', () => {
    it('contains / includes / oneOf', () => {
      expect(evaluateOperator(['food', 'daily'], 'contains', 'food')).toBe(true)
      expect(evaluateOperator(['food', 'daily'], 'includes', 'daily')).toBe(true)
      expect(evaluateOperator(['food', 'daily'], 'oneOf', ['food', 'travel'])).toBe(true)
      expect(evaluateOperator(['food', 'daily'], 'oneOf', ['travel', 'shopping'])).toBe(false)
    })

    it('equals - exact match', () => {
      expect(evaluateOperator(['food', 'daily'], 'equals', ['food', 'daily'])).toBe(true)
      expect(evaluateOperator(['food', 'daily'], 'equals', ['daily', 'food'])).toBe(true)
      expect(evaluateOperator(['food', 'daily'], 'equals', ['food'])).toBe(false)
      expect(evaluateOperator(['food', 'daily'], 'equals', ['food', 'daily', 'extra'])).toBe(false)
    })

    it('not_contains / excludes', () => {
      expect(evaluateOperator(['food', 'daily'], 'not_contains', 'travel')).toBe(true)
      expect(evaluateOperator(['food', 'daily'], 'excludes', 'food')).toBe(false)
    })

    it('case insensitive for arrays', () => {
      expect(evaluateOperator(['FOOD', 'DAILY'], 'contains', 'food')).toBe(true)
      expect(evaluateOperator(['food', 'daily'], 'oneOf', ['FOOD'])).toBe(true)
    })
  })

  describe('in / oneOf for strings', () => {
    it('in with array', () => {
      expect(evaluateOperator('starbucks', 'in', ['starbucks', 'dunkin'])).toBe(true)
      expect(evaluateOperator('pizza', 'in', ['starbucks', 'dunkin'])).toBe(false)
    })
  })

  describe('between', () => {
    it('inclusive range', () => {
      expect(evaluateOperator(5, 'between', [1, 10])).toBe(true)
      expect(evaluateOperator(1, 'between', [1, 10])).toBe(true)
      expect(evaluateOperator(10, 'between', [1, 10])).toBe(true)
      expect(evaluateOperator(0, 'between', [1, 10])).toBe(false)
      expect(evaluateOperator(11, 'between', [1, 10])).toBe(false)
    })

    it('works with string numbers', () => {
      expect(evaluateOperator('5', 'between', [1, 10])).toBe(true)
    })
  })

  describe('null handling', () => {
    it('returns false for null fieldValue', () => {
      expect(evaluateOperator(null, 'contains', 'test')).toBe(false)
      expect(evaluateOperator(null, 'equals', 'test')).toBe(false)
      expect(evaluateOperator(null, 'gt', 5)).toBe(false)
      expect(evaluateOperator(null, 'between', [1, 10])).toBe(false)
    })

    it('returns false for undefined fieldValue', () => {
      expect(evaluateOperator(undefined, 'contains', 'test')).toBe(false)
    })
  })
})

describe('matchesConditions', () => {
  it('all - all conditions must match', () => {
    const conditions = {
      all: [
        { field: 'description', operator: 'contains', value: 'starbucks' },
        { field: 'amount', operator: 'lt', value: 0 },
      ],
    }
    expect(matchesConditions(conditions, baseTx)).toBe(true)
  })

  it('all - fails if any condition fails', () => {
    const conditions = {
      all: [
        { field: 'description', operator: 'contains', value: 'starbucks' },
        { field: 'amount', operator: 'gt', value: 0 }, // amount is negative
      ],
    }
    expect(matchesConditions(conditions, baseTx)).toBe(false)
  })

  it('any - at least one condition must match', () => {
    const conditions = {
      any: [
        { field: 'description', operator: 'contains', value: 'pizza' },
        { field: 'description', operator: 'contains', value: 'starbucks' },
      ],
    }
    expect(matchesConditions(conditions, baseTx)).toBe(true)
  })

  it('any - fails if none match', () => {
    const conditions = {
      any: [
        { field: 'description', operator: 'contains', value: 'pizza' },
        { field: 'description', operator: 'contains', value: 'burger' },
      ],
    }
    expect(matchesConditions(conditions, baseTx)).toBe(false)
  })

  it('empty conditions returns false', () => {
    expect(matchesConditions({}, baseTx)).toBe(false)
    // Note: [].every() returns true (vacuous truth), [].some() returns false
    expect(matchesConditions({ all: [] }, baseTx)).toBe(true)
    expect(matchesConditions({ any: [] }, baseTx)).toBe(false)
  })

  it('handles null field values in conditions', () => {
    const tx = { ...baseTx, payeeName: null }
    const conditions = {
      all: [{ field: 'payeeName', operator: 'equals', value: 'Starbucks' }],
    }
    expect(matchesConditions(conditions, tx)).toBe(false)
  })

  it('tags array matching with all', () => {
    const conditions = {
      all: [
        { field: 'tag', operator: 'contains', value: 'food' },
        { field: 'tag', operator: 'contains', value: 'daily' },
      ],
    }
    expect(matchesConditions(conditions, baseTx)).toBe(true)
  })
})