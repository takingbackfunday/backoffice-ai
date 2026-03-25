import { Sidebar } from '@/components/layout/sidebar'
import { Shimmer } from '@/components/ui/shimmer'

export default function PivotLoading() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <div className="border-b px-6 py-4">
          <Shimmer className="h-5 w-32" />
        </div>
        <main className="flex-1 p-6 space-y-3">
          {/* Toolbar shimmer */}
          <div className="flex items-center gap-3 px-4 py-2 border-b rounded-t-lg border">
            <Shimmer className="h-9 w-40" />
            <Shimmer className="h-9 w-32" />
            <Shimmer className="h-5 w-20" />
            <Shimmer className="h-5 w-24" />
            <Shimmer className="h-9 w-24 ml-auto" />
          </div>
          {/* Field bar shimmer */}
          <div className="border rounded-lg p-4 space-y-3">
            <Shimmer className="h-4 w-32" />
            <div className="flex gap-2">
              {[60, 80, 70, 90, 65].map((w, i) => (
                <Shimmer key={i} className={`h-6 w-${w >= 80 ? 20 : w >= 70 ? 16 : 14} rounded-md`} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              {[0, 1, 2].map(i => (
                <Shimmer key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          </div>
          {/* Table shimmer */}
          <div className="rounded-lg border overflow-hidden">
            <div className="bg-muted px-3 py-2 flex gap-4">
              {[28, 36, 20, 20, 20, 20].map((w, i) => (
                <Shimmer key={i} className={`h-3 w-${w}`} />
              ))}
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="border-t px-3 py-2 flex gap-4 items-center">
                <Shimmer className="h-3 w-28" />
                <Shimmer className="h-3 w-36" />
                <Shimmer className="h-3 w-20" />
                <Shimmer className="h-3 w-20" />
                <Shimmer className="h-3 w-20" />
                <Shimmer className="h-3 w-20" />
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
