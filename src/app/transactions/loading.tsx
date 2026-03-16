import { Sidebar } from '@/components/layout/sidebar'
import { Shimmer } from '@/components/ui/shimmer'

export default function TransactionsLoading() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <div className="border-b px-6 py-4">
          <Shimmer className="h-5 w-32" />
        </div>
        <main className="flex-1 p-6 space-y-3">
          <div className="flex items-center justify-between">
            <Shimmer className="h-4 w-32" />
            <Shimmer className="h-8 w-52" />
          </div>
          <div className="rounded-lg border overflow-hidden">
            {/* Header row */}
            <div className="bg-muted px-3 py-2 flex gap-4">
              {[8, 16, 32, 16, 20, 16, 12, 20].map((w, i) => (
                <Shimmer key={i} className={`h-3 w-${w}`} />
              ))}
            </div>
            {/* Data rows */}
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="border-t px-3 py-2 flex gap-4 items-center">
                <Shimmer className="h-3 w-8" />
                <Shimmer className="h-3 w-24" />
                <Shimmer className="h-3 w-48" />
                <Shimmer className="h-3 w-24" />
                <Shimmer className="h-4 w-20 rounded-full" />
                <Shimmer className="h-3 w-16" />
                <Shimmer className="h-3 w-14 ml-auto" />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
