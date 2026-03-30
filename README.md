# Backoffice AI

Financial management tool for freelancers, consultants, and small property managers.

Import CSVs from bank accounts, tag transactions to projects, and automate categorisation with rules and AI agents.

## Stack

- **Framework**: Next.js 16, App Router, TypeScript
- **Auth**: Clerk
- **Database**: PostgreSQL (Neon) via Prisma 7
- **Styling**: Tailwind CSS 4 + shadcn/ui (base-nova)
- **AI**: OpenRouter (`anthropic/claude-sonnet-4.6` for reasoning tasks, Gemini Flash for classification)

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

## Known gotchas

### Prisma generated client (v7)

Prisma 7 uses the `prisma-client` generator which outputs to `src/generated/prisma/` **without** an `index.ts` — the entry point is `client.ts`. All imports must use:

```ts
import { PrismaClient } from '@/generated/prisma/client'
```

Not `@/generated/prisma` (that worked in older generator versions but breaks in v7).

When you run `pnpm db:push` or `prisma generate`, you must prefix with the DATABASE_URL:

```bash
DATABASE_URL="$(netlify env:get DATABASE_URL)" pnpm db:push
DATABASE_URL="$(netlify env:get DATABASE_URL)" pnpm prisma generate
```

`src/generated/` is gitignored — it is rebuilt at deploy time on Netlify automatically.

### Environment variables in local dev

`.env.local` is required for `pnpm dev`. For one-off CLI commands (db push, prisma generate) the DATABASE_URL must be passed explicitly since Prisma's config loader doesn't read `.env.local`.

### Invoice AI models

Invoice AI routes (`/api/projects/[id]/invoices/ai-assist` and `ai-finalize`) call `anthropic/claude-sonnet-4.6` via OpenRouter. Responses are expected as JSON — the routes strip markdown code fences and extract the first `{...}` block as fallback.
