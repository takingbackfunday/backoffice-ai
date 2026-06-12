import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, serverError, badRequest } from '@/lib/api-response'
import { fetchKpi } from '@/app/api/widgets/kpi/route'
import { fetchCashflow } from '@/app/api/widgets/cashflow/route'
import { fetchNetWorth } from '@/app/api/widgets/networth/route'
import { fetchCategories } from '@/app/api/widgets/categories/route'
import type { DashboardCurrency } from '@/lib/fx'
import { logger } from '@/lib/log'

const VALID_WIDGETS = ['kpi', 'cashflow', 'networth', 'categories'] as const

type WidgetName = (typeof VALID_WIDGETS)[number]

export async function GET(request: Request) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()

    const { searchParams } = new URL(request.url)
    const widgetsParam = searchParams.get('widgets') ?? ''
    const widgetNames = widgetsParam.split(',').filter(Boolean) as WidgetName[]

    if (widgetNames.length === 0) {
      return badRequest('widgets param is required (comma-separated list of kpi, cashflow, networth, categories)')
    }

    const invalid = widgetNames.filter(n => !VALID_WIDGETS.includes(n))
    if (invalid.length > 0) {
      return badRequest(`Invalid widget names: ${invalid.join(', ')}`)
    }

    const currency = (searchParams.get('currency') ?? 'USD') as DashboardCurrency
    const period = searchParams.get('period') ?? 'last-6-months'
    const customStart = searchParams.get('start')
    const customEnd = searchParams.get('end')
    const categoriesParam = searchParams.get('categories')
    const categoryNames = categoriesParam ? categoriesParam.split(',').filter(Boolean) : []

    const result: Record<string, unknown> = {}

    await Promise.all(
      widgetNames.map(async (name) => {
        switch (name) {
          case 'kpi':
            result.kpi = await fetchKpi(userId, currency)
            break
          case 'cashflow':
            result.cashflow = await fetchCashflow(userId, currency, period, customStart, customEnd, categoryNames)
            break
          case 'networth':
            result.networth = await fetchNetWorth(userId, currency, period, customStart, customEnd, categoryNames)
            break
          case 'categories':
            result.categories = await fetchCategories(userId)
            break
        }
      }),
    )

    return ok(result)
  } catch (err) {
    logger.error('widgets-batch', 'GET error', { message: err instanceof Error ? err.message : String(err) })
    return serverError('Failed to fetch widget data')
  }
}
