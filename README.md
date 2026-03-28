# Backoffice AI

Financial management tool for freelancers, consultants, and small property managers.

Import CSVs from bank accounts, tag transactions to projects, and automate categorisation with rules and AI agents.

## Stack

- **Framework**: Next.js 14, App Router, TypeScript
- **Auth**: Clerk
- **Database**: PostgreSQL (Neon) via Prisma
- **Styling**: Tailwind CSS + shadcn/ui
- **AI**: OpenRouter

## Development

```bash
pnpm install
pnpm dev
```

Requires a `.env.local` file with Clerk, Neon, and OpenRouter credentials.

## Pending setup

### Email notifications (Resend) — not yet configured
Message notifications are implemented but disabled until Resend is set up.

1. Create an account at [resend.com](https://resend.com)
2. Verify the domain `backoffice.cv` (adds DNS records — takes ~10 min)
3. Add to Netlify environment variables:
   - `RESEND_API_KEY` — from Resend dashboard
   - `RESEND_FROM` — `Backoffice <noreply@backoffice.cv>`

Without these vars the app works fine — email sending is silently skipped.
