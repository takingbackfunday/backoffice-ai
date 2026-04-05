import { create } from 'zustand'

export interface PaymentScheduleItem {
  milestone: string
  percent: number
}

export interface QuoteGeneratorState {
  estimateId: string | null
  // margin overrides: sectionId (collapsed) or itemId (expanded) → margin percent
  margins: Record<string, number>
  // grouping: sectionId → 'collapsed' | 'expanded'
  grouping: Record<string, 'collapsed' | 'expanded'>
  // optional item inclusion: itemId → included in quote
  optionalIncluded: Record<string, boolean>
  // scope text edits: sectionId or itemId → edited scope text
  scopeEdits: Record<string, string>
  // terms override (null = use default)
  termsOverride: string | null
  // payment schedule override
  paymentSchedule: PaymentScheduleItem[]
  // validity days override
  validityDays: number | null
}

interface QuoteGeneratorActions {
  init: (estimateId: string, overrides?: Partial<QuoteGeneratorState>) => void
  setMargin: (id: string, margin: number) => void
  setGrouping: (sectionId: string, mode: 'collapsed' | 'expanded') => void
  setOptionalIncluded: (itemId: string, included: boolean) => void
  setScopeEdit: (id: string, text: string) => void
  setTermsOverride: (terms: string | null) => void
  setPaymentSchedule: (schedule: PaymentScheduleItem[]) => void
  setValidityDays: (days: number | null) => void
  reset: () => void
  toOverrides: () => Omit<QuoteGeneratorState, 'estimateId'>
}

const defaultState: QuoteGeneratorState = {
  estimateId: null,
  margins: {},
  grouping: {},
  optionalIncluded: {},
  scopeEdits: {},
  termsOverride: null,
  paymentSchedule: [],
  validityDays: null,
}

export const useQuoteGeneratorStore = create<QuoteGeneratorState & QuoteGeneratorActions>((set, get) => ({
  ...defaultState,

  init: (estimateId, overrides) => {
    set({ ...defaultState, estimateId, ...overrides })
  },

  setMargin: (id, margin) => {
    set(state => ({ margins: { ...state.margins, [id]: margin } }))
  },

  setGrouping: (sectionId, mode) => {
    set(state => ({ grouping: { ...state.grouping, [sectionId]: mode } }))
  },

  setOptionalIncluded: (itemId, included) => {
    set(state => ({ optionalIncluded: { ...state.optionalIncluded, [itemId]: included } }))
  },

  setScopeEdit: (id, text) => {
    set(state => ({ scopeEdits: { ...state.scopeEdits, [id]: text } }))
  },

  setTermsOverride: (terms) => {
    set({ termsOverride: terms })
  },

  setPaymentSchedule: (schedule) => {
    set({ paymentSchedule: schedule })
  },

  setValidityDays: (days) => {
    set({ validityDays: days })
  },

  reset: () => {
    set(defaultState)
  },

  toOverrides: () => {
    const { estimateId: _e, ...rest } = get()
    // Remove action functions from the output
    const { init: _i, setMargin: _sm, setGrouping: _sg, setOptionalIncluded: _soi,
      setScopeEdit: _sse, setTermsOverride: _sto, setPaymentSchedule: _sps,
      setValidityDays: _svd, reset: _r, toOverrides: _to, ...data } = rest as QuoteGeneratorState & QuoteGeneratorActions
    return data
  },
}))
