import type { ChartDataPoint, WidgetConfig } from '@/types/widgets'
import { BarChartWidget } from './BarChartWidget'
import { LineChartWidget } from './LineChartWidget'
import { AreaChartWidget } from './AreaChartWidget'
import { DonutChartWidget } from './DonutChartWidget'

interface Props {
  data: ChartDataPoint[]
  seriesKeys: string[]
  config: WidgetConfig
}

export function ChartRouter({ data, seriesKeys, config }: Props) {
  switch (config.chartType) {
    case 'bar':
      return <BarChartWidget data={data} seriesKeys={seriesKeys} config={{ ...config, stacked: false }} />
    case 'stacked-bar':
      return <BarChartWidget data={data} seriesKeys={seriesKeys} config={{ ...config, stacked: true }} />
    case 'line':
      return <LineChartWidget data={data} seriesKeys={seriesKeys} config={config} />
    case 'area':
      return <AreaChartWidget data={data} seriesKeys={seriesKeys} config={config} />
    case 'donut':
      return <DonutChartWidget data={data} seriesKeys={seriesKeys} config={config} />
    default:
      return <BarChartWidget data={data} seriesKeys={seriesKeys} config={config} />
  }
}
