import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { unauthorized, notFound, serverError } from '@/lib/api-response'
import { generateQuotePdf } from '@/lib/pdf/quote-pdf'
import { fetchImageAsDataUri } from '@/lib/pdf/fetch-image'
import { parsePreferences } from '@/types/preferences'
import { toDisplay } from '@/lib/money'
import { logger } from '@/lib/log'

interface RouteParams { params: Promise<{ id: string; quoteId: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, quoteId } = await params

    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, clientProfile: { workspace: { id, userId } } },
      include: {
        sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
        clientProfile: { include: { workspace: { select: { name: true } } } },
      },
    })
    if (!quote) return notFound('Quote not found')

    const prefs = await prisma.userPreference.findUnique({ where: { userId } })
    const prefsData = parsePreferences(prefs?.data)
    const logoDataUri = prefsData.logoUrl ? await fetchImageAsDataUri(prefsData.logoUrl) : null
    const fromName = prefsData.businessName || prefsData.yourName || quote.clientProfile.workspace.name || 'Quote'

    const pdfBuffer = await generateQuotePdf({
      quoteNumber: quote.quoteNumber,
      title: quote.title,
      version: quote.version,
      status: quote.status,
      currency: quote.currency,
      validUntil: quote.validUntil?.toISOString() ?? null,
      scopeNotes: quote.scopeNotes ?? null,
      terms: quote.terms ?? null,
      notes: quote.notes ?? null,
      paymentSchedule: (quote.paymentSchedule ?? null) as { milestone: string; percent: number }[] | null,
      clientName: quote.clientProfile.contactName ?? quote.clientProfile.workspace.name,
      clientEmail: quote.clientProfile.email ?? undefined,
      fromName,
      logoUrl: logoDataUri,
      sections: quote.sections.map(s => ({
        name: s.name,
        items: s.items.map(i => ({
          description: i.description,
          quantity: toDisplay(i.quantity),
          unit: i.unit ?? undefined,
          unitPrice: toDisplay(i.unitPrice),
          isOptional: i.isOptional,
        })),
      })),
    })

    const uint8 = new Uint8Array(pdfBuffer)
    return new Response(uint8, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${quote.quoteNumber}.pdf"`,
        'Content-Length': String(uint8.byteLength),
      },
    })
  } catch (e) {
    logger.error('quote-pdf', 'GET error', { message: e instanceof Error ? e.message : String(e) })
    return serverError('Failed to generate PDF')
  }
}
