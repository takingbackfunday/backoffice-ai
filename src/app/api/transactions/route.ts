import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'
import { buildDuplicateHash } from '@/lib/dedup'
import { matchInvoicePayments } from '@/lib/invoice-matching'
import { matchReceiptTransactions } from '@/lib/receipt-matching'

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
    const workspaceId = searchParams.get('projectId') ?? searchParams.get('workspaceId') ?? undefined
    const dateFrom = searchParams.get('dateFrom') ?? undefined
    const dateTo = searchParams.get('dateTo') ?? undefined

    // Global search
    const search = searchParams.get('search') ?? undefined
    const searchAsNumber = search !== undefined ? parseFloat(search) : NaN

    // Targeted column filters
    const description = searchParams.get('description') ?? undefined
    const notes = searchParams.get('notes') ?? undefined
    const accountName = searchParams.get('accountName') ?? undefined
    const payeeName = searchParams.get('payeeName') ?? undefined
    const categoryId = searchParams.get('categoryId') ?? undefined
    const categoryGroupId = searchParams.get('categoryGroupId') ?? undefined
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
      // workspaceId from column filter takes precedence over query param
      ...(workspaceId ? { workspaceId } : {}),
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
      ...(categoryGroupId ? { categoryRef: { is: { groupId: categoryGroupId } } } : {}),
      ...(search ? {
        OR: [
          { description: { contains: search, mode: 'insensitive' as const } },
          { notes: { contains: search, mode: 'insensitive' as const } },
          { category: { contains: search, mode: 'insensitive' as const } },
          { payee: { is: { name: { contains: search, mode: 'insensitive' as const } } } },
          { account: { name: { contains: search, mode: 'insensitive' as const } } },
          { categoryRef: { is: { name: { contains: search, mode: 'insensitive' as const } } } },
          ...(!isNaN(searchAsNumber) ? [{ amount: searchAsNumber }, { amount: -searchAsNumber }] : []),
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
          workspace: true,
          categoryRef: { include: { group: true } },
          payee: true,
          receipts: { select: { id: true } },
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

export async function POST(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const body = await request.json()
    const { accountId, date, amount, description, categoryId, payeeId, workspaceId, notes } = body

    if (!accountId || !date || amount === undefined || amount === '' || !description) {
      return badRequest('accountId, date, amount and description are required')
    }

    const account = await prisma.account.findUnique({ where: { id: accountId } })
    if (!account || account.userId !== userId) return notFound('Account not found')

    const parsedAmount = parseFloat(String(amount))
    if (isNaN(parsedAmount)) return badRequest('Invalid amount')

    const duplicateHash = buildDuplicateHash({ accountId, date, amount: parsedAmount, description })

    try {
      const transaction = await prisma.transaction.create({
        data: {
          accountId,
          date: new Date(date),
          amount: parsedAmount,
          description,
          duplicateHash,
          rawData: {},
          ...(categoryId ? { categoryId } : {}),
          ...(payeeId ? { payeeId } : {}),
          ...(workspaceId ? { workspaceId } : {}),
          ...(notes ? { notes } : {}),
        },
        include: {
          account: { include: { institution: true } },
          workspace: true,
          categoryRef: { include: { group: true } },
          payee: true,
        },
      })
      await Promise.allSettled([
        matchInvoicePayments(userId, [transaction.id]),
        matchReceiptTransactions(userId, [transaction.id]),
      ])
      return created(transaction)
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
        return badRequest('Duplicate transaction')
      }
      throw e
    }
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
      return badRequest('Duplicate transaction')
    }
    return serverError('Failed to create transaction')
  }
}
