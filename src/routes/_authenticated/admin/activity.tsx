import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { adminAuditLog } from "@/lib/admin-dashboard.functions";
import { dateTime } from "@/components/admin/format";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/admin/activity")({
  component: ActivityPage,
});

function ActivityPage() {
  const fn = useServerFn(adminAuditLog);
  const q = useQuery({ queryKey: ["admin", "audit"], queryFn: () => fn() });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activity log</h1>
        <p className="text-sm text-muted-foreground">Every important admin action, newest first.</p>
      </div>

      {q.isLoading ? (
        <div className="overflow-x-auto rounded-xl border bg-card p-4 space-y-3 animate-pulse">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-3 text-left">
                  <Skeleton className="h-3 w-16 rounded" />
                </th>
                <th className="p-3 text-left">
                  <Skeleton className="h-3 w-20 rounded" />
                </th>
                <th className="p-3 text-left">
                  <Skeleton className="h-3 w-16 rounded" />
                </th>
                <th className="p-3 text-left">
                  <Skeleton className="h-3 w-20 rounded" />
                </th>
                <th className="p-3 text-left">
                  <Skeleton className="h-3 w-24 rounded" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                <tr key={i}>
                  <td className="p-3">
                    <Skeleton className="h-4 w-28 rounded" />
                  </td>
                  <td className="p-3">
                    <Skeleton className="h-4 w-36 rounded" />
                  </td>
                  <td className="p-3">
                    <Skeleton className="h-4 w-24 rounded" />
                  </td>
                  <td className="p-3">
                    <Skeleton className="h-4 w-20 rounded" />
                  </td>
                  <td className="p-3">
                    <Skeleton className="h-4 w-44 rounded" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-muted-foreground">No admin actions recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b">
                <th className="p-3">When</th>
                <th className="p-3">Admin</th>
                <th className="p-3">Action</th>
                <th className="p-3">Target</th>
                <th className="p-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">
                    {dateTime(row.created_at)}
                  </td>
                  <td className="p-3">{row.actor_email ?? "—"}</td>
                  <td className="p-3 font-medium">{row.action}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {row.entity_type ?? "—"}
                    {row.entity_id ? ` · ${row.entity_id.slice(0, 8)}` : ""}
                  </td>
                  <td className="max-w-xs truncate p-3 text-xs text-muted-foreground">
                    {JSON.stringify(row.details ?? {})}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
