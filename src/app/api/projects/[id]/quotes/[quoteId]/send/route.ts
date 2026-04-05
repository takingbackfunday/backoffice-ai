import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'
import { generateQuotePdf } from '@/lib/pdf/quote-pdf'

interface RouteParams { params: Promise<{ id: string; quoteId: string }> }

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, quoteId } = await params

    const body = await request.json().catch(() => ({}))
    const message: string | undefined = body.message

    const quote = await prisma.quote.findFirst({
      where: { id: quoteId, clientProfile: { workspace: { id, userId } } },
      include: {
        sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
        clientProfile: {
          include: { workspace: { select: { name: true } } },
        },
      },
    })
    if (!quote) return notFound('Quote not found')
    if (!['DRAFT', 'REJECTED'].includes(quote.status)) {
      return badRequest('Quote cannot be sent in its current status')
    }

    const email = quote.clientProfile.email
    if (!email) return badRequest('No email address found for this client')

    const prefs = await prisma.userPreference.findUnique({ where: { userId } })
    const prefsData = (prefs?.data ?? {}) as Record<string, unknown>
    const fromName = (prefsData.businessName as string) || (prefsData.yourName as string) || quote.clientProfile.workspace.name || 'Quote'
    const resendApiKey = process.env.RESEND_API_KEY
    const resendFrom = process.env.RESEND_FROM || 'Backoffice <noreply@backoffice.cv>'

    // Generate PDF
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
      clientEmail: email,
      fromName,
      sections: quote.sections.map(s => ({
        name: s.name,
        items: s.items.map(i => ({
          description: i.description,
          quantity: Number(i.quantity),
          unit: i.unit ?? undefined,
          unitPrice: Number(i.unitPrice),
          isOptional: i.isOptional,
        })),
      })),
    })

    // Send email if Resend is configured
    if (resendApiKey) {
      const { Resend } = await import('resend')
      const resend = new Resend(resendApiKey)
      const recipientName = quote.clientProfile.contactName ?? quote.clientProfile.workspace.name ?? 'there'

      await resend.emails.send({
        from: resendFrom,
        to: email,
        subject: `Quote ${quote.quoteNumber} from ${fromName}`,
        html: `
          <p>Hi ${recipientName},</p>
          <p>${message || `Please find attached quote ${quote.quoteNumber} for your review.`}</p>
          <p>This quote is valid until ${quote.validUntil ? new Date(quote.validUntil).toLocaleDateString() : 'the date specified'}.</p>
          <p>Best regards,<br />${fromName}</p>
        `,
        attachments: [
          {
            filename: `${quote.quoteNumber}.pdf`,
            content: Buffer.from(pdfBuffer),
          },
        ],
      })
    }

    // Update status to SENT
    const updated = await prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sentTo: email,
      },
    })

    return ok({
      ...JSON.parse(JSON.stringify(updated)),
      emailSent: !!resendApiKey,
    })
  } catch (e) {
    console.error('[quote send]', e)
    return serverError()
  }
}
