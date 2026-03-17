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
  return {
    account: {
      userId,
      ...(p.accountNames?.length ? { name: { in: p.accountNames } } : {}),
    },
    ...dateWhere(p.dateFrom, p.dateTo),
    ...(p.categoryNames?.length ? {
      OR: [
        { categoryRef: { name: { in: p.categoryNames.filter(c => c !== '(uncategorised)') } } },
        ...(p.categoryNames.includes('(uncategorised)') ? [{ categoryId: null }] : []),
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

  const lines = groups.flatMap(g => [
    `  [${g.name}]`,
    ...g.categories.map(c => `    - ${c.name}`),
  ])
  return `Category groups and categories:\n${lines.join('\n')}`
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
      description: 'Group and sum transactions by a dimension. Use for totals by category, payee, month, project, etc. Much more efficient than fetching raw rows when you just need totals.',
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
      description: 'Get income, expenses, or net over time at a given granularity. Use for trend questions, comparing periods, or spotting anomalies.',
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
]

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function dispatchTool(userId: string, name: string, args: unknown): Promise<string> {
  const a = args as Record<string, unknown>
  switch (name) {
    case 'query_transactions':     return query_transactions(userId, a as Parameters<typeof query_transactions>[1])
    case 'aggregate_transactions': return aggregate_transactions(userId, a as Parameters<typeof aggregate_transactions>[1])
    case 'get_time_series':        return get_time_series(userId, a as Parameters<typeof get_time_series>[1])
    case 'get_accounts':           return get_accounts(userId)
    case 'get_categories':         return get_categories(userId)
    case 'get_payees':             return get_payees(userId, a as Parameters<typeof get_payees>[1])
    case 'get_projects':           return get_projects(userId, a as Parameters<typeof get_projects>[1])
    case 'get_rules':              return get_rules(userId)
    case 'get_tags_summary':       return get_tags_summary(userId, a as Parameters<typeof get_tags_summary>[1])
    default: return `Unknown tool: ${name}`
  }
}
