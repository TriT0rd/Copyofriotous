import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminDashboard } from "@/lib/admin-dashboard.functions";
import { money, dateTime, STATUS_TONE } from "@/components/admin/format";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, IndianRupee, Package, Receipt, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Dashboard,
});

function Stat({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-brand-red" />
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Dashboard() {
  const dashFn = useServerFn(adminDashboard);
  const q = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => dashFn(),
    refetchInterval: 60_000,
  });

  if (q.isLoading) return <p className="text-muted-foreground">Loading dashboard…</p>;
  if (q.isError)
    return (
      <p className="text-destructive">
        {(q.error as Error)?.message ?? "Could not load dashboard"}
      </p>
    );
  const d = q.data!;
  const cur = d.currency;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Live overview of sales, orders, inventory and customers.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Total sales"
          value={money(d.totals.sales, cur)}
          sub={`Today ${money(d.totals.salesToday, cur)} · This month ${money(d.totals.salesMonth, cur)}`}
          icon={IndianRupee}
        />
        <Stat
          label="Orders"
          value={String(d.totals.orders)}
          sub={`Avg order ${money(d.totals.avgOrderValue, cur)}`}
          icon={Receipt}
        />
        <Stat
          label="Products"
          value={String(d.totals.products)}
          sub={`${d.lowStock.length} low · ${d.outOfStock.length} out of stock`}
          icon={Package}
        />
        <Stat
          label="Customers"
          value={String(d.totals.customers)}
          sub="Registered accounts"
          icon={Users}
        />
      </div>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Sales · last 30 days
        </h2>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={d.salesByDay}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f00b11" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#f00b11" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeOpacity={0.1} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => v.slice(5)}
                fontSize={11}
                stroke="currentColor"
                opacity={0.5}
              />
              <YAxis fontSize={11} stroke="currentColor" opacity={0.5} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => money(v, cur)}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#f00b11"
                fill="url(#rev)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recent orders
            </h2>
            <Link to="/admin/orders" className="text-xs text-brand-red hover:underline">
              View all
            </Link>
          </div>
          {d.recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2">Order</th>
                    <th className="py-2">Customer</th>
                    <th className="py-2">Date</th>
                    <th className="py-2">Status</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recentOrders.map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="py-2 font-medium">{o.order_number}</td>
                      <td className="py-2">{o.shipping_name}</td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {dateTime(o.created_at)}
                      </td>
                      <td className="py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[o.status] ?? "bg-muted"}`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="py-2 text-right font-medium">
                        {money(o.total_amount, o.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Best sellers
          </h2>
          {d.bestSellers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {d.bestSellers.map((b) => (
                <li key={b.name} className="flex items-center justify-between gap-2">
                  <span className="truncate">{b.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {b.units} units · {money(b.revenue, cur)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Stock alerts
          </h2>
          {d.lowStock.length + d.outOfStock.length === 0 ? (
            <p className="text-sm text-muted-foreground">All products are healthy.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {d.outOfStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span className="truncate">{p.name}</span>
                  <Badge variant="destructive">Out of stock</Badge>
                </li>
              ))}
              {d.lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between">
                  <span className="truncate">{p.name}</span>
                  <Badge variant="secondary">{p.stock_quantity} left</Badge>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/admin/inventory"
            className="mt-3 inline-block text-xs text-brand-red hover:underline"
          >
            Manage inventory
          </Link>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Newest customers
          </h2>
          {d.recentCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No customers yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {d.recentCustomers.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate">{c.full_name || "—"}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.email}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {c.orders} orders · {money(c.spent, cur)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
