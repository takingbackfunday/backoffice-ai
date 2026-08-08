import { describe, it, expect } from 'vitest'
import {
  StarterTemplateSchema,
} from './quote-template-schemas'

describe('StarterTemplateSchema', () => {
  it('validates a minimal template', () => {
    const result = StarterTemplateSchema.safeParse({
      name: 'Test',
      sections: [{ name: 'Section', items: [{ description: 'Item', quantity: 1, rate: 100 }] }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects a template with no sections', () => {
    const result = StarterTemplateSchema.safeParse({ name: 'Test', sections: [] })
    expect(result.success).toBe(false)
  })

  it('rejects a template with no name', () => {
    const result = StarterTemplateSchema.safeParse({
      name: '',
      sections: [{ name: 'Section', items: [{ description: 'Item', quantity: 1, rate: 100 }] }],
    })
    expect(result.success).toBe(false)
  })
})
