import { Skeleton } from "@/components/ui/skeleton";

export function AdminDashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse" aria-label="Loading dashboard panels">
      {/* Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-44 rounded-lg" />
        <Skeleton className="h-4 w-80 max-w-full rounded" />
      </div>

      {/* 4 Stat Cards Skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-24 rounded" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <Skeleton className="h-8 w-32 rounded-md" />
            <Skeleton className="h-3 w-48 max-w-full rounded" />
          </div>
        ))}
      </div>

      {/* Sales Chart Skeleton */}
      <section className="rounded-xl border bg-card p-4 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-36 rounded" />
          <Skeleton className="h-3 w-20 rounded" />
        </div>
        <div className="h-64 w-full flex items-end gap-2 pt-6 px-2">
          {[40, 65, 30, 85, 45, 90, 60, 75, 50, 95, 70, 80, 60, 85].map((h, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
              <Skeleton className="w-full rounded-t-sm" style={{ height: `${h}%` }} />
              <Skeleton className="h-2.5 w-6 rounded" />
            </div>
          ))}
        </div>
      </section>

      {/* 2-Column: Recent Orders & Best Sellers */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Orders Panel */}
        <section className="rounded-xl border bg-card p-4 lg:col-span-2 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-3.5 w-16 rounded" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2.5 text-left">
                    <Skeleton className="h-3 w-14 rounded" />
                  </th>
                  <th className="py-2.5 text-left">
                    <Skeleton className="h-3 w-20 rounded" />
                  </th>
                  <th className="py-2.5 text-left">
                    <Skeleton className="h-3 w-16 rounded" />
                  </th>
                  <th className="py-2.5 text-left">
                    <Skeleton className="h-3 w-14 rounded" />
                  </th>
                  <th className="py-2.5 text-right">
                    <Skeleton className="h-3 w-12 ml-auto rounded" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i}>
                    <td className="py-3">
                      <Skeleton className="h-4 w-20 rounded" />
                    </td>
                    <td className="py-3">
                      <Skeleton className="h-4 w-28 rounded" />
                    </td>
                    <td className="py-3">
                      <Skeleton className="h-3 w-24 rounded" />
                    </td>
                    <td className="py-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="py-3 text-right">
                      <Skeleton className="h-4 w-16 ml-auto rounded" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Best Sellers Panel */}
        <section className="rounded-xl border bg-card p-4 space-y-4 shadow-xs">
          <Skeleton className="h-4 w-28 rounded" />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-1">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <Skeleton className="h-4 w-3/4 rounded" />
                  <Skeleton className="h-3 w-1/2 rounded" />
                </div>
                <Skeleton className="h-4 w-16 shrink-0 rounded" />
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 2-Column: Stock Alerts & Newest Customers */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Stock Alerts Panel */}
        <section className="rounded-xl border bg-card p-4 space-y-4 shadow-xs">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-28 rounded" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-1">
                <Skeleton className="h-4 w-48 rounded" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
          <Skeleton className="h-3.5 w-28 rounded mt-2" />
        </section>

        {/* Newest Customers Panel */}
        <section className="rounded-xl border bg-card p-4 space-y-4 shadow-xs">
          <Skeleton className="h-4 w-36 rounded" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-1">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-3 w-44 rounded" />
                </div>
                <Skeleton className="h-4 w-20 shrink-0 rounded" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function AdminLayoutSkeleton() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header Bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-md md:hidden" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-24 rounded font-bold" />
            <Skeleton className="h-4 w-12 rounded-full" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-48 rounded-md hidden sm:block" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar Skeleton */}
        <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-card/40 p-3 space-y-1">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-28 rounded" />
            </div>
          ))}
        </aside>

        {/* Main Content Area Skeleton */}
        <main className="flex-1 p-4 md:p-8">
          <AdminDashboardSkeleton />
        </main>
      </div>
    </div>
  );
}

export function AdminTablePageSkeleton({ title }: { title?: string }) {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading admin table data">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          {title ? (
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          ) : (
            <Skeleton className="h-8 w-36 rounded-lg" />
          )}
          <Skeleton className="h-4 w-64 rounded" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-72 rounded-md" />
        <Skeleton className="h-9 w-36 rounded-md" />
      </div>

      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="rounded-xl border bg-card p-4 flex flex-wrap items-center justify-between gap-4"
          >
            <div className="space-y-2 flex-1 min-w-[200px]">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-24 rounded" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3.5 w-64 rounded" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-20 rounded" />
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminGridPageSkeleton({ title }: { title?: string }) {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading admin grid data">
      <div className="space-y-2">
        {title ? (
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        ) : (
          <Skeleton className="h-8 w-40 rounded-lg" />
        )}
        <Skeleton className="h-4 w-72 rounded" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border bg-card space-y-3">
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3.5 w-1/2 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
