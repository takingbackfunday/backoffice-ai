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
    const search = searchParams.get('search') ?? undefined

    const rawSortBy = searchParams.get('sortBy') ?? 'date'
    const sortBy: SortField = (SORT_FIELDS as readonly string[]).includes(rawSortBy)
      ? (rawSortBy as SortField)
      : 'date'
    const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'

    const where = {
      account: { userId },
      ...(accountId ? { accountId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(search
        ? {
            OR: [
              { description: { contains: search, mode: 'insensitive' as const } },
              { merchantName: { contains: search, mode: 'insensitive' as const } },
              { notes: { contains: search, mode: 'insensitive' as const } },
              { category: { contains: search, mode: 'insensitive' as const } },
              { payee: { is: { name: { contains: search, mode: 'insensitive' as const } } } },
              { account: { name: { contains: search, mode: 'insensitive' as const } } },
              { categoryRef: { is: { name: { contains: search, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
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
