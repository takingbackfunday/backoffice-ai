import Decimal from 'decimal.js'

export type Money = Decimal

export const money = (v: Decimal.Value | null | undefined): Money =>
  new Decimal(v ?? 0)

export const sum = (items: Decimal.Value[]): Money =>
  items.reduce<Decimal>((s, v) => s.plus(v ?? 0), new Decimal(0))

export const lineTotal = (qty: Decimal.Value, unitPrice: Decimal.Value): Money =>
  money(qty).times(unitPrice).toDecimalPlaces(2)

export const gte = (a: Decimal.Value, b: Decimal.Value): boolean =>
  money(a).gte(b)

export const lte = (a: Decimal.Value, b: Decimal.Value): boolean =>
  money(a).lte(b)

export const gt = (a: Decimal.Value, b: Decimal.Value): boolean =>
  money(a).gt(b)

export const lt = (a: Decimal.Value, b: Decimal.Value): boolean =>
  money(a).lt(b)

export const eq = (a: Decimal.Value, b: Decimal.Value): boolean =>
  money(a).eq(b)

export const abs = (a: Decimal.Value): Money =>
  money(a).abs()

export const toCents = (m: Money): number =>
  m.times(100).round().toNumber()

/** Only at the serialization boundary. */
export const toDisplay = (m: Decimal.Value): number =>
  money(m).toDecimalPlaces(2).toNumber()

/** Subtract a from b: b - a */
export const sub = (a: Decimal.Value, b: Decimal.Value): Money =>
  money(b).minus(a)

/** Add a and b */
export const add = (a: Decimal.Value, b: Decimal.Value): Money =>
  money(a).plus(b)

/** Multiply a and b */
export const mul = (a: Decimal.Value, b: Decimal.Value): Money =>
  money(a).times(b).toDecimalPlaces(2)

/** Divide a by b */
export const div = (a: Decimal.Value, b: Decimal.Value): Money =>
  money(a).div(b).toDecimalPlaces(2)

export const MATCH_TOLERANCE = money('0.01')

export const isClose = (a: Decimal.Value, b: Decimal.Value): boolean =>
  abs(money(a).minus(b)).lte(MATCH_TOLERANCE)

export const isExactOrClose = (a: Decimal.Value, b: Decimal.Value): boolean =>
  abs(money(a).minus(b)).lte(MATCH_TOLERANCE)

/** Format as fixed-2 string for display or messages */
export const fmtMoney = (m: Decimal.Value): string =>
  money(m).toDecimalPlaces(2).toFixed(2)

interface InvoiceWithLineItemsAndPayments {
  lineItems: { quantity: Decimal.Value | null | undefined; unitPrice: Decimal.Value; forgivenAt?: Date | null }[]
  payments: { amount: Decimal.Value; voidedAt?: Date | null }[]
}

export function computeInvoiceTotals(
  invoice: InvoiceWithLineItemsAndPayments,
): { total: Money; paid: Money; balance: Money } {
  const total = invoice.lineItems
    .filter(li => !li.forgivenAt)
    .reduce((s, li) => s.plus(money(li.quantity).times(li.unitPrice)), money(0))
    .toDecimalPlaces(2)

  const paid = invoice.payments
    .filter(p => !p.voidedAt)
    .reduce((s, p) => s.plus(p.amount), money(0))
    .toDecimalPlaces(2)

  const balance = total.minus(paid).toDecimalPlaces(2)

  return { total, paid, balance }
}
