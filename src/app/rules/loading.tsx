import { Sidebar } from '@/components/layout/sidebar'

function Shimmer({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />
}

export default function RulesLoading() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <div className="border-b px-6 py-4">
          <Shimmer className="h-5 w-16" />
        </div>
        <main className="flex-1 p-6 max-w-4xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Shimmer className="h-7 w-52" />
              <Shimmer className="h-3 w-96" />
            </div>
            <div className="flex gap-2">
              <Shimmer className="h-8 w-28" />
              <Shimmer className="h-8 w-36" />
              <Shimmer className="h-8 w-24" />
            </div>
          </div>
          <Shimmer className="h-9 w-full" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Shimmer key={i} className="h-10 w-full" />
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
