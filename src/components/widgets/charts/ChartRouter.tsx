import type { ChartDataPoint, WidgetConfig } from '@/types/widgets'
import type { DashboardCurrency } from '@/lib/currency'
import { BarChartWidget } from './BarChartWidget'
import { LineChartWidget } from './LineChartWidget'
import { AreaChartWidget } from './AreaChartWidget'
import { DonutChartWidget } from './DonutChartWidget'

interface Props {
  data: ChartDataPoint[]
  seriesKeys: string[]
  config: WidgetConfig
  currency?: DashboardCurrency
}

export function ChartRouter({ data, seriesKeys, config, currency }: Props) {
  switch (config.chartType) {
    case 'bar':
      return <BarChartWidget data={data} seriesKeys={seriesKeys} config={{ ...config, stacked: false }} currency={currency} />
    case 'stacked-bar':
      return <BarChartWidget data={data} seriesKeys={seriesKeys} config={{ ...config, stacked: true }} currency={currency} />
    case 'line':
      return <LineChartWidget data={data} seriesKeys={seriesKeys} config={config} currency={currency} />
    case 'area':
      return <AreaChartWidget data={data} seriesKeys={seriesKeys} config={config} currency={currency} />
    case 'donut':
      return <DonutChartWidget data={data} seriesKeys={seriesKeys} config={config} currency={currency} />
    default:
      return <BarChartWidget data={data} seriesKeys={seriesKeys} config={config} currency={currency} />
  }
}
