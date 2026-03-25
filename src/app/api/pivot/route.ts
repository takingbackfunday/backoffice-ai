import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'
import { format, getMonth, getYear } from 'date-fns'
import type { PivotRow } from '@/lib/pivot/types'

// TODO: Future optimization: server-side aggregation via Prisma groupBy or raw SQL
// for users with 10k+ transactions.

const SCHEDULE_REF_MAP: Record<string, string> = {
  C: 'Schedule C',
  E: 'Schedule E',
  'C,E': 'Schedule C & E',
}

function mapScheduleRef(ref: string | null | undefined): string {
  if (!ref || ref === 'none') return 'No Schedule'
  return SCHEDULE_REF_MAP[ref] ?? ref
}

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

function buildQuarter(date: Date): string {
  const month = getMonth(date) // 0-indexed
  const year = getYear(date)
  const q = Math.ceil((month + 1) / 3)
  return `Q${q} ${year}`
}

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    const transactions = await prisma.transaction.findMany({
      where: {
        account: { userId },
        ...(dateFrom || dateTo
          ? {
              date: {
                ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                ...(dateTo
                  ? { lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)) }
                  : {}),
              },
            }
          : {}),
      },
      include: {
        account: true,
        project: true,
        categoryRef: { include: { group: true } },
        payee: true,
      },
      orderBy: { date: 'asc' },
    })

    const rows: PivotRow[] = transactions.map(tx => {
      const date = tx.date
      return {
        id: tx.id,
        date: format(date, 'yyyy-MM-dd'),
        month: format(date, 'MMM yyyy'),
        quarter: buildQuarter(date),
        year: String(getYear(date)),
        dayOfWeek: format(date, 'EEEE'),
        category: tx.categoryRef?.name ?? 'Uncategorized',
        categoryGroup: tx.categoryRef?.group?.name ?? 'Uncategorized',
        taxSchedule: mapScheduleRef(tx.categoryRef?.group?.scheduleRef),
        taxType: tx.categoryRef?.group?.taxType ?? 'unclassified',
        payee: tx.payee?.name ?? 'No Payee',
        account: tx.account.name,
        accountType: mapAccountType(tx.account.type),
        project: tx.project?.name ?? 'No Project',
        projectType: tx.project?.type ?? 'N/A',
        type: Number(tx.amount) > 0 ? 'Income' : 'Expense',
        description: tx.description,
        amount: parseFloat(tx.amount.toString()),
        tags: tx.tags,
      }
    })

    return ok(rows)
  } catch (err) {
    console.error('[GET /api/pivot]', err)
    return serverError('Failed to load pivot data')
  }
}
