import { Resend } from 'resend'

const FROM = process.env.RESEND_FROM ?? 'Backoffice <noreply@backoffice.cv>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://backoffice.cv'

function getResend() {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
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
  toEmail,
  toName,
  fromName,
  invoiceNumber,
  invoiceId,
  projectSlug,
  total,
  currency,
  dueDate,
  notes,
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
}) {
  const resend = getResend()
  if (!resend) return

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  const due = new Date(dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const invoiceUrl = `${APP_URL}/projects/${projectSlug}/invoices/${invoiceId}`

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `Invoice ${invoiceNumber} from ${fromName} — ${fmt(total)} due ${due}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111">
        <p style="color:#666;font-size:14px;margin-bottom:4px">Invoice from ${fromName}</p>
        <h2 style="margin:0 0 8px;font-size:22px">${invoiceNumber}</h2>
        <p style="font-size:28px;font-weight:700;margin:0 0 4px;color:#111">${fmt(total)}</p>
        <p style="color:#666;font-size:14px;margin:0 0 24px">Due ${due}</p>
        ${notes ? `<div style="background:#f5f5f5;border-radius:8px;padding:16px 20px;font-size:15px;line-height:1.6;white-space:pre-wrap;margin-bottom:24px">${notes}</div>` : ''}
        <p>
          <a href="${invoiceUrl}" style="background:#000;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">
            View invoice
          </a>
        </p>
        <p style="color:#999;font-size:12px;margin-top:32px">Sent via Backoffice AI</p>
      </div>
    `,
  })
}

export async function sendReminderEmail({
  toEmail,
  toName,
  fromName,
  invoiceNumber,
  invoiceId,
  projectSlug,
  balance,
  currency,
  dueDate,
  isOverdue,
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
}) {
  const resend = getResend()
  if (!resend) return

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  const due = new Date(dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const invoiceUrl = `${APP_URL}/projects/${projectSlug}/invoices/${invoiceId}`
  const subjectPrefix = isOverdue ? 'Overdue payment reminder' : 'Payment reminder'

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `${subjectPrefix}: ${invoiceNumber} — ${fmt(balance)} outstanding`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#111">
        ${isOverdue
          ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-bottom:20px;color:#991b1b;font-size:14px;font-weight:500">This invoice is overdue. Please arrange payment as soon as possible.</div>`
          : ''}
        <p style="color:#666;font-size:14px;margin-bottom:4px">Payment reminder from ${fromName}</p>
        <h2 style="margin:0 0 8px;font-size:22px">${invoiceNumber}</h2>
        <p style="font-size:28px;font-weight:700;margin:0 0 4px;color:${isOverdue ? '#991b1b' : '#111'}">${fmt(balance)}</p>
        <p style="color:#666;font-size:14px;margin:0 0 24px">${isOverdue ? `Was due ${due}` : `Due ${due}`}</p>
        <p>
          <a href="${invoiceUrl}" style="background:#000;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">
            View invoice
          </a>
        </p>
        <p style="color:#999;font-size:12px;margin-top:32px">Sent via Backoffice AI</p>
      </div>
    `,
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
