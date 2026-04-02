import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface PdfLineItem {
  description: string
  quantity: number
  unitPrice: number
  isTaxLine?: boolean
}

export interface PdfPayment {
  amount: number
  paidDate: string
  paymentMethod?: string | null
}

export interface PdfInvoice {
  invoiceNumber: string
  status: string
  issueDate: string
  dueDate: string
  currency: string
  notes?: string | null
  jobName?: string | null
  clientName: string
  clientCompany?: string | null
  clientEmail?: string | null
  clientAddress?: string | null
  clientPhone?: string | null
  fromName: string
  lineItems: PdfLineItem[]
  totalPaid?: number
  payments?: PdfPayment[]
}

export interface PaymentMethods {
  bankTransfer?: {
    accountName?: string
    bankName?: string
    iban?: string
    swift?: string
    sortCode?: string
    accountNumber?: string
    routingNumber?: string
  }
  paypal?: { link: string }
  stripe?: { link: string }
  custom?: { label: string; value: string }[]
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/* ------------------------------------------------------------------ */
/*  Styles                                                              */
/* ------------------------------------------------------------------ */

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: '#111', padding: 48, backgroundColor: '#fff' },
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 36 },
  fromName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#111' },
  headerRight: { alignItems: 'flex-end' },
  invoiceLabel: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#111', marginBottom: 4 },
  invoiceNum: { fontSize: 11, color: '#555' },
  // Meta row
  metaRow: { flexDirection: 'row', gap: 24, marginBottom: 28 },
  metaBlock: { flex: 1 },
  metaLabel: { fontSize: 7, color: '#888', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  metaValue: { fontSize: 9, color: '#111' },
  // Divider
  divider: { borderBottomWidth: 1, borderBottomColor: '#e5e5e5', marginBottom: 16 },
  // Table
  tableHeader: { flexDirection: 'row', backgroundColor: '#f5f5f5', borderRadius: 2, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 2 },
  tableRow: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  tableRowTax: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fafafa' },
  colDesc: { flex: 1 },
  colQty: { width: 48, textAlign: 'right' },
  colRate: { width: 72, textAlign: 'right' },
  colTotal: { width: 72, textAlign: 'right' },
  thText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#555', textTransform: 'uppercase', letterSpacing: 0.4 },
  tdText: { fontSize: 9, color: '#111' },
  tdMuted: { fontSize: 9, color: '#777' },
  tdItalic: { fontSize: 9, color: '#777', fontFamily: 'Helvetica-Oblique' },
  // Totals
  totalsSection: { alignItems: 'flex-end', marginTop: 12, marginBottom: 20 },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 0, marginBottom: 4 },
  totalLabel: { width: 120, textAlign: 'right', fontSize: 9, color: '#555', paddingRight: 12 },
  totalValue: { width: 80, textAlign: 'right', fontSize: 9, color: '#111', fontFamily: 'Helvetica-Bold' },
  grandTotalLabel: { width: 120, textAlign: 'right', fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#111', paddingRight: 12 },
  grandTotalValue: { width: 80, textAlign: 'right', fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#111' },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1.5, borderTopColor: '#111', paddingTop: 6, marginTop: 2 },
  // Notes
  notesSection: { backgroundColor: '#f9f9f9', borderRadius: 4, padding: 12, marginBottom: 20 },
  notesLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  notesText: { fontSize: 9, color: '#333', lineHeight: 1.5 },
  // Payment methods
  paySection: { marginTop: 4 },
  payTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  payBlock: { marginBottom: 10 },
  payBlockTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#111', marginBottom: 3 },
  payRow: { flexDirection: 'row', marginBottom: 2 },
  payKey: { width: 100, fontSize: 8, color: '#888' },
  payVal: { fontSize: 8, color: '#111' },
  // Payments
  paymentRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 3 },
  paymentLabel: { width: 120, textAlign: 'right', fontSize: 8, color: '#16a34a', paddingRight: 12 },
  paymentValue: { width: 80, textAlign: 'right', fontSize: 8, color: '#16a34a', fontFamily: 'Helvetica-Bold' },
  balanceRow: { flexDirection: 'row', justifyContent: 'flex-end', borderTopWidth: 1, borderTopColor: '#e5e5e5', paddingTop: 6, marginTop: 4 },
  balanceLabel: { width: 120, textAlign: 'right', fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111', paddingRight: 12 },
  balanceValue: { width: 80, textAlign: 'right', fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111' },
  // Footer
  footer: { position: 'absolute', bottom: 32, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: '#aaa' },
})

/* ------------------------------------------------------------------ */
/*  PDF Component                                                       */
/* ------------------------------------------------------------------ */

function InvoicePDF({ invoice, paymentMethods, invoicePaymentNote }: { invoice: PdfInvoice; paymentMethods?: PaymentMethods; invoicePaymentNote?: string }) {
  const regularItems = invoice.lineItems.filter(i => !i.isTaxLine)
  const taxItems = invoice.lineItems.filter(i => i.isTaxLine)
  const subtotal = regularItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const taxTotal = taxItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const total = subtotal + taxTotal
  const payments = invoice.payments ?? []
  const totalPaid = invoice.totalPaid ?? payments.reduce((s, p) => s + p.amount, 0)
  const balance = total - totalPaid

  const pm = paymentMethods
  const hasBankTransfer = pm?.bankTransfer && Object.values(pm.bankTransfer).some(v => v)
  const hasPaypal = !!pm?.paypal?.link
  const hasStripe = !!pm?.stripe?.link
  const hasCustom = (pm?.custom?.length ?? 0) > 0
  const hasPayment = hasBankTransfer || hasPaypal || hasStripe || hasCustom
  const payNote = invoicePaymentNote ?? 'Please include your invoice number and full name in your payment reference.'

  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* Header */}
        <View style={S.header}>
          <View>
            <Text style={S.fromName}>{invoice.fromName}</Text>
          </View>
          <View style={S.headerRight}>
            <Text style={S.invoiceLabel}>INVOICE</Text>
            <Text style={S.invoiceNum}>{invoice.invoiceNumber}</Text>
          </View>
        </View>

        {/* Meta: bill to / dates */}
        <View style={S.metaRow}>
          <View style={S.metaBlock}>
            <Text style={S.metaLabel}>Bill to</Text>
            <Text style={S.metaValue}>{invoice.clientName}</Text>
            {invoice.clientCompany && <Text style={S.metaValue}>{invoice.clientCompany}</Text>}
            {invoice.clientAddress && <Text style={[S.metaValue, { color: '#555' }]}>{invoice.clientAddress}</Text>}
            {invoice.clientPhone && <Text style={[S.metaValue, { color: '#555' }]}>{invoice.clientPhone}</Text>}
            {invoice.clientEmail && <Text style={[S.metaValue, { color: '#555' }]}>{invoice.clientEmail}</Text>}
          </View>
          <View style={S.metaBlock}>
            <Text style={S.metaLabel}>Issue date</Text>
            <Text style={S.metaValue}>{fmtDate(invoice.issueDate)}</Text>
          </View>
          <View style={S.metaBlock}>
            <Text style={S.metaLabel}>Due date</Text>
            <Text style={[S.metaValue, { fontFamily: 'Helvetica-Bold' }]}>{fmtDate(invoice.dueDate)}</Text>
          </View>
          {invoice.jobName && (
            <View style={S.metaBlock}>
              <Text style={S.metaLabel}>Job</Text>
              <Text style={S.metaValue}>{invoice.jobName}</Text>
            </View>
          )}
        </View>

        <View style={S.divider} />

        {/* Line items table */}
        <View style={S.tableHeader}>
          <Text style={[S.thText, S.colDesc]}>Description</Text>
          <Text style={[S.thText, S.colQty]}>Qty</Text>
          <Text style={[S.thText, S.colRate]}>Rate</Text>
          <Text style={[S.thText, S.colTotal]}>Total</Text>
        </View>

        {regularItems.map((item, i) => (
          <View key={i} style={S.tableRow}>
            <Text style={[S.tdText, S.colDesc]}>{item.description}</Text>
            <Text style={[S.tdMuted, S.colQty]}>{item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(2)}</Text>
            <Text style={[S.tdMuted, S.colRate]}>{fmt(item.unitPrice, invoice.currency)}</Text>
            <Text style={[S.tdText, S.colTotal]}>{fmt(item.quantity * item.unitPrice, invoice.currency)}</Text>
          </View>
        ))}

        {taxItems.map((item, i) => (
          <View key={i} style={S.tableRowTax}>
            <Text style={[S.tdItalic, S.colDesc]}>{item.description}</Text>
            <Text style={[S.tdMuted, S.colQty]}> </Text>
            <Text style={[S.tdMuted, S.colRate]}> </Text>
            <Text style={[S.tdMuted, S.colTotal]}>{fmt(item.quantity * item.unitPrice, invoice.currency)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={S.totalsSection}>
          {taxTotal > 0 && (
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>Subtotal</Text>
              <Text style={S.totalValue}>{fmt(subtotal, invoice.currency)}</Text>
            </View>
          )}
          {taxItems.map((item, i) => (
            <View key={i} style={S.totalRow}>
              <Text style={S.totalLabel}>{item.description}</Text>
              <Text style={S.totalValue}>{fmt(item.quantity * item.unitPrice, invoice.currency)}</Text>
            </View>
          ))}
          <View style={S.grandTotalRow}>
            <Text style={S.grandTotalLabel}>Total</Text>
            <Text style={S.grandTotalValue}>{fmt(total, invoice.currency)}</Text>
          </View>
          {payments.map((p, i) => (
            <View key={i} style={S.paymentRow}>
              <Text style={S.paymentLabel}>
                Payment {fmtDate(p.paidDate)}{p.paymentMethod ? ` · ${p.paymentMethod}` : ''}
              </Text>
              <Text style={S.paymentValue}>−{fmt(p.amount, invoice.currency)}</Text>
            </View>
          ))}
          {totalPaid > 0 && (
            <View style={S.balanceRow}>
              <Text style={S.balanceLabel}>Balance due</Text>
              <Text style={[S.balanceValue, balance <= 0 ? { color: '#16a34a' } : {}]}>{fmt(Math.max(balance, 0), invoice.currency)}</Text>
            </View>
          )}
        </View>

        {/* Notes */}
        {invoice.notes && (
          <View style={S.notesSection}>
            <Text style={S.notesLabel}>Notes</Text>
            <Text style={S.notesText}>{invoice.notes}</Text>
          </View>
        )}

        {/* Payment methods */}
        {hasPayment && (
          <View style={S.paySection}>
            <Text style={S.payTitle}>How to pay</Text>

            <View style={{ backgroundColor: '#fef3c7', borderRadius: 4, padding: 8, marginBottom: 10 }}>
              <Text style={{ fontSize: 8.5, color: '#92400e', fontFamily: 'Helvetica-Bold' }}>{payNote}</Text>
            </View>

            {hasBankTransfer && pm?.bankTransfer && (
              <View style={S.payBlock}>
                <Text style={S.payBlockTitle}>Bank Transfer{pm.bankTransfer.bankName ? ` — ${pm.bankTransfer.bankName}` : ''}</Text>
                {pm.bankTransfer.accountName && (
                  <View style={S.payRow}><Text style={S.payKey}>Account name</Text><Text style={S.payVal}>{pm.bankTransfer.accountName}</Text></View>
                )}
                {pm.bankTransfer.iban && (
                  <View style={S.payRow}><Text style={S.payKey}>IBAN</Text><Text style={S.payVal}>{pm.bankTransfer.iban}</Text></View>
                )}
                {pm.bankTransfer.swift && (
                  <View style={S.payRow}><Text style={S.payKey}>SWIFT / BIC</Text><Text style={S.payVal}>{pm.bankTransfer.swift}</Text></View>
                )}
                {pm.bankTransfer.sortCode && (
                  <View style={S.payRow}><Text style={S.payKey}>Sort code</Text><Text style={S.payVal}>{pm.bankTransfer.sortCode}</Text></View>
                )}
                {pm.bankTransfer.accountNumber && (
                  <View style={S.payRow}><Text style={S.payKey}>Account number</Text><Text style={S.payVal}>{pm.bankTransfer.accountNumber}</Text></View>
                )}
                {pm.bankTransfer.routingNumber && (
                  <View style={S.payRow}><Text style={S.payKey}>Routing number</Text><Text style={S.payVal}>{pm.bankTransfer.routingNumber}</Text></View>
                )}
              </View>
            )}

            {hasPaypal && pm?.paypal && (
              <View style={S.payBlock}>
                <Text style={S.payBlockTitle}>PayPal</Text>
                <View style={S.payRow}><Text style={S.payKey}>Link</Text><Text style={S.payVal}>{pm.paypal.link}</Text></View>
              </View>
            )}

            {hasStripe && pm?.stripe && (
              <View style={S.payBlock}>
                <Text style={S.payBlockTitle}>Pay by card (Stripe)</Text>
                <View style={S.payRow}><Text style={S.payKey}>Link</Text><Text style={S.payVal}>{pm.stripe.link}</Text></View>
              </View>
            )}

            {hasCustom && pm?.custom?.map((item, i) => (
              <View key={i} style={S.payBlock}>
                <Text style={S.payBlockTitle}>{item.label}</Text>
                <View style={S.payRow}><Text style={S.payVal}>{item.value}</Text></View>
              </View>
            ))}

          </View>
        )}

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>{invoice.invoiceNumber} · {invoice.fromName}</Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>

      </Page>
    </Document>
  )
}

/* ------------------------------------------------------------------ */
/*  Export: generate PDF buffer                                         */
/* ------------------------------------------------------------------ */

export async function generateInvoicePdf(
  invoice: PdfInvoice,
  paymentMethods?: PaymentMethods,
  invoicePaymentNote?: string,
): Promise<Buffer> {
  const buffer = await renderToBuffer(<InvoicePDF invoice={invoice} paymentMethods={paymentMethods} invoicePaymentNote={invoicePaymentNote} />)
  return Buffer.from(buffer)
}
