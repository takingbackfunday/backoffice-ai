import { describe, it, expect } from 'vitest'
import {
  STARTER_TRADES,
  StarterTemplateSchema,
} from './starter-templates'

describe('STARTER_TRADES', () => {
  it('has exactly 10 trades', () => {
    expect(STARTER_TRADES).toHaveLength(10)
  })

  it('has unique trade ids', () => {
    const ids = STARTER_TRADES.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has unique trade labels', () => {
    const labels = STARTER_TRADES.map(t => t.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('every trade has 1–3 templates', () => {
    for (const trade of STARTER_TRADES) {
      expect(trade.templates.length).toBeGreaterThanOrEqual(1)
      expect(trade.templates.length).toBeLessThanOrEqual(3)
    }
  })

  it('every template passes StarterTemplateSchema', () => {
    for (const trade of STARTER_TRADES) {
      for (const template of trade.templates) {
        expect(StarterTemplateSchema.safeParse(template).success).toBe(true)
      }
    }
  })

  it('every template has at least 1 section', () => {
    for (const trade of STARTER_TRADES) {
      for (const template of trade.templates) {
        expect(template.sections.length).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('every section has at least 1 item', () => {
    for (const trade of STARTER_TRADES) {
      for (const template of trade.templates) {
        for (const section of template.sections) {
          expect(section.items.length).toBeGreaterThanOrEqual(1)
        }
      }
    }
  })

  it('all item rates are positive when present', () => {
    for (const trade of STARTER_TRADES) {
      for (const template of trade.templates) {
        for (const section of template.sections) {
          for (const item of section.items) {
            if (item.rate != null) {
              expect(item.rate).toBeGreaterThan(0)
            }
          }
        }
      }
    }
  })

  it('template names are unique within a trade', () => {
    for (const trade of STARTER_TRADES) {
      const names = trade.templates.map(t => t.name)
      expect(new Set(names).size).toBe(names.length)
    }
  })
})
