import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'
import { Prisma } from '@/generated/prisma/client'
import type { PivotRow } from '@/lib/pivot/types'

// TODO: Future optimization: server-side aggregation via Prisma groupBy or raw SQL
// for users with 10k+ transactions.

// NOTE: The @neondatabase/serverless client serialises timestamptz values using
// the Neon server's local timezone rather than UTC, so JS Date objects built from
// the returned ISO strings have an incorrect epoch (off by the server's UTC offset).
// We work around this by having Postgres format the date parts directly as UTC
// strings via to_char(..., 'YYYY-MM-DD') AT TIME ZONE 'UTC', so we never touch
// JS Date methods on the returned date values.

const ACCOUNT_TYPE_MAP: Record<string, string> = {
  CREDIT_CARD: 'Credit Card',
  DEBIT_CARD: 'Debit Card',
  CHECKING: 'Checking',
  SAVINGS: 'Savings',
  BUSINESS_CHECKING: 'Business Checking',
  TRUST_ACCOUNT: 'Trust Account',
}

function mapAccountType(type: string): string {
  return ACCOUNT_TYPE_MAP[type] ?? type
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface RawTxRow {
  id: string
  date_iso: string        // 'YYYY-MM-DD' in UTC, formatted by Postgres
  amount: string
  description: string
  tags: string[]
  category_name: string | null
  category_group: string | null
  tax_type: string | null
  payee_name: string | null
  account_name: string
  account_type: string
  workspace_name: string | null
  workspace_type: string | null
}

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    // Use $queryRaw so Postgres formats the date as a UTC string directly.
    // This bypasses the neon client's timezone-mangled JS Date serialisation.
    // userId is parameterised; date strings are validated to be safe ISO dates before interpolation.
    const safeDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null)
    const from = safeDate(dateFrom)
    const to = safeDate(dateTo)

    const dateClause = from || to
      ? Prisma.sql`
          AND t.date >= ${from ? Prisma.sql`${from}::date` : Prisma.sql`'-infinity'::date`}
          AND t.date < ${to ? Prisma.sql`(${to}::date + INTERVAL '1 day')` : Prisma.sql`'infinity'::date`}
        `
      : Prisma.empty

    const txRows = await prisma.$queryRaw<RawTxRow[]>`
      SELECT
        t.id,
        to_char(t.date AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date_iso,
        t.amount::text AS amount,
        t.description,
        t.tags,
        c.name AS category_name,
        cg.name AS category_group,
        cg."taxType" AS tax_type,
        p.name AS payee_name,
        a.name AS account_name,
        a.type AS account_type,
        w.name AS workspace_name,
        w.type AS workspace_type
      FROM "Transaction" t
      JOIN "Account" a ON t."accountId" = a.id
      LEFT JOIN "Category" c ON t."categoryId" = c.id
      LEFT JOIN "CategoryGroup" cg ON c."groupId" = cg.id
      LEFT JOIN "Payee" p ON t."payeeId" = p.id
      LEFT JOIN "Project" w ON t."projectId" = w.id
      WHERE a."userId" = ${userId}
      ${dateClause}
      ORDER BY t.date ASC
    `

    const rows: PivotRow[] = txRows.map(tx => {
      const [yearStr, monthStr, dayStr] = tx.date_iso.split('-')
      const y = parseInt(yearStr, 10)
      const mo = parseInt(monthStr, 10) - 1 // 0-indexed
      const d = parseInt(dayStr, 10)
      const q = Math.ceil((mo + 1) / 3)

      // Day of week: Tomohiko Sakamoto algorithm
      const t2 = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
      const yr = mo < 2 ? y - 1 : y
      const dow = (yr + Math.floor(yr / 4) - Math.floor(yr / 100) + Math.floor(yr / 400) + t2[mo] + d) % 7

      return {
        id: tx.id,
        date: tx.date_iso,
        month: `${MONTH_NAMES[mo]} ${y}`,
        quarter: `Q${q} ${y}`,
        year: String(y),
        dayOfWeek: DAY_NAMES[dow],
        category: tx.category_name ?? 'Uncategorized',
        categoryGroup: tx.category_group ?? 'Uncategorized',
        taxType: tx.tax_type ?? 'unclassified',
        payee: tx.payee_name ?? 'No Payee',
        account: tx.account_name,
        accountType: mapAccountType(tx.account_type),
        project: tx.workspace_name ?? 'No Project',
        projectType: tx.workspace_type ?? 'N/A',
        type: parseFloat(tx.amount) > 0 ? 'Income' : 'Expense',
        description: tx.description,
        amount: parseFloat(tx.amount),
        tags: tx.tags ?? [],
      }
    })

    return ok(rows)
  } catch (err) {
    console.error('[GET /api/pivot]', err)
    return serverError('Failed to load pivot data')
  }
}
