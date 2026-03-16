import { Sidebar } from '@/components/layout/sidebar'
import { Shimmer } from '@/components/ui/shimmer'

export default function Loading() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        {/* Header skeleton */}
        <div className="border-b px-6 py-4">
          <Shimmer className="h-5 w-32" />
        </div>
        {/* Content skeleton */}
        <main className="flex-1 p-6 space-y-4">
          <Shimmer className="h-7 w-48" />
          <Shimmer className="h-4 w-80" />
          <div className="space-y-2 pt-2">
            <Shimmer className="h-10 w-full" />
            <Shimmer className="h-10 w-full" />
            <Shimmer className="h-10 w-full" />
            <Shimmer className="h-10 w-3/4" />
          </div>
        </main>
      </div>
    </div>
  )
}
