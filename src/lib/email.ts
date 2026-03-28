import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = process.env.RESEND_FROM ?? 'Backoffice <noreply@backoffice.cv>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://backoffice.cv'

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
  if (!process.env.RESEND_API_KEY) return // silently skip if not configured

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
  if (!process.env.RESEND_API_KEY) return

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
