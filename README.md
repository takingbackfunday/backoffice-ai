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
