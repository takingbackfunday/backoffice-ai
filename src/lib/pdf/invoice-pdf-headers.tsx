import { Text, View, Image } from '@react-pdf/renderer'
import { StyleSheet } from '@react-pdf/renderer'
import type { PdfInvoice } from './invoice-pdf'
import type { InvoiceTemplateId } from './invoice-templates'
import { DEFAULT_INVOICE_TEMPLATE } from './invoice-templates'

const H = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 22 },
  fromName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#111' },
  headerRight: { alignItems: 'flex-end' },
  invoiceLabel: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#111', marginBottom: 4 },
  invoiceNum: { fontSize: 11, color: '#555' },
  metaValue: { fontSize: 9, color: '#111' },
  detailLine: { fontSize: 9, color: '#555' },
  vatLine: { fontSize: 9, color: '#888', marginTop: 2 },
  // Banner
  bannerBand: { backgroundColor: '#f5f5f5', padding: 16, marginBottom: 16, marginHorizontal: -48, paddingHorizontal: 48 },
})

function LogoImg({ logoUrl, style }: { logoUrl: string; style?: Record<string, unknown> }) {
  return (
    <Image src={logoUrl} style={{ maxWidth: 140, maxHeight: 56, objectFit: 'contain', marginBottom: 8, ...style }} />
  )
}

function NameAndDetails({ invoice, hideName }: { invoice: PdfInvoice; hideName: boolean }) {
  return (
    <>
      {!hideName && <Text style={H.fromName}>{invoice.fromName}</Text>}
      {invoice.fromAddress && <Text style={H.detailLine}>{invoice.fromAddress}</Text>}
      {invoice.fromEmail && <Text style={H.detailLine}>{invoice.fromEmail}</Text>}
      {invoice.fromPhone && <Text style={H.detailLine}>{invoice.fromPhone}</Text>}
      {invoice.fromWebsite && <Text style={H.detailLine}>{invoice.fromWebsite}</Text>}
      {invoice.fromVatNumber && <Text style={H.vatLine}>VAT: {invoice.fromVatNumber}</Text>}
    </>
  )
}

function InvoiceTitle({ invoice }: { invoice: PdfInvoice }) {
  return (
    <>
      <Text style={H.invoiceLabel}>INVOICE</Text>
      <Text style={H.invoiceNum}>{invoice.invoiceNumber}</Text>
    </>
  )
}

function TopLeft({ invoice, hideName, hideLogo }: { invoice: PdfInvoice; hideName: boolean; hideLogo?: boolean }) {
  return (
    <View style={H.header}>
      <View>
        {!hideLogo && invoice.logoUrl && <LogoImg logoUrl={invoice.logoUrl} />}
        <NameAndDetails invoice={invoice} hideName={hideName} />
      </View>
      <View style={H.headerRight}>
        <InvoiceTitle invoice={invoice} />
      </View>
    </View>
  )
}

function TopCenter({ invoice, hideName }: { invoice: PdfInvoice; hideName: boolean }) {
  return (
    <View style={{ alignItems: 'center', marginBottom: 22 }}>
      {invoice.logoUrl && <LogoImg logoUrl={invoice.logoUrl} />}
      {!hideName && <Text style={H.fromName}>{invoice.fromName}</Text>}
      {invoice.fromAddress && <Text style={H.detailLine}>{invoice.fromAddress}</Text>}
      {invoice.fromEmail && <Text style={H.detailLine}>{invoice.fromEmail}</Text>}
      {invoice.fromPhone && <Text style={H.detailLine}>{invoice.fromPhone}</Text>}
      {invoice.fromWebsite && <Text style={H.detailLine}>{invoice.fromWebsite}</Text>}
      {invoice.fromVatNumber && <Text style={H.vatLine}>VAT: {invoice.fromVatNumber}</Text>}
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <InvoiceTitle invoice={invoice} />
      </View>
    </View>
  )
}

function TopRight({ invoice, hideName }: { invoice: PdfInvoice; hideName: boolean }) {
  return (
    <View style={H.header}>
      <View>
        <InvoiceTitle invoice={invoice} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {invoice.logoUrl && <LogoImg logoUrl={invoice.logoUrl} />}
        <NameAndDetails invoice={invoice} hideName={hideName} />
      </View>
    </View>
  )
}

function Banner({ invoice, hideName }: { invoice: PdfInvoice; hideName: boolean }) {
  return (
    <View style={{ marginBottom: 22 }}>
      <View style={H.bannerBand}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {invoice.logoUrl && <LogoImg logoUrl={invoice.logoUrl} />}
          <View>
            <NameAndDetails invoice={invoice} hideName={hideName} />
          </View>
        </View>
      </View>
      <View style={{ marginTop: 8 }}>
        <InvoiceTitle invoice={invoice} />
      </View>
    </View>
  )
}

function Inline({ invoice, hideName }: { invoice: PdfInvoice; hideName: boolean }) {
  return (
    <View style={{ marginBottom: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {invoice.logoUrl && (
            <Image src={invoice.logoUrl} style={{ maxWidth: 44, maxHeight: 44, objectFit: 'contain' }} />
          )}
          <View>
            <NameAndDetails invoice={invoice} hideName={hideName} />
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <InvoiceTitle invoice={invoice} />
        </View>
      </View>
    </View>
  )
}

export function InvoiceHeader({ invoice, template, hideName }: { invoice: PdfInvoice; template?: InvoiceTemplateId | null; hideName: boolean }) {
  const tpl = template ?? DEFAULT_INVOICE_TEMPLATE
  switch (tpl) {
    case 'top-center': return <TopCenter invoice={invoice} hideName={hideName} />
    case 'top-right': return <TopRight invoice={invoice} hideName={hideName} />
    case 'banner': return <Banner invoice={invoice} hideName={hideName} />
    case 'inline': return <Inline invoice={invoice} hideName={hideName} />
    case 'footer-logo': return <TopLeft invoice={invoice} hideName={hideName} hideLogo />
    default: return <TopLeft invoice={invoice} hideName={hideName} />
  }
}
