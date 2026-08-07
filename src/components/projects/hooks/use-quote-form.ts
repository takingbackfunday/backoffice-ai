'use client'

import { useReducer, useCallback, useRef, useEffect, useMemo } from 'react'
import { usePageContext } from '@/components/chat/page-context-provider'
import type { EditorAction } from '@/lib/agent/page-context'
import { autoPrice, quoteTotals } from '@/lib/quote-pricing'
import { usePendingAiChanges } from '@/hooks/use-pending-ai-changes'

export type ItemInput = {
  id: string
  description: string
  quantity: string
  unit: string
  unitPrice: string
  costRate: string
  tags: string
  internalNotes: string
  riskLevel: string
  priceManual: boolean
  isOptional: boolean
}

export type SectionInput = {
  id: string
  name: string
  items: ItemInput[]
}

export type QuoteFormState = {
  title: string
  currency: string
  notes: string
  terms: string
  validUntil: string
  sections: SectionInput[]
}

export type QuoteFormSnapshot = QuoteFormState

export type QuoteFormAction =
  | { type: 'SET_TITLE'; value: string }
  | { type: 'SET_CURRENCY'; value: string }
  | { type: 'SET_NOTES'; value: string }
  | { type: 'SET_TERMS'; value: string }
  | { type: 'SET_VALID_UNTIL'; value: string }
  | { type: 'ADD_SECTION' }
  | { type: 'REMOVE_SECTION'; sectionId: string }
  | { type: 'RENAME_SECTION'; sectionId: string; name: string }
  | { type: 'ADD_ITEM'; sectionId: string; payload?: Partial<ItemInput> }
  | { type: 'REMOVE_ITEM'; sectionId: string; itemId: string }
  | { type: 'UPDATE_ITEM'; sectionId: string; itemId: string; field: keyof ItemInput; value: string | boolean }
  | { type: 'SET_SECTIONS'; sections: SectionInput[] }

function newItem(payload?: Partial<ItemInput>): ItemInput {
  const { id: _ignored, ...rest } = payload ?? {}
  return {
    id: payload?.id ?? crypto.randomUUID(),
    description: '',
    quantity: '1',
    unit: 'x',
    unitPrice: '',
    costRate: '',
    tags: '',
    internalNotes: '',
    riskLevel: 'low',
    priceManual: false,
    isOptional: false,
    ...rest,
  }
}

function newSection(): SectionInput {
  return { id: crypto.randomUUID(), name: 'New Section', items: [newItem()] }
}

function formReducer(state: QuoteFormState, action: QuoteFormAction): QuoteFormState {
  switch (action.type) {
    case 'SET_TITLE':
      return { ...state, title: action.value }
    case 'SET_CURRENCY':
      return { ...state, currency: action.value }
    case 'SET_NOTES':
      return { ...state, notes: action.value }
    case 'SET_TERMS':
      return { ...state, terms: action.value }
    case 'SET_VALID_UNTIL':
      return { ...state, validUntil: action.value }
    case 'ADD_SECTION':
      return { ...state, sections: [...state.sections, newSection()] }
    case 'REMOVE_SECTION':
      return { ...state, sections: state.sections.filter(s => s.id !== action.sectionId) }
    case 'RENAME_SECTION':
      return {
        ...state,
        sections: state.sections.map(s =>
          s.id === action.sectionId ? { ...s, name: action.name } : s
        ),
      }
    case 'ADD_ITEM':
      return {
        ...state,
        sections: state.sections.map(s =>
          s.id === action.sectionId
            ? { ...s, items: [...s.items, newItem(action.payload)] }
            : s
        ),
      }
    case 'REMOVE_ITEM':
      return {
        ...state,
        sections: state.sections.map(s =>
          s.id === action.sectionId
            ? { ...s, items: s.items.filter(i => i.id !== action.itemId) }
            : s
        ),
      }
    case 'UPDATE_ITEM':
      return {
        ...state,
        sections: state.sections.map(s =>
          s.id === action.sectionId
            ? {
                ...s,
                items: s.items.map(i =>
                  i.id === action.itemId ? { ...i, [action.field]: action.value } : i
                ),
              }
            : s
        ),
      }
    case 'SET_SECTIONS':
      return { ...state, sections: action.sections }
    default:
      return state
  }
}

export function useQuoteForm(
  initial: QuoteFormState,
  marginRules: { tag: string; marginPct: number }[],
  entityId?: string,
  entityName?: string,
) {
  const marginByTag = useMemo(
    () => new Map(marginRules.map(r => [r.tag, r.marginPct])),
    [marginRules],
  )

  const [state, dispatch] = useReducer(formReducer, initial)
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  const { pendingFields, hasPendingChanges, markPending, confirm, undo } =
    usePendingAiChanges<QuoteFormSnapshot>()

  const trackedDispatch = useCallback(
    (action: QuoteFormAction) => {
      if (action.type === 'UPDATE_ITEM') {
        const section = stateRef.current.sections.find(s => s.id === action.sectionId)
        const item = section?.items.find(i => i.id === action.itemId)
        if (item) {
          if ((action.field === 'costRate' || action.field === 'tags') && !item.priceManual) {
            dispatch(action)
            const costRate =
              action.field === 'costRate'
                ? parseFloat(action.value as string) || 0
                : parseFloat(item.costRate) || 0
            const tags =
              action.field === 'tags'
                ? (action.value as string).split(',').map(t => t.trim()).filter(Boolean)
                : item.tags.split(',').map(t => t.trim()).filter(Boolean)
            const price = autoPrice(costRate, tags, marginByTag)
            dispatch({
              type: 'UPDATE_ITEM',
              sectionId: action.sectionId,
              itemId: action.itemId,
              field: 'unitPrice',
              value: String(price),
            })
            return
          }
          if (action.field === 'unitPrice') {
            dispatch(action)
            dispatch({
              type: 'UPDATE_ITEM',
              sectionId: action.sectionId,
              itemId: action.itemId,
              field: 'priceManual',
              value: true,
            })
            return
          }
        }
      }
      dispatch(action)
    },
    [dispatch, marginByTag],
  )

  const applyEditorAction = useCallback(
    (action: EditorAction) => {
      switch (action.type) {
        case 'set_title':
          markPending('title', stateRef.current)
          trackedDispatch({ type: 'SET_TITLE', value: action.value })
          break
        case 'set_currency':
          markPending('currency', stateRef.current)
          trackedDispatch({ type: 'SET_CURRENCY', value: action.value })
          break
        case 'set_notes':
          markPending('notes', stateRef.current)
          trackedDispatch({ type: 'SET_NOTES', value: action.value })
          break
        case 'set_quote_terms':
          markPending('terms', stateRef.current)
          trackedDispatch({ type: 'SET_TERMS', value: action.value })
          break
        case 'set_valid_until':
          markPending('validUntil', stateRef.current)
          trackedDispatch({ type: 'SET_VALID_UNTIL', value: action.value })
          break
        case 'set_item_prices': {
          markPending('sections', stateRef.current)
          const newSections = stateRef.current.sections.map(s => ({
            ...s,
            items: s.items.map(i => {
              const match = action.items.find(
                p => p.description.toLowerCase() === i.description.toLowerCase(),
              )
              if (!match) return i
              return { ...i, unitPrice: String(match.unitPrice), priceManual: false }
            }),
          }))
          trackedDispatch({ type: 'SET_SECTIONS', sections: newSections })
          break
        }
      }
    },
    [trackedDispatch, markPending],
  )

  usePageContext({
    entityType: 'quote',
    entityId,
    entityName,
    snapshot: state,
    dispatch: applyEditorAction,
  })

  function buildPayload() {
    return {
      title: state.title,
      currency: state.currency,
      notes: state.notes || null,
      terms: state.terms || null,
      validUntil: state.validUntil || null,
      sections: state.sections.map((s, si) => ({
        name: s.name,
        sortOrder: si,
        items: s.items.map((i, ii) => ({
          description: i.description,
          quantity: parseFloat(i.quantity) || 1,
          unit: i.unit || null,
          unitPrice: parseFloat(i.unitPrice) || 0,
          costRate: parseFloat(i.costRate) || null,
          tags: i.tags.split(',').map(t => t.trim()).filter(Boolean),
          internalNotes: i.internalNotes || null,
          riskLevel: i.riskLevel || null,
          priceManual: i.priceManual,
          isOptional: i.isOptional,
          sortOrder: ii,
        })),
      })),
    }
  }

  const allItems = state.sections.flatMap(s =>
    s.items.map(i => ({
      quantity: parseFloat(i.quantity) || 1,
      unitPrice: parseFloat(i.unitPrice) || 0,
      costRate: parseFloat(i.costRate) || null,
      isOptional: i.isOptional,
    })),
  )
  const totals = quoteTotals(allItems)
  const blendedMargin =
    totals.totalCost > 0
      ? ((totals.totalQuoted - totals.totalCost) / totals.totalCost) * 100
      : 0

  return {
    state,
    dispatch: trackedDispatch,
    pendingFields,
    hasPendingChanges,
    confirm,
    undo,
    totals,
    blendedMargin,
    buildPayload,
  }
}
