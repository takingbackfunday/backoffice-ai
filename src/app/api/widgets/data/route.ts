import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { fetchWidgetData } from '@/lib/widgets/data-fetcher'
import { transformData } from '@/lib/widgets/data-transformer'
import { createDefaultWidgetConfig } from '@/lib/widgets/defaults'
import type { WidgetConfig } from '@/types/widgets'

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let config: WidgetConfig
  try {
    const body = await req.json()
    config = body.config ?? createDefaultWidgetConfig()
  } catch {
    config = createDefaultWidgetConfig()
  }

  try {
    const rows = await fetchWidgetData(userId, config)
    const { data, seriesKeys } = transformData(rows, config)
    return NextResponse.json({ data, seriesKeys })
  } catch (err) {
    console.error('[widgets/data]', err)
    return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 })
  }
}
