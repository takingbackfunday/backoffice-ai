'use client'

import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'

export function PaymentSummary({ pm }: { pm: PaymentMethods }) {
  const bt = pm.bankTransfer
  const hasBt = bt && Object.values(bt).some(v => v)
  const hasPaypal = !!pm.paypal?.link
  const hasStripe = !!pm.stripe?.link
  const hasCustom = (pm.custom?.length ?? 0) > 0

  if (!hasBt && !hasPaypal && !hasStripe && !hasCustom) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        No payment methods configured.{' '}
        <a href="/settings" className="underline font-medium" target="_blank" rel="noreferrer">Add them in Settings →</a>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-3 space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Payment methods in email</p>
      {hasBt && bt && (
        <div className="text-xs space-y-0.5">
          <p className="font-medium">Bank transfer{bt.bankName ? ` — ${bt.bankName}` : ''}</p>
          {bt.accountName && <p className="text-muted-foreground">Account: {bt.accountName}</p>}
          {bt.iban && <p className="text-muted-foreground font-mono">{bt.iban}</p>}
          {bt.sortCode && <p className="text-muted-foreground">Sort code: {bt.sortCode} · Account: {bt.accountNumber}</p>}
          {bt.routingNumber && <p className="text-muted-foreground">Routing: {bt.routingNumber} · Account: {bt.accountNumber}</p>}
        </div>
      )}
      {hasPaypal && (
        <div className="text-xs">
          <p className="font-medium">PayPal</p>
          <p className="text-muted-foreground">{pm.paypal!.link}</p>
        </div>
      )}
      {hasStripe && (
        <div className="text-xs">
          <p className="font-medium">Stripe</p>
          <p className="text-muted-foreground">{pm.stripe!.link}</p>
        </div>
      )}
      {hasCustom && pm.custom?.map((m, i) => (
        <div key={i} className="text-xs">
          <p className="font-medium">{m.label}</p>
          <p className="text-muted-foreground">{m.value}</p>
        </div>
      ))}
    </div>
  )
}
