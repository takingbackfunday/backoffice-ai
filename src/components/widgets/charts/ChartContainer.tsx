'use client'

import { ResponsiveContainer } from 'recharts'
import type { ReactNode } from 'react'

interface ChartContainerProps {
  children: ReactNode
  height?: number
}

export function ChartContainer({ children, height = 350 }: ChartContainerProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      {children as React.ReactElement}
    </ResponsiveContainer>
  )
}
