import { Resend } from 'resend'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'

const FROM = process.env.RESEND_FROM ?? 'Backoffice <noreply@backoffice.cv>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://backoffice.cv'

function getResend() {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

function renderPaymentMethodsHtml(pm: PaymentMethods): string {
  const bt = pm.bankTransfer
  const hasBt = bt && Object.values(bt).some(v => v)
  const hasPaypal = !!pm.paypal?.link
  const hasStripe = !!pm.stripe?.link
  if (!hasBt && !hasPaypal && !hasStripe) return ''

  const row = (label: string, value: string) =>
    `<tr><td style="color:#888;font-size:13px;padding:2px 12px 2px 0;white-space:nowrap">${label}</td><td style="font-size:13px;font-family:monospace">${value}</td></tr>`

  let html = `<div style="margin-top:24px;border:1px solid #e5e5e5;border-radius:8px;padding:16px 20px">
    <p style="font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin:0 0 12px">How to pay</p>`

  if (hasBt && bt) {
    html += `<p style="font-size:14px;font-weight:600;margin:0 0 6px">Bank transfer${bt.bankName ? ` — ${bt.bankName}` : ''}</p><table style="border-collapse:collapse">`
    if (bt.accountName) html += row('Account name', bt.accountName)
    if (bt.iban) html += row('IBAN', bt.iban)
    if (bt.swift) html += row('SWIFT / BIC', bt.swift)
    if (bt.sortCode) html += row('Sort code', bt.sortCode)
    if (bt.accountNumber) html += row('Account number', bt.accountNumber)
    if (bt.routingNumber) html += row('Routing number', bt.routingNumber)
    html += '</table>'
  }

  if (hasPaypal && pm.paypal) {
    html += `<p style="font-size:14px;font-weight:600;margin:12px 0 4px">PayPal</p>
      <a href="${pm.paypal.link}" style="color:#003087;font-size:13px">${pm.paypal.link}</a>`
  }

  if (hasStripe && pm.stripe) {
    html += `<p style="font-size:14px;font-weight:600;margin:12px 0 4px">Pay by card</p>
      <a href="${pm.stripe.link}" style="background:#635bff;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;display:inline-block;margin-top:4px">Pay now →</a>`
  }

  html += '</div>'
  return html
}

export async function sendTenantMessageNotification({
  toEmail,
  toName,
  subject,
  body,
  senderName,
}: {
  toEmail: string
  toName: string
  subject: string
  body: string
  senderName: string
}) {
  const resend = getResend()
  if (!resend) return

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `New message: ${subject}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111">
        <p style="color:#666;font-size:14px;margin-bottom:4px">Message from ${senderName}</p>
        <h2 style="margin:0 0 16px;font-size:18px">${subject}</h2>
        <div style="background:#f5f5f5;border-radius:8px;padding:16px 20px;font-size:15px;line-height:1.6;white-space:pre-wrap">${body}</div>
        <p style="margin-top:24px">
          <a href="${APP_URL}/portal/messages" style="background:#000;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">
            Reply in portal
          </a>
        </p>
        <p style="color:#999;font-size:12px;margin-top:32px">You're receiving this because you have an active tenancy. Log in to your tenant portal to reply.</p>
      </div>
    `,
  })
}

export async function sendInvoiceEmail({
  toEmail, toName, fromName, invoiceNumber, invoiceId, projectSlug,
  total, currency, dueDate, notes, message, paymentMethods, pdfBuffer,
}: {
  toEmail: string
  toName: string
  fromName: string
  invoiceNumber: string
  invoiceId: string
  projectSlug: string
  total: number
  currency: string
  dueDate: string
  notes?: string | null
  message?: string
  paymentMethods?: PaymentMethods
  pdfBuffer?: Buffer
}) {
  const resend = getResend()
  if (!resend) return

  const fmtAmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  const due = new Date(dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const messageHtml = message
    ? `<div style="font-size:15px;line-height:1.7;white-space:pre-wrap;margin-bottom:24px;color:#333">${message}</div>`
    : ''
  const paymentHtml = paymentMethods ? renderPaymentMethodsHtml(paymentMethods) : ''
  const notesHtml = notes
    ? `<div style="background:#f5f5f5;border-radius:8px;padding:14px 18px;font-size:13px;line-height:1.6;white-space:pre-wrap;margin-top:20px;color:#555">${notes}</div>`
    : ''

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `Invoice ${invoiceNumber} from ${fromName} — ${fmtAmt(total)} due ${due}`,
    html: `
      <div style="font-family:sans-serif;max-width:580px;margin:0 auto;color:#111;padding:0 0 40px">
        <div style="border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:24px">
          <p style="color:#666;font-size:13px;margin:0 0 4px">Invoice from ${fromName}</p>
          <h2 style="margin:0;font-size:22px">${invoiceNumber}</h2>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:24px">
          <div>
            <p style="font-size:32px;font-weight:700;margin:0;color:#111">${fmtAmt(total)}</p>
            <p style="color:#666;font-size:13px;margin:4px 0 0">Due ${due}</p>
          </div>
        </div>
        ${messageHtml}
        ${paymentHtml}
        ${notesHtml}
        <p style="color:#999;font-size:11px;margin-top:32px">The invoice PDF is attached to this email. Sent via Backoffice AI.</p>
      </div>
    `,
    attachments: pdfBuffer ? [{
      filename: `${invoiceNumber}.pdf`,
      content: pdfBuffer.toString('base64'),
    }] : [],
  })
}

export async function sendReminderEmail({
  toEmail, toName, fromName, invoiceNumber, invoiceId, projectSlug,
  balance, currency, dueDate, isOverdue, message, paymentMethods, pdfBuffer,
}: {
  toEmail: string
  toName: string
  fromName: string
  invoiceNumber: string
  invoiceId: string
  projectSlug: string
  balance: number
  currency: string
  dueDate: string
  isOverdue: boolean
  message?: string
  paymentMethods?: PaymentMethods
  pdfBuffer?: Buffer
}) {
  const resend = getResend()
  if (!resend) return

  const fmtAmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  const due = new Date(dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const subjectPrefix = isOverdue ? 'Overdue payment reminder' : 'Payment reminder'

  const overdueHtml = isOverdue
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-bottom:20px;color:#991b1b;font-size:13px;font-weight:500">This invoice is overdue. Please arrange payment as soon as possible.</div>`
    : ''
  const messageHtml = message
    ? `<div style="font-size:15px;line-height:1.7;white-space:pre-wrap;margin-bottom:24px;color:#333">${message}</div>`
    : ''
  const paymentHtml = paymentMethods ? renderPaymentMethodsHtml(paymentMethods) : ''

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${subjectPrefix}: ${invoiceNumber} — ${fmtAmt(balance)} outstanding`,
    html: `
      <div style="font-family:sans-serif;max-width:580px;margin:0 auto;color:#111;padding:0 0 40px">
        ${overdueHtml}
        <div style="border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:24px">
          <p style="color:#666;font-size:13px;margin:0 0 4px">Payment reminder from ${fromName}</p>
          <h2 style="margin:0;font-size:22px">${invoiceNumber}</h2>
        </div>
        <p style="font-size:32px;font-weight:700;margin:0 0 4px;color:${isOverdue ? '#991b1b' : '#111'}">${fmtAmt(balance)}</p>
        <p style="color:#666;font-size:13px;margin:4px 0 24px">${isOverdue ? `Was due ${due}` : `Due ${due}`}</p>
        ${messageHtml}
        ${paymentHtml}
        <p style="color:#999;font-size:11px;margin-top:32px">Invoice PDF attached. Sent via Backoffice AI.</p>
      </div>
    `,
    attachments: pdfBuffer ? [{
      filename: `${invoiceNumber}.pdf`,
      content: pdfBuffer.toString('base64'),
    }] : [],
  })
}

export async function sendOwnerMessageNotification({
  toEmail,
  toName,
  subject,
  body,
  tenantName,
  portalUrl,
}: {
  toEmail: string
  toName: string
  subject: string
  body: string
  tenantName: string
  portalUrl: string
}) {
  const resend = getResend()
  if (!resend) return

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `New message from ${tenantName}: ${subject}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111">
        <p style="color:#666;font-size:14px;margin-bottom:4px">Message from tenant ${tenantName}</p>
        <h2 style="margin:0 0 16px;font-size:18px">${subject}</h2>
        <div style="background:#f5f5f5;border-radius:8px;padding:16px 20px;font-size:15px;line-height:1.6;white-space:pre-wrap">${body}</div>
        <p style="margin-top:24px">
          <a href="${portalUrl}" style="background:#000;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">
            Reply in Backoffice
          </a>
        </p>
      </div>
    `,
  })
}
