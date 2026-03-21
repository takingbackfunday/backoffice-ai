import { prisma } from '@/lib/prisma'
import type { ToolDefinition } from '@/lib/llm/openrouter'

// ── Shared filter helpers ─────────────────────────────────────────────────────

function dateWhere(dateFrom?: string, dateTo?: string) {
  if (!dateFrom && !dateTo) return {}
  return {
    date: {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(new Date(dateTo).setHours(23, 59, 59, 999)) } : {}),
    },
  }
}

function buildTransactionWhere(userId: string, p: {
  dateFrom?: string
  dateTo?: string
  accountNames?: string[]
  categoryNames?: string[]
  payeeNames?: string[]
  projectNames?: string[]
  tags?: string[]
  minAmount?: number
  maxAmount?: number
  descriptionContains?: string
  incomeOnly?: boolean
  expensesOnly?: boolean
}) {
  const hasCategoryFilter = !!p.categoryNames?.length
  return {
    account: {
      userId,
      ...(p.accountNames?.length ? { name: { in: p.accountNames } } : {}),
    },
    ...dateWhere(p.dateFrom, p.dateTo),
    // Exclude non-deductible groups (transfers, owner draws, etc.) unless
    // the caller has explicitly filtered to specific categories
    ...(!hasCategoryFilter ? { NOT: { categoryRef: { group: { taxType: 'non_deductible' } } } } : {}),
    ...(hasCategoryFilter ? {
      OR: [
        { categoryRef: { name: { in: p.categoryNames!.filter(c => c !== '(uncategorised)') } } },
        ...(p.categoryNames!.includes('(uncategorised)') ? [{ categoryId: null }] : []),
      ],
    } : {}),
    ...(p.payeeNames?.length ? { payee: { name: { in: p.payeeNames } } } : {}),
    ...(p.projectNames?.length ? { project: { name: { in: p.projectNames } } } : {}),
    ...(p.tags?.length ? { tags: { hasSome: p.tags } } : {}),
    ...(p.descriptionContains ? { description: { contains: p.descriptionContains, mode: 'insensitive' as const } } : {}),
    ...(p.minAmount !== undefined || p.maxAmount !== undefined || p.incomeOnly || p.expensesOnly ? {
      amount: {
        ...(p.incomeOnly ? { gt: 0 } : {}),
        ...(p.expensesOnly ? { lt: 0 } : {}),
        ...(p.minAmount !== undefined ? { gte: p.minAmount } : {}),
        ...(p.maxAmount !== undefined ? { lte: p.maxAmount } : {}),
      },
    } : {}),
  }
}

function fmtAmount(n: number) { return n.toFixed(2) }

// ── Tool implementations ──────────────────────────────────────────────────────

export async function query_transactions(userId: string, args: {
  dateFrom?: string
  dateTo?: string
  accountNames?: string[]
  categoryNames?: string[]
  payeeNames?: string[]
  projectNames?: string[]
  tags?: string[]
  minAmount?: number
  maxAmount?: number
  descriptionContains?: string
  incomeOnly?: boolean
  expensesOnly?: boolean
  sortBy?: 'date' | 'amount'
  sortDir?: 'asc' | 'desc'
  limit?: number
}): Promise<string> {
  const limit = Math.min(args.limit ?? 100, 500)
  const rows = await prisma.transaction.findMany({
    where: buildTransactionWhere(userId, args),
    select: {
      date: true,
      amount: true,
      description: true,
      notes: true,
      tags: true,
      categoryRef: { select: { name: true, group: { select: { name: true } } } },
      category: true,
      payee: { select: { name: true } },
      account: { select: { name: true } },
      project: { select: { name: true } },
    },
    orderBy: { [args.sortBy ?? 'date']: args.sortDir ?? 'desc' },
    take: limit,
  })

  if (!rows.length) return 'No transactions matched.'

  const total = rows.reduce((s, r) => s + Number(r.amount), 0)
  const lines = rows.map(r => {
    const date = new Date(r.date).toISOString().slice(0, 10)
    const amt = fmtAmount(Number(r.amount))
    const cat = r.categoryRef?.name ?? r.category ?? '(uncategorised)'
    const payee = r.payee?.name ?? '(no payee)'
    const proj = r.project?.name ? ` [${r.project.name}]` : ''
    const tags = r.tags.length ? ` {${r.tags.join(',')}}` : ''
    const notes = r.notes ? ` // ${r.notes.slice(0, 50)}` : ''
    return `${date} | ${amt} | ${cat} | ${payee} | ${r.account.name} | ${r.description.slice(0, 70)}${proj}${tags}${notes}`
  })

  return `${rows.length} transactions | net: ${fmtAmount(total)}\ndate | amount | category | payee | account | description\n${lines.join('\n')}`
}

export async function aggregate_transactions(userId: string, args: {
  groupBy: 'month' | 'week' | 'year' | 'category' | 'category_group' | 'payee' | 'account' | 'project' | 'tag'
  dateFrom?: string
  dateTo?: string
  accountNames?: string[]
  categoryNames?: string[]
  payeeNames?: string[]
  projectNames?: string[]
  tags?: string[]
  incomeOnly?: boolean
  expensesOnly?: boolean
  topN?: number
}): Promise<string> {
  const rows = await prisma.transaction.findMany({
    where: buildTransactionWhere(userId, args),
    select: {
      date: true,
      amount: true,
      tags: true,
      categoryRef: { select: { name: true, group: { select: { name: true } } } },
      category: true,
      payee: { select: { name: true } },
      account: { select: { name: true } },
      project: { select: { name: true } },
    },
    orderBy: { date: 'asc' },
  })

  if (!rows.length) return 'No transactions matched.'

  const buckets = new Map<string, { total: number; count: number }>()

  for (const r of rows) {
    let key: string
    const d = new Date(r.date)
    switch (args.groupBy) {
      case 'month': key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; break
      case 'week': {
        const startOfYear = new Date(d.getFullYear(), 0, 1)
        const week = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7)
        key = `${d.getFullYear()}-W${String(week).padStart(2, '0')}`; break
      }
      case 'year': key = String(d.getFullYear()); break
      case 'category': key = r.categoryRef?.name ?? r.category ?? '(uncategorised)'; break
      case 'category_group': key = r.categoryRef?.group?.name ?? '(no group)'; break
      case 'payee': key = r.payee?.name ?? '(no payee)'; break
      case 'account': key = r.account?.name ?? '(unknown)'; break
      case 'project': key = r.project?.name ?? '(no project)'; break
      case 'tag': {
        const tags = r.tags.length ? r.tags : ['(no tag)']
        for (const t of tags) {
          const b = buckets.get(t) ?? { total: 0, count: 0 }
          b.total += Number(r.amount)
          b.count++
          buckets.set(t, b)
        }
        continue
      }
      default: key = '(unknown)'
    }
    const b = buckets.get(key) ?? { total: 0, count: 0 }
    b.total += Number(r.amount)
    b.count++
    buckets.set(key, b)
  }

  let entries = [...buckets.entries()].sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total))
  if (args.topN) entries = entries.slice(0, args.topN)

  const lines = entries.map(([k, v]) => `  ${k}: ${fmtAmount(v.total)} (${v.count} txns)`)
  const grandTotal = rows.reduce((s, r) => s + Number(r.amount), 0)
  return `Grouped by ${args.groupBy} | ${rows.length} transactions | total: ${fmtAmount(grandTotal)}\n${lines.join('\n')}`
}

export async function get_time_series(userId: string, args: {
  granularity: 'day' | 'week' | 'month' | 'year'
  dateFrom?: string
  dateTo?: string
  accountNames?: string[]
  categoryNames?: string[]
  metric?: 'expenses' | 'income' | 'net'
}): Promise<string> {
  const metric = args.metric ?? 'net'
  const rows = await prisma.transaction.findMany({
    where: {
      ...buildTransactionWhere(userId, args),
      ...(metric === 'expenses' ? { amount: { lt: 0 } } :
         metric === 'income' ? { amount: { gt: 0 } } : {}),
    },
    select: { date: true, amount: true },
    orderBy: { date: 'asc' },
  })

  if (!rows.length) return 'No data.'

  const buckets = new Map<string, number>()
  for (const r of rows) {
    const d = new Date(r.date)
    let key: string
    switch (args.granularity) {
      case 'day': key = d.toISOString().slice(0, 10); break
      case 'week': {
        const dow = d.getDay()
        const monday = new Date(d)
        monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
        key = `week of ${monday.toISOString().slice(0, 10)}`; break
      }
      case 'month': key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; break
      case 'year': key = String(d.getFullYear()); break
    }
    buckets.set(key, (buckets.get(key) ?? 0) + Number(r.amount))
  }

  const lines = [...buckets.entries()].map(([k, v]) => `  ${k}: ${fmtAmount(v)}`)
  return `Time series (${metric}, by ${args.granularity}):\n${lines.join('\n')}`
}

export async function get_accounts(userId: string): Promise<string> {
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: {
      name: true,
      type: true,
      currency: true,
      lastImportAt: true,
      _count: { select: { transactions: true } },
    },
  })

  if (!accounts.length) return 'No accounts found.'

  // Get balance for each account
  const balances = await Promise.all(
    accounts.map(async (a) => {
      const agg = await prisma.transaction.aggregate({
        where: { account: { userId, name: a.name } },
        _sum: { amount: true },
      })
      return Number(agg._sum.amount ?? 0)
    })
  )

  const lines = accounts.map((a, i) =>
    `  ${a.name} (${a.type}, ${a.currency}) | balance: ${fmtAmount(balances[i])} | ${a._count.transactions} transactions | last import: ${a.lastImportAt?.toISOString().slice(0, 10) ?? 'never'}`
  )
  return `${accounts.length} accounts:\n${lines.join('\n')}`
}

export async function get_categories(userId: string): Promise<string> {
  const groups = await prisma.categoryGroup.findMany({
    where: { userId },
    include: { categories: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  })

  if (!groups.length) return 'No categories found.'

  const lines = groups.flatMap(g =>
    g.categories.map(c => `  ${c.name}  (group: ${g.name})`)
  )
  return `Available categories — use the EXACT name before the parenthesis as categoryName:\n${lines.join('\n')}`
}

export async function get_payees(userId: string, args: {
  withSpend?: boolean
  topN?: number
  dateFrom?: string
  dateTo?: string
}): Promise<string> {
  const payees = await prisma.payee.findMany({
    where: { userId },
    select: {
      name: true,
      defaultCategory: { select: { name: true } },
      _count: { select: { transactions: true } },
    },
    orderBy: { name: 'asc' },
  })

  if (!payees.length) return 'No payees found.'

  if (!args.withSpend) {
    const lines = payees.map(p =>
      `  ${p.name}${p.defaultCategory ? ` (default: ${p.defaultCategory.name})` : ''} | ${p._count.transactions} txns`
    )
    return `${payees.length} payees:\n${lines.join('\n')}`
  }

  // With spend — aggregate
  const spend = await Promise.all(
    payees.map(async (p) => {
      const agg = await prisma.transaction.aggregate({
        where: {
          account: { userId },
          payee: { name: p.name },
          amount: { lt: 0 },
          ...dateWhere(args.dateFrom, args.dateTo),
        },
        _sum: { amount: true },
        _count: true,
      })
      return { name: p.name, total: Math.abs(Number(agg._sum.amount ?? 0)), count: agg._count }
    })
  )

  let sorted = spend.sort((a, b) => b.total - a.total)
  if (args.topN) sorted = sorted.slice(0, args.topN)

  const lines = sorted.map(p => `  ${p.name}: ${fmtAmount(p.total)} (${p.count} txns)`)
  return `Payees by spend:\n${lines.join('\n')}`
}

export async function get_projects(userId: string, args: {
  dateFrom?: string
  dateTo?: string
}): Promise<string> {
  const projects = await prisma.project.findMany({
    where: { userId },
    select: { name: true, type: true, isActive: true, description: true },
  })

  if (!projects.length) return 'No projects found.'

  const breakdown = await Promise.all(
    projects.map(async (p) => {
      const [expAgg, incAgg] = await Promise.all([
        prisma.transaction.aggregate({
          where: { account: { userId }, project: { name: p.name }, amount: { lt: 0 }, ...dateWhere(args.dateFrom, args.dateTo) },
          _sum: { amount: true }, _count: true,
        }),
        prisma.transaction.aggregate({
          where: { account: { userId }, project: { name: p.name }, amount: { gt: 0 }, ...dateWhere(args.dateFrom, args.dateTo) },
          _sum: { amount: true }, _count: true,
        }),
      ])
      return {
        name: p.name,
        type: p.type,
        active: p.isActive,
        expenses: Math.abs(Number(expAgg._sum.amount ?? 0)),
        income: Number(incAgg._sum.amount ?? 0),
        txnCount: expAgg._count + incAgg._count,
      }
    })
  )

  const lines = breakdown
    .sort((a, b) => (b.expenses + b.income) - (a.expenses + a.income))
    .map(p =>
      `  ${p.name} (${p.type}${p.active ? '' : ', inactive'}) | expenses: ${fmtAmount(p.expenses)} | income: ${fmtAmount(p.income)} | net: ${fmtAmount(p.income - p.expenses)} | ${p.txnCount} txns`
    )

  return `${projects.length} projects:\n${lines.join('\n')}`
}

export async function get_rules(userId: string): Promise<string> {
  const rules = await prisma.categorizationRule.findMany({
    where: { userId },
    select: {
      name: true,
      isActive: true,
      priority: true,
      conditions: true,
      categoryRef: { select: { name: true } },
      payee: { select: { name: true } },
      project: { select: { name: true } },
    },
    orderBy: { priority: 'desc' },
  })

  if (!rules.length) return 'No rules found.'

  const lines = rules.map(r => {
    const actions = [
      r.categoryRef ? `category→${r.categoryRef.name}` : null,
      r.payee ? `payee→${r.payee.name}` : null,
      r.project ? `project→${r.project.name}` : null,
    ].filter(Boolean).join(', ')
    return `  [${r.isActive ? 'active' : 'inactive'}] ${r.name} (priority ${r.priority}) | ${actions}`
  })

  return `${rules.length} rules:\n${lines.join('\n')}`
}

export async function get_tags_summary(userId: string, args: {
  dateFrom?: string
  dateTo?: string
}): Promise<string> {
  const rows = await prisma.transaction.findMany({
    where: { account: { userId }, ...dateWhere(args.dateFrom, args.dateTo) },
    select: { tags: true, amount: true },
  })

  const byTag = new Map<string, { total: number; count: number }>()
  for (const r of rows) {
    for (const tag of r.tags) {
      const b = byTag.get(tag) ?? { total: 0, count: 0 }
      b.total += Math.abs(Number(r.amount))
      b.count++
      byTag.set(tag, b)
    }
  }

  if (!byTag.size) return 'No tagged transactions found.'

  const lines = [...byTag.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([tag, v]) => `  ${tag}: ${fmtAmount(v.total)} (${v.count} txns)`)

  return `Tags summary:\n${lines.join('\n')}`
}

// ── NEW: search_transactions ─────────────────────────────────────────────────

export async function search_transactions(userId: string, args: {
  query: string
  dateFrom?: string
  dateTo?: string
  limit?: number
}): Promise<string> {
  const limit = Math.min(args.limit ?? 100, 500)
  const q = args.query.trim()

  const rows = await prisma.transaction.findMany({
    where: {
      account: { userId },
      ...dateWhere(args.dateFrom, args.dateTo),
      OR: [
        { description: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
        { payee: { name: { contains: q, mode: 'insensitive' } } },
        { categoryRef: { name: { contains: q, mode: 'insensitive' } } },
      ],
    },
    select: {
      date: true, amount: true, description: true, notes: true,
      categoryRef: { select: { name: true } },
      category: true,
      payee: { select: { name: true } },
      account: { select: { name: true } },
      project: { select: { name: true } },
    },
    orderBy: { date: 'desc' },
    take: limit,
  })

  if (!rows.length) return `No transactions found matching "${q}".`

  const total = rows.reduce((s, r) => s + Number(r.amount), 0)
  const lines = rows.map(r => {
    const date = new Date(r.date).toISOString().slice(0, 10)
    const cat = r.categoryRef?.name ?? r.category ?? '(uncategorised)'
    const payee = r.payee?.name ?? '(no payee)'
    const proj = r.project?.name ? ` [${r.project.name}]` : ''
    const notes = r.notes ? ` // ${r.notes.slice(0, 50)}` : ''
    return `${date} | ${fmtAmount(Number(r.amount))} | ${cat} | ${payee} | ${r.account.name} | ${r.description.slice(0, 70)}${proj}${notes}`
  })

  return `${rows.length} results for "${q}" | net: ${fmtAmount(total)}\ndate | amount | category | payee | account | description\n${lines.join('\n')}`
}

// ── NEW: compare_periods ──────────────────────────────────────────────────────

export async function compare_periods(userId: string, args: {
  periodA: { dateFrom: string; dateTo: string; label?: string }
  periodB: { dateFrom: string; dateTo: string; label?: string }
  metric?: 'expenses' | 'income' | 'net'
  groupBy?: 'total' | 'category' | 'payee' | 'account'
}): Promise<string> {
  const metric = args.metric ?? 'net'
  const groupBy = args.groupBy ?? 'total'
  const labelA = args.periodA.label ?? `${args.periodA.dateFrom} → ${args.periodA.dateTo}`
  const labelB = args.periodB.label ?? `${args.periodB.dateFrom} → ${args.periodB.dateTo}`

  const amountFilter =
    metric === 'expenses' ? { lt: 0 as number } :
    metric === 'income'   ? { gt: 0 as number } : undefined

  async function fetchBuckets(dateFrom: string, dateTo: string) {
    const rows = await prisma.transaction.findMany({
      where: {
        account: { userId },
        ...dateWhere(dateFrom, dateTo),
        ...(amountFilter ? { amount: amountFilter } : {}),
      },
      select: {
        amount: true,
        categoryRef: { select: { name: true } },
        category: true,
        payee: { select: { name: true } },
        account: { select: { name: true } },
      },
    })

    if (groupBy === 'total') {
      const total = rows.reduce((s, r) => s + Number(r.amount), 0)
      return new Map([['total', total]])
    }

    const buckets = new Map<string, number>()
    for (const r of rows) {
      const key =
        groupBy === 'category' ? (r.categoryRef?.name ?? r.category ?? '(uncategorised)') :
        groupBy === 'payee'    ? (r.payee?.name ?? '(no payee)') :
        groupBy === 'account'  ? (r.account?.name ?? '(unknown)') : 'total'
      buckets.set(key, (buckets.get(key) ?? 0) + Number(r.amount))
    }
    return buckets
  }

  const [bucketsA, bucketsB] = await Promise.all([
    fetchBuckets(args.periodA.dateFrom, args.periodA.dateTo),
    fetchBuckets(args.periodB.dateFrom, args.periodB.dateTo),
  ])

  const allKeys = [...new Set([...bucketsA.keys(), ...bucketsB.keys()])]
    .sort((a, b) => Math.abs(bucketsB.get(b) ?? 0) - Math.abs(bucketsA.get(a) ?? 0))

  const lines = allKeys.map(key => {
    const a = bucketsA.get(key) ?? 0
    const b = bucketsB.get(key) ?? 0
    const diff = b - a
    const pct = a !== 0 ? ((diff / Math.abs(a)) * 100).toFixed(1) : 'n/a'
    const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '='
    return `  ${key.padEnd(30)} ${labelA}: ${fmtAmount(a).padStart(12)}  ${labelB}: ${fmtAmount(b).padStart(12)}  ${arrow} ${fmtAmount(Math.abs(diff))} (${pct}%)`
  })

  return `Period comparison (${metric}, grouped by ${groupBy}):\n${''.padEnd(30)} ${labelA.padStart(12)}  ${labelB.padStart(12)}  change\n${lines.join('\n')}`
}

// ── NEW: detect_anomalies ─────────────────────────────────────────────────────

export async function detect_anomalies(userId: string, args: {
  dimension?: 'month' | 'payee' | 'category'
  dateFrom?: string
  dateTo?: string
  metric?: 'expenses' | 'income' | 'net'
  sigmaThreshold?: number
}): Promise<string> {
  const dimension = args.dimension ?? 'month'
  const metric = args.metric ?? 'expenses'
  const sigma = args.sigmaThreshold ?? 2

  const amountFilter =
    metric === 'expenses' ? { lt: 0 as number } :
    metric === 'income'   ? { gt: 0 as number } : undefined

  const rows = await prisma.transaction.findMany({
    where: {
      account: { userId },
      ...dateWhere(args.dateFrom, args.dateTo),
      ...(amountFilter ? { amount: amountFilter } : {}),
    },
    select: {
      date: true, amount: true,
      categoryRef: { select: { name: true } },
      category: true,
      payee: { select: { name: true } },
    },
  })

  if (!rows.length) return 'No data to analyse.'

  const buckets = new Map<string, number[]>()
  for (const r of rows) {
    const d = new Date(r.date)
    const key =
      dimension === 'month'    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` :
      dimension === 'category' ? (r.categoryRef?.name ?? r.category ?? '(uncategorised)') :
      dimension === 'payee'    ? (r.payee?.name ?? '(no payee)') : 'bucket'
    const list = buckets.get(key) ?? []
    list.push(Math.abs(Number(r.amount)))
    buckets.set(key, list)
  }

  // For month/payee grouping: compute total per bucket, then find outliers across buckets
  const totals = [...buckets.entries()].map(([k, vals]) => ({
    key: k,
    total: vals.reduce((s, v) => s + v, 0),
    count: vals.length,
  }))

  const values = totals.map(t => t.total)
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const stddev = Math.sqrt(values.map(v => (v - mean) ** 2).reduce((s, v) => s + v, 0) / values.length)

  const outliers = totals
    .filter(t => Math.abs(t.total - mean) > sigma * stddev)
    .sort((a, b) => Math.abs(b.total - mean) - Math.abs(a.total - mean))

  if (!outliers.length) {
    return `No anomalies detected (σ threshold: ${sigma}). Mean ${dimension} ${metric}: ${fmtAmount(mean)}, stddev: ${fmtAmount(stddev)}.`
  }

  const lines = outliers.map(o => {
    const zScore = ((o.total - mean) / stddev).toFixed(1)
    const direction = o.total > mean ? 'HIGH' : 'LOW'
    return `  ${o.key}: ${fmtAmount(o.total)} (${direction}, z=${zScore}, ${o.count} txns)`
  })

  return `Anomalies in ${dimension} ${metric} (mean: ${fmtAmount(mean)}, σ: ${fmtAmount(stddev)}, threshold: ${sigma}σ):\n${lines.join('\n')}`
}

// ── NEW: get_recurring_payees ─────────────────────────────────────────────────

export async function get_recurring_payees(userId: string, args: {
  minMonths?: number
  dateFrom?: string
  dateTo?: string
  expensesOnly?: boolean
  incomeOnly?: boolean
}): Promise<string> {
  const minMonths = args.minMonths ?? 3

  const rows = await prisma.transaction.findMany({
    where: {
      account: { userId },
      payeeId: { not: null },
      ...dateWhere(args.dateFrom, args.dateTo),
      ...(args.expensesOnly ? { amount: { lt: 0 } } : {}),
      ...(args.incomeOnly ? { amount: { gt: 0 } } : {}),
    },
    select: {
      date: true, amount: true,
      payee: { select: { name: true } },
    },
  })

  if (!rows.length) return 'No payee transactions found.'

  // Group by payee → set of months
  const payeeMonths = new Map<string, Set<string>>()
  const payeeTotals = new Map<string, number>()
  const payeeCounts = new Map<string, number>()

  for (const r of rows) {
    const name = r.payee!.name
    const d = new Date(r.date)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!payeeMonths.has(name)) payeeMonths.set(name, new Set())
    payeeMonths.get(name)!.add(month)
    payeeTotals.set(name, (payeeTotals.get(name) ?? 0) + Math.abs(Number(r.amount)))
    payeeCounts.set(name, (payeeCounts.get(name) ?? 0) + 1)
  }

  const recurring = [...payeeMonths.entries()]
    .filter(([, months]) => months.size >= minMonths)
    .sort((a, b) => (payeeTotals.get(b[0]) ?? 0) - (payeeTotals.get(a[0]) ?? 0))

  if (!recurring.length) return `No payees found appearing in ${minMonths}+ distinct months.`

  const lines = recurring.map(([name, months]) => {
    const total = payeeTotals.get(name) ?? 0
    const count = payeeCounts.get(name) ?? 0
    const avg = total / months.size
    return `  ${name}: ${fmtAmount(total)} total | ${months.size} months | ${count} txns | avg ${fmtAmount(avg)}/month`
  })

  return `${recurring.length} recurring payees (appearing in ${minMonths}+ months):\n${lines.join('\n')}`
}

// ── NEW: compute_runway ───────────────────────────────────────────────────────

export async function compute_runway(userId: string, args: {
  lookbackMonths?: number
}): Promise<string> {
  const lookbackMonths = args.lookbackMonths ?? 6

  // Current net balance across all accounts
  const balanceAgg = await prisma.transaction.aggregate({
    where: { account: { userId } },
    _sum: { amount: true },
  })
  const balance = Number(balanceAgg._sum.amount ?? 0)

  // Average monthly burn over lookback period
  const lookbackFrom = new Date()
  lookbackFrom.setMonth(lookbackFrom.getMonth() - lookbackMonths)
  const lookbackFromStr = lookbackFrom.toISOString().slice(0, 10)

  const expenseRows = await prisma.transaction.findMany({
    where: {
      account: { userId },
      amount: { lt: 0 },
      date: { gte: lookbackFrom },
      NOT: { categoryRef: { group: { taxType: 'non_deductible' } } },
    },
    select: { date: true, amount: true },
  })

  if (!expenseRows.length) return 'Not enough expense data to compute runway.'

  // Group by month
  const byMonth = new Map<string, number>()
  for (const r of expenseRows) {
    const d = new Date(r.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    byMonth.set(key, (byMonth.get(key) ?? 0) + Math.abs(Number(r.amount)))
  }

  const monthlyBurns = [...byMonth.values()]
  const avgMonthlyBurn = monthlyBurns.reduce((s, v) => s + v, 0) / monthlyBurns.length
  const runwayMonths = avgMonthlyBurn > 0 ? balance / avgMonthlyBurn : Infinity

  const monthlyLines = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([m, v]) => `  ${m}: ${fmtAmount(v)}`)

  return `Runway analysis (based on last ${lookbackMonths} months of expenses):
  Current net balance: ${fmtAmount(balance)}
  Average monthly burn: ${fmtAmount(avgMonthlyBurn)} (over ${monthlyBurns.length} months, from ${lookbackFromStr})
  Estimated runway: ${runwayMonths === Infinity ? '∞' : runwayMonths.toFixed(1)} months

Monthly burn breakdown:
${monthlyLines.join('\n')}`
}

// ── NEW: get_tax_estimate ─────────────────────────────────────────────────────

export async function get_tax_estimate(userId: string, args: {
  dateFrom?: string
  dateTo?: string
  rate?: number
  breakdown?: 'none' | 'month' | 'quarter'
}): Promise<string> {
  const rate = (args.rate ?? 30) / 100
  const breakdown = args.breakdown ?? 'quarter'

  const rows = await prisma.transaction.findMany({
    where: {
      account: { userId },
      ...dateWhere(args.dateFrom, args.dateTo),
      NOT: { categoryRef: { group: { taxType: 'non_deductible' } } },
    },
    select: { date: true, amount: true },
    orderBy: { date: 'asc' },
  })

  if (!rows.length) return 'No transactions found in this period.'

  const totalIncome = rows.filter(r => Number(r.amount) > 0).reduce((s, r) => s + Number(r.amount), 0)
  const totalExpenses = rows.filter(r => Number(r.amount) < 0).reduce((s, r) => s + Math.abs(Number(r.amount)), 0)
  const netIncome = totalIncome - totalExpenses
  const taxEstimate = Math.max(0, netIncome * rate)

  let breakdownLines = ''
  if (breakdown !== 'none') {
    const buckets = new Map<string, { income: number; expenses: number }>()
    for (const r of rows) {
      const d = new Date(r.date)
      let key: string
      if (breakdown === 'month') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      } else {
        const q = Math.floor(d.getMonth() / 3) + 1
        key = `${d.getFullYear()} Q${q}`
      }
      const b = buckets.get(key) ?? { income: 0, expenses: 0 }
      if (Number(r.amount) > 0) b.income += Number(r.amount)
      else b.expenses += Math.abs(Number(r.amount))
      buckets.set(key, b)
    }

    const blines = [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => {
        const net = v.income - v.expenses
        const tax = Math.max(0, net * rate)
        return `  ${k}: income ${fmtAmount(v.income)} | expenses ${fmtAmount(v.expenses)} | net ${fmtAmount(net)} | est. tax ${fmtAmount(tax)}`
      })
    breakdownLines = `\nBreakdown by ${breakdown}:\n${blines.join('\n')}`
  }

  return `Tax estimate at ${(rate * 100).toFixed(0)}% rate (${args.dateFrom ?? 'all time'} → ${args.dateTo ?? 'now'}):
  Total income:   ${fmtAmount(totalIncome)}
  Total expenses: ${fmtAmount(totalExpenses)}
  Net income:     ${fmtAmount(netIncome)}
  Estimated tax:  ${fmtAmount(taxEstimate)}${breakdownLines}`
}

// ── Tool schemas (OpenAI-compatible function format) ─────────────────────────

export const FINANCE_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'query_transactions',
      description: 'Fetch individual transactions with optional filters. Use when you need to see specific transaction details, descriptions, notes, or a list of charges.',
      parameters: {
        type: 'object',
        properties: {
          dateFrom: { type: 'string', description: 'Start date YYYY-MM-DD (inclusive)' },
          dateTo: { type: 'string', description: 'End date YYYY-MM-DD (inclusive)' },
          accountNames: { type: 'array', items: { type: 'string' }, description: 'Filter by account names' },
          categoryNames: { type: 'array', items: { type: 'string' }, description: 'Filter by category names. Use "(uncategorised)" for uncategorised transactions.' },
          payeeNames: { type: 'array', items: { type: 'string' }, description: 'Filter by payee names' },
          projectNames: { type: 'array', items: { type: 'string' }, description: 'Filter by project names' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags e.g. billable, reimbursable, tax-deductible' },
          minAmount: { type: 'number', description: 'Minimum signed amount (e.g. -1000 means expenses of at least 1000)' },
          maxAmount: { type: 'number', description: 'Maximum signed amount' },
          descriptionContains: { type: 'string', description: 'Substring to match in description' },
          incomeOnly: { type: 'boolean', description: 'Only return income (positive amounts)' },
          expensesOnly: { type: 'boolean', description: 'Only return expenses (negative amounts)' },
          sortBy: { type: 'string', enum: ['date', 'amount'], description: 'Sort field' },
          sortDir: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction' },
          limit: { type: 'number', description: 'Max rows to return (default 100, max 500)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aggregate_transactions',
      description: 'Group and sum transactions by a dimension. Use for totals by category, payee, month, project, etc. Much more efficient than fetching raw rows when you just need totals. Non-deductible categories (transfers, owner draws) are automatically excluded unless you pass explicit categoryNames.',
      parameters: {
        type: 'object',
        required: ['groupBy'],
        properties: {
          groupBy: { type: 'string', enum: ['month', 'week', 'year', 'category', 'category_group', 'payee', 'account', 'project', 'tag'], description: 'Dimension to group by' },
          dateFrom: { type: 'string', description: 'Start date YYYY-MM-DD' },
          dateTo: { type: 'string', description: 'End date YYYY-MM-DD' },
          accountNames: { type: 'array', items: { type: 'string' } },
          categoryNames: { type: 'array', items: { type: 'string' } },
          payeeNames: { type: 'array', items: { type: 'string' } },
          projectNames: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
          incomeOnly: { type: 'boolean' },
          expensesOnly: { type: 'boolean' },
          topN: { type: 'number', description: 'Return only top N results by absolute value' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_time_series',
      description: 'Get income, expenses, or net over time at a given granularity. Use for trend questions, comparing periods, or spotting anomalies. Exclude "Account Transfers" categories when measuring expenses.',
      parameters: {
        type: 'object',
        required: ['granularity'],
        properties: {
          granularity: { type: 'string', enum: ['day', 'week', 'month', 'year'] },
          dateFrom: { type: 'string' },
          dateTo: { type: 'string' },
          accountNames: { type: 'array', items: { type: 'string' } },
          categoryNames: { type: 'array', items: { type: 'string' } },
          metric: { type: 'string', enum: ['expenses', 'income', 'net'], description: 'Default: net' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_accounts',
      description: 'List all accounts with their current balance, type, currency, and transaction count.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_categories',
      description: 'List all category groups and categories. Use this to discover exact category names before filtering.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_payees',
      description: 'List payees. Optionally include total spend per payee.',
      parameters: {
        type: 'object',
        properties: {
          withSpend: { type: 'boolean', description: 'Include total spend per payee' },
          topN: { type: 'number', description: 'Return only top N by spend (requires withSpend: true)' },
          dateFrom: { type: 'string' },
          dateTo: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_projects',
      description: 'List projects with income, expenses, and net per project. Use for project P&L questions.',
      parameters: {
        type: 'object',
        properties: {
          dateFrom: { type: 'string' },
          dateTo: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_rules',
      description: 'List all categorization rules with their conditions and actions.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_tags_summary',
      description: 'Summarise transactions by tag (billable, reimbursable, tax-deductible, etc). Use for questions about billable work or tax-deductible expenses.',
      parameters: {
        type: 'object',
        properties: {
          dateFrom: { type: 'string' },
          dateTo: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_transactions',
      description: 'Full-text search across transaction description, notes, payee name, and category. Use when looking for a specific vendor, keyword, or phrase that may appear anywhere.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Search term — matched against description, notes, payee, and category' },
          dateFrom: { type: 'string' },
          dateTo: { type: 'string' },
          limit: { type: 'number', description: 'Max results (default 100, max 500)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_periods',
      description: 'Side-by-side comparison of two date ranges. Returns totals and % change for income, expenses, or net — optionally broken down by category, payee, or account. Use for month-over-month, year-over-year, or any custom period comparison.',
      parameters: {
        type: 'object',
        required: ['periodA', 'periodB'],
        properties: {
          periodA: {
            type: 'object',
            required: ['dateFrom', 'dateTo'],
            properties: {
              dateFrom: { type: 'string' },
              dateTo: { type: 'string' },
              label: { type: 'string', description: 'Human label e.g. "Last month"' },
            },
          },
          periodB: {
            type: 'object',
            required: ['dateFrom', 'dateTo'],
            properties: {
              dateFrom: { type: 'string' },
              dateTo: { type: 'string' },
              label: { type: 'string' },
            },
          },
          metric: { type: 'string', enum: ['expenses', 'income', 'net'], description: 'Default: net' },
          groupBy: { type: 'string', enum: ['total', 'category', 'payee', 'account'], description: 'Default: total' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'detect_anomalies',
      description: 'Find statistically unusual months, payees, or categories using z-score analysis. Use for questions like "which months were unusually expensive?" or "are there any abnormal payees?"',
      parameters: {
        type: 'object',
        properties: {
          dimension: { type: 'string', enum: ['month', 'payee', 'category'], description: 'What to look for anomalies in. Default: month' },
          dateFrom: { type: 'string' },
          dateTo: { type: 'string' },
          metric: { type: 'string', enum: ['expenses', 'income', 'net'], description: 'Default: expenses' },
          sigmaThreshold: { type: 'number', description: 'Z-score threshold for anomaly (default 2.0 = 2 standard deviations)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recurring_payees',
      description: 'Identify payees that appear in multiple months — i.e. recurring costs or regular income sources. Use for questions about fixed costs, subscriptions, or regular clients.',
      parameters: {
        type: 'object',
        properties: {
          minMonths: { type: 'number', description: 'Minimum number of distinct months a payee must appear in (default 3)' },
          dateFrom: { type: 'string' },
          dateTo: { type: 'string' },
          expensesOnly: { type: 'boolean' },
          incomeOnly: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compute_runway',
      description: 'Calculate cash runway: current net balance divided by average monthly burn. Use for "how long can I sustain current spending?" questions.',
      parameters: {
        type: 'object',
        properties: {
          lookbackMonths: { type: 'number', description: 'How many recent months to average burn over (default 6)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_tax_estimate',
      description: 'Estimate tax liability based on net income at a given rate. Breaks down by month or quarter. Use for questions about estimated taxes, quarterly tax payments, or tax planning.',
      parameters: {
        type: 'object',
        properties: {
          dateFrom: { type: 'string' },
          dateTo: { type: 'string' },
          rate: { type: 'number', description: 'Tax rate as a percentage (default 30)' },
          breakdown: { type: 'string', enum: ['none', 'month', 'quarter'], description: 'How to break down the estimate (default: quarter)' },
        },
      },
    },
  },
]

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function dispatchTool(userId: string, name: string, args: unknown): Promise<string> {
  const a = args as Record<string, unknown>
  switch (name) {
    // QUERY
    case 'query_transactions':     return query_transactions(userId, a as Parameters<typeof query_transactions>[1])
    case 'search_transactions':    return search_transactions(userId, a as Parameters<typeof search_transactions>[1])
    // AGGREGATE
    case 'aggregate_transactions': return aggregate_transactions(userId, a as Parameters<typeof aggregate_transactions>[1])
    case 'get_time_series':        return get_time_series(userId, a as Parameters<typeof get_time_series>[1])
    case 'get_tags_summary':       return get_tags_summary(userId, a as Parameters<typeof get_tags_summary>[1])
    // DISCOVERY
    case 'get_accounts':           return get_accounts(userId)
    case 'get_categories':         return get_categories(userId)
    case 'get_payees':             return get_payees(userId, a as Parameters<typeof get_payees>[1])
    case 'get_projects':           return get_projects(userId, a as Parameters<typeof get_projects>[1])
    case 'get_rules':              return get_rules(userId)
    // ANALYSIS
    case 'compare_periods':        return compare_periods(userId, a as Parameters<typeof compare_periods>[1])
    case 'detect_anomalies':       return detect_anomalies(userId, a as Parameters<typeof detect_anomalies>[1])
    case 'get_recurring_payees':   return get_recurring_payees(userId, a as Parameters<typeof get_recurring_payees>[1])
    case 'compute_runway':         return compute_runway(userId, a as Parameters<typeof compute_runway>[1])
    case 'get_tax_estimate':       return get_tax_estimate(userId, a as Parameters<typeof get_tax_estimate>[1])
    default: return `Unknown tool: ${name}`
  }
}
