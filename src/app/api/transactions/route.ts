import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError } from '@/lib/api-response'

const SORT_FIELDS = ['date', 'amount', 'description', 'category'] as const
type SortField = typeof SORT_FIELDS[number]

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') ?? '50')))
    const accountId = searchParams.get('accountId') ?? undefined
    const projectId = searchParams.get('projectId') ?? undefined
    const dateFrom = searchParams.get('dateFrom') ?? undefined
    const dateTo = searchParams.get('dateTo') ?? undefined

    // Global search
    const search = searchParams.get('search') ?? undefined

    // Targeted column filters
    const description = searchParams.get('description') ?? undefined
    const notes = searchParams.get('notes') ?? undefined
    const accountName = searchParams.get('accountName') ?? undefined
    const payeeName = searchParams.get('payeeName') ?? undefined
    const categoryId = searchParams.get('categoryId') ?? undefined
    const amountMinRaw = searchParams.get('amountMin') ?? undefined
    const amountMaxRaw = searchParams.get('amountMax') ?? undefined
    const amountMin = amountMinRaw !== undefined ? parseFloat(amountMinRaw) : undefined
    const amountMax = amountMaxRaw !== undefined ? parseFloat(amountMaxRaw) : undefined

    const rawSortBy = searchParams.get('sortBy') ?? 'date'
    const sortBy: SortField = (SORT_FIELDS as readonly string[]).includes(rawSortBy)
      ? (rawSortBy as SortField)
      : 'date'
    const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'

    const where = {
      account: { userId, ...(accountName ? { name: accountName } : {}) },
      ...(accountId ? { accountId } : {}),
      // projectId from column filter takes precedence over query param
      ...(projectId ? { projectId } : {}),
      ...(dateFrom || dateTo ? {
        date: {
          ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
          ...(dateTo ? { lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)) } : {}),
        },
      } : {}),
      ...(description ? { description: { contains: description, mode: 'insensitive' as const } } : {}),
      ...(notes ? { notes: { contains: notes, mode: 'insensitive' as const } } : {}),
      ...(payeeName ? { payee: { is: { name: { contains: payeeName, mode: 'insensitive' as const } } } } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(search ? {
        OR: [
          { description: { contains: search, mode: 'insensitive' as const } },
          { notes: { contains: search, mode: 'insensitive' as const } },
          { category: { contains: search, mode: 'insensitive' as const } },
          { payee: { is: { name: { contains: search, mode: 'insensitive' as const } } } },
          { account: { name: { contains: search, mode: 'insensitive' as const } } },
          { categoryRef: { is: { name: { contains: search, mode: 'insensitive' as const } } } },
        ],
      } : {}),
      ...(amountMin !== undefined && !isNaN(amountMin) ? { amount: { gte: amountMin } } : {}),
      ...(amountMax !== undefined && !isNaN(amountMax) ? {
        amount: {
          ...(amountMin !== undefined && !isNaN(amountMin) ? { gte: amountMin } : {}),
          lte: amountMax,
        },
      } : {}),
    }

    const [total, transactions] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        include: {
          account: { include: { institution: true } },
          project: true,
          categoryRef: { include: { group: true } },
          payee: true,
        },
        orderBy: { [sortBy]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return ok(transactions, {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch {
    return serverError('Failed to fetch transactions')
  }
}
