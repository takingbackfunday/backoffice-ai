import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface PdfQuoteSection {
  name: string
  items: PdfQuoteLineItem[]
}

export interface PdfQuoteLineItem {
  description: string
  quantity: number
  unit?: string
  unitPrice: number
  isOptional?: boolean
}

export interface PdfQuote {
  quoteNumber: string
  title: string
  version: number
  status: string
  currency: string
  validUntil: string | null
  scopeNotes: string | null
  terms: string | null
  notes: string | null
  paymentSchedule: { milestone: string; percent: number }[] | null
  clientName: string | null | undefined
  clientEmail?: string
  fromName: string
  sections: PdfQuoteSection[]
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
  quoteLabel: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#111', marginBottom: 4 },
  quoteNum: { fontSize: 11, color: '#555' },
  // Meta row
  metaRow: { flexDirection: 'row', gap: 24, marginBottom: 28 },
  metaBlock: { flex: 1 },
  metaLabel: { fontSize: 7, color: '#888', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  metaValue: { fontSize: 9, color: '#111' },
  // Divider
  divider: { borderBottomWidth: 1, borderBottomColor: '#e5e5e5', marginBottom: 16 },
  // Scope notes
  scopeBox: { backgroundColor: '#f9f9f9', borderRadius: 4, padding: 12, marginBottom: 20 },
  scopeText: { fontSize: 9, color: '#333', lineHeight: 1.5 },
  // Table
  tableHeader: { flexDirection: 'row', backgroundColor: '#f5f5f5', borderRadius: 2, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 2 },
  tableRow: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  tableRowOptional: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fafafa' },
  colDesc: { flex: 1 },
  colQty: { width: 48, textAlign: 'right' },
  colRate: { width: 72, textAlign: 'right' },
  colTotal: { width: 80, textAlign: 'right' },
  thText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#555', textTransform: 'uppercase', letterSpacing: 0.4 },
  tdText: { fontSize: 9, color: '#111' },
  tdMuted: { fontSize: 9, color: '#777' },
  tdItalic: { fontSize: 9, color: '#777', fontFamily: 'Helvetica-Oblique' },
  optionalBadge: { fontSize: 7, color: '#888', fontFamily: 'Helvetica-Oblique' },
  // Totals
  totalsSection: { alignItems: 'flex-end', marginTop: 12, marginBottom: 20 },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 },
  totalLabel: { fontSize: 9, color: '#555', width: 120, textAlign: 'right' },
  totalValue: { fontSize: 9, color: '#111', fontFamily: 'Helvetica-Bold', width: 88, textAlign: 'right' },
  grandTotalLabel: { fontSize: 11, color: '#111', fontFamily: 'Helvetica-Bold', width: 120, textAlign: 'right' },
  grandTotalValue: { fontSize: 11, color: '#111', fontFamily: 'Helvetica-Bold', width: 88, textAlign: 'right' },
  // Payment schedule
  scheduleBox: { marginBottom: 20 },
  scheduleTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111', marginBottom: 8 },
  scheduleRow: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  scheduleLabel: { flex: 1, fontSize: 9, color: '#333' },
  scheduleValue: { fontSize: 9, color: '#111', fontFamily: 'Helvetica-Bold' },
  // Terms
  termsBox: { marginTop: 8 },
  termsTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  termsText: { fontSize: 8, color: '#666', lineHeight: 1.5 },
  // Notes
  notesBox: { marginBottom: 16 },
  notesText: { fontSize: 9, color: '#444', lineHeight: 1.5 },
  // Section header
  sectionHeader: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 },
})

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

function QuoteDocument({ quote }: { quote: PdfQuote }) {
  const currency = quote.currency

  const allItems = quote.sections.flatMap(s =>
    s.items.map(i => ({ ...i, sectionName: s.name }))
  )

  const requiredItems = allItems.filter(i => !i.isOptional)
  const optionalItems = allItems.filter(i => i.isOptional)

  const subtotal = requiredItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  const optionalTotal = optionalItems.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          <Text style={S.fromName}>{quote.fromName}</Text>
          <View style={S.headerRight}>
            <Text style={S.quoteLabel}>QUOTE</Text>
            <Text style={S.quoteNum}>{quote.quoteNumber}{quote.version > 1 ? ` v${quote.version}` : ''}</Text>
          </View>
        </View>

        {/* Meta row */}
        <View style={S.metaRow}>
          <View style={S.metaBlock}>
            <Text style={S.metaLabel}>For</Text>
            <Text style={S.metaValue}>{quote.clientName ?? 'Client'}</Text>
            {quote.clientEmail ? <Text style={S.tdMuted}>{quote.clientEmail}</Text> : null}
          </View>
          <View style={S.metaBlock}>
            <Text style={S.metaLabel}>Project</Text>
            <Text style={S.metaValue}>{quote.title}</Text>
          </View>
          <View style={S.metaBlock}>
            <Text style={S.metaLabel}>Valid Until</Text>
            <Text style={S.metaValue}>{quote.validUntil ? fmtDate(quote.validUntil) : 'On request'}</Text>
          </View>
        </View>

        <View style={S.divider} />

        {/* Scope notes */}
        {quote.scopeNotes ? (
          <View style={S.scopeBox}>
            <Text style={S.scopeText}>{quote.scopeNotes}</Text>
          </View>
        ) : null}

        {/* Notes */}
        {quote.notes ? (
          <View style={S.notesBox}>
            <Text style={S.notesText}>{quote.notes}</Text>
          </View>
        ) : null}

        {/* Line items table */}
        <View style={S.tableHeader}>
          <Text style={[S.thText, S.colDesc]}>Description</Text>
          <Text style={[S.thText, S.colQty]}>Qty</Text>
          <Text style={[S.thText, S.colRate]}>Unit Price</Text>
          <Text style={[S.thText, S.colTotal]}>Total</Text>
        </View>

        {quote.sections.map((section, si) => (
          <View key={si}>
            {quote.sections.length > 1 ? (
              <Text style={S.sectionHeader}>{section.name}</Text>
            ) : null}
            {section.items.filter(i => !i.isOptional).map((item, ii) => (
              <View key={ii} style={S.tableRow}>
                <View style={S.colDesc}>
                  <Text style={S.tdText}>{item.description}</Text>
                  {item.unit ? <Text style={S.tdMuted}>{item.unit}</Text> : null}
                </View>
                <Text style={[S.tdText, S.colQty]}>{item.quantity}</Text>
                <Text style={[S.tdText, S.colRate]}>{fmt(item.unitPrice, currency)}</Text>
                <Text style={[S.tdText, S.colTotal]}>{fmt(item.quantity * item.unitPrice, currency)}</Text>
              </View>
            ))}
          </View>
        ))}

        {/* Optional items */}
        {optionalItems.length > 0 ? (
          <View>
            <Text style={[S.sectionHeader, { marginTop: 16 }]}>Optional Add-ons</Text>
            {optionalItems.map((item, ii) => (
              <View key={ii} style={S.tableRowOptional}>
                <View style={S.colDesc}>
                  <Text style={S.tdText}>{item.description}</Text>
                  <Text style={S.optionalBadge}>(Optional)</Text>
                </View>
                <Text style={[S.tdMuted, S.colQty]}>{item.quantity}</Text>
                <Text style={[S.tdMuted, S.colRate]}>{fmt(item.unitPrice, currency)}</Text>
                <Text style={[S.tdMuted, S.colTotal]}>{fmt(item.quantity * item.unitPrice, currency)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Totals */}
        <View style={S.totalsSection}>
          {optionalItems.length > 0 ? (
            <>
              <View style={S.totalRow}>
                <Text style={S.totalLabel}>Subtotal (required)</Text>
                <Text style={S.totalValue}>{fmt(subtotal, currency)}</Text>
              </View>
              <View style={S.totalRow}>
                <Text style={S.totalLabel}>Optional add-ons</Text>
                <Text style={S.totalValue}>{fmt(optionalTotal, currency)}</Text>
              </View>
            </>
          ) : null}
          <View style={S.totalRow}>
            <Text style={S.grandTotalLabel}>Total</Text>
            <Text style={S.grandTotalValue}>{fmt(subtotal, currency)}</Text>
          </View>
        </View>

        {/* Payment schedule */}
        {quote.paymentSchedule && quote.paymentSchedule.length > 0 ? (
          <View style={S.scheduleBox}>
            <Text style={S.scheduleTitle}>Payment Schedule</Text>
            {quote.paymentSchedule.map((row, i) => (
              <View key={i} style={S.scheduleRow}>
                <Text style={S.scheduleLabel}>{row.milestone}</Text>
                <Text style={S.scheduleValue}>{row.percent}% — {fmt(subtotal * row.percent / 100, currency)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Terms */}
        {quote.terms ? (
          <View style={S.termsBox}>
            <Text style={S.termsTitle}>Terms & Conditions</Text>
            <Text style={S.termsText}>{quote.terms}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  )
}

/* ------------------------------------------------------------------ */
/*  Export                                                              */
/* ------------------------------------------------------------------ */

export async function generateQuotePdf(quote: PdfQuote): Promise<Buffer> {
  const buffer = await renderToBuffer(<QuoteDocument quote={quote} />)
  return Buffer.from(buffer)
}
