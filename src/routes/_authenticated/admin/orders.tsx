import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  adminListOrders,
  adminUpdateOrderStatus,
  adminBulkUpdateOrderStatus,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  type AdminOrder,
} from "@/lib/admin.functions";
import { money, dateTime, STATUS_TONE } from "@/components/admin/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, Printer, Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type Search = { q?: string; status?: string; payment?: string; from?: string; to?: string };

export const Route = createFileRoute("/_authenticated/admin/orders")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s["q"] === "string" ? s["q"] : undefined,
    status: typeof s["status"] === "string" ? s["status"] : undefined,
    payment: typeof s["payment"] === "string" ? s["payment"] : undefined,
    from: typeof s["from"] === "string" ? s["from"] : undefined,
    to: typeof s["to"] === "string" ? s["to"] : undefined,
  }),
  component: OrdersPage,
});

function esc(v: unknown) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function invoiceHtml(o: AdminOrder) {
  const rows = o.items
    .map(
      (i) => `<tr>
        <td>${esc(i.product_name)}${i.selected_size ? ` · ${esc(i.selected_size)}` : ""}${i.selected_color ? ` · ${esc(i.selected_color)}` : ""}</td>
        <td style="text-align:center">${esc(i.quantity)}</td>
        <td style="text-align:right">${esc(money(i.price, o.currency))}</td>
        <td style="text-align:right">${esc(money(i.subtotal, o.currency))}</td>
      </tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(o.order_number)}</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,Arial;padding:32px;color:#111}
    h1{letter-spacing:.3em;margin:0 0 4px;font-size:22px}
    table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
    th,td{border-bottom:1px solid #ddd;padding:8px 6px;text-align:left}
    .muted{color:#666;font-size:12px}
    .totals{margin-top:16px;width:260px;margin-left:auto;font-size:13px}
    .totals div{display:flex;justify-content:space-between;padding:4px 0}
    .grand{font-weight:700;border-top:1px solid #111;margin-top:4px;padding-top:6px}
  </style></head><body>
  <h1>RI<span style="color:#f00b11">O</span>T<span style="color:#f00b11">O</span>US</h1>
  <div class="muted">Tax invoice · ${esc(o.order_number)}</div>
  <p class="muted">Date: ${esc(dateTime(o.created_at))}<br/>Payment: ${esc(o.payment_method)} (${esc(o.payment_status)})<br/>Status: ${esc(o.status)}</p>
  <p><strong>Ship to</strong><br/>${esc(o.shipping_name)}<br/>${esc(o.shipping_address).replace(/\n/g, "<br/>")}<br/>${esc(o.shipping_email)}${o.shipping_phone ? `<br/>${esc(o.shipping_phone)}` : ""}</p>
  <table><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="totals">
    <div><span>Subtotal</span><span>${esc(money(o.subtotal || o.total_amount, o.currency))}</span></div>
    <div><span>Discount${o.discount_code ? ` (${esc(o.discount_code)})` : ""}</span><span>-${esc(money(o.discount_amount, o.currency))}</span></div>
    <div><span>Shipping</span><span>${esc(money(o.shipping_charge, o.currency))}</span></div>
    <div><span>Tax</span><span>${esc(money(o.tax_amount, o.currency))}</span></div>
    <div class="grand"><span>Total</span><span>${esc(money(o.total_amount, o.currency))}</span></div>
  </div>
  <p class="muted" style="margin-top:32px">Thank you for shopping with RIOTOUS.</p>
  <script>window.onload=()=>window.print()</script>
  </body></html>`;
}

function csvExport(orders: AdminOrder[]) {
  const head = [
    "Order",
    "Date",
    "Customer",
    "Email",
    "Phone",
    "Status",
    "Payment",
    "Method",
    "Total",
    "Courier",
    "Tracking",
    "Address",
  ];
  const rows = orders.map((o) => [
    o.order_number,
    new Date(o.created_at).toISOString(),
    o.shipping_name,
    o.shipping_email,
    o.shipping_phone ?? "",
    o.status,
    o.payment_status,
    o.payment_method,
    String(o.total_amount),
    o.courier_name ?? "",
    o.tracking_number ?? "",
    o.shipping_address.replace(/\n/g, " "),
  ]);
  const csv = [head, ...rows]
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? "");
          const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
          return `"${safe.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\n");

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `riotous-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function OrdersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();
  const listFn = useServerFn(adminListOrders);
  const updateFn = useServerFn(adminUpdateOrderStatus);
  const bulkFn = useServerFn(adminBulkUpdateOrderStatus);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<string>("Confirmed");

  const ordersQ = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: () => listFn(),
    refetchInterval: 20000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    qc.invalidateQueries({ queryKey: ["admin", "variants"] });
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
  };

  const update = useMutation({
    mutationFn: (p: Parameters<typeof updateFn>[0]["data"]) => updateFn({ data: p }),
    onSuccess: () => {
      toast.success("Order updated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulk = useMutation({
    mutationFn: (p: { orderIds: string[]; status: string }) => bulkFn({ data: p }),
    onSuccess: (r) => {
      toast.success(`${r.updated} order(s) updated`);
      setSelected([]);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setSearchKey = (key: keyof Search, value: string) =>
    navigate({
      search: (prev) => ({ ...prev, [key]: value || undefined }),
      replace: true,
    });

  const orders = useMemo(() => (Array.isArray(ordersQ.data) ? ordersQ.data : []), [ordersQ.data]);
  const filtered = useMemo(() => {
    if (!Array.isArray(orders)) return [];
    const q = (search.q ?? "").toLowerCase().trim();
    const from = search.from ? new Date(search.from).getTime() : null;
    const to = search.to ? new Date(search.to).getTime() + 86400000 : null;
    return orders.filter((o) => {
      if (!o) return false;
      if (search.status && o.status !== search.status) return false;
      if (search.payment && o.payment_status !== search.payment) return false;
      const t = new Date(o.created_at).getTime();
      if (from && t < from) return false;
      if (to && t > to) return false;
      if (q) {
        const hay =
          `${o.order_number ?? ""} ${o.shipping_name ?? ""} ${o.shipping_email ?? ""} ${o.shipping_phone ?? ""} ${o.tracking_number ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search]);

  const revenue = useMemo(() => {
    if (!Array.isArray(filtered)) return 0;
    return filtered
      .filter((o) => o && !["Cancelled", "Returned", "Refunded"].includes(o.status))
      .reduce((s, o) => s + Number(o.total_amount || 0), 0);
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} order(s) · {money(revenue)} net revenue
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => csvExport(filtered)}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search order, name, email, tracking…"
          value={search.q ?? ""}
          onChange={(e) => setSearchKey("q", e.target.value)}
          className="h-9 w-full sm:w-72"
        />
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={search.status ?? ""}
          onChange={(e) => setSearchKey("status", e.target.value)}
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={search.payment ?? ""}
          onChange={(e) => setSearchKey("payment", e.target.value)}
        >
          <option value="">All payments</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Input
          type="date"
          value={search.from ?? ""}
          onChange={(e) => setSearchKey("from", e.target.value)}
          className="h-9 w-auto"
        />
        <Input
          type="date"
          value={search.to ?? ""}
          onChange={(e) => setSearchKey("to", e.target.value)}
          className="h-9 w-auto"
        />
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
          <span>{selected.length} selected</span>
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={bulk.isPending}
            onClick={() => bulk.mutate({ orderIds: selected, status: bulkStatus })}
          >
            Apply status
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}

      {ordersQ.isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="rounded-xl border bg-card p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Skeleton className="h-4 w-4 rounded" />
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-24 rounded" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-3.5 w-64 max-w-full rounded" />
                </div>
              </div>
              <div className="text-right space-y-1">
                <Skeleton className="h-5 w-20 ml-auto rounded" />
                <Skeleton className="h-3 w-14 ml-auto rounded" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-20 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">No orders match these filters.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <div key={o.id} className="rounded-xl border bg-card">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <input
                  type="checkbox"
                  aria-label={`Select ${o.order_number}`}
                  checked={selected.includes(o.id)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked ? [...s, o.id] : s.filter((x) => x !== o.id),
                    )
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{o.order_number}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[o.status] ?? "bg-muted"}`}
                    >
                      {o.status}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[o.payment_status] ?? "bg-muted"}`}
                    >
                      {o.payment_status}
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {dateTime(o.created_at)} · {o.shipping_name} · {o.shipping_email}
                    {o.shipping_phone ? ` · ${o.shipping_phone}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{money(o.total_amount, o.currency)}</div>
                  <div className="text-xs text-muted-foreground">
                    {(o.items ?? []).length} item(s)
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => {
                      const w = window.open("", "_blank", "width=820,height=900");
                      if (!w) return toast.error("Allow pop-ups to print invoices");
                      w.document.write(invoiceHtml(o));
                      w.document.close();
                    }}
                  >
                    <Printer className="h-3.5 w-3.5" /> Invoice
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                  >
                    {expanded === o.id ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {expanded === o.id && (
                <div className="grid gap-6 border-t p-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground">Items</h3>
                    {o.items.map((i) => {
                      const art = i.design_preview ?? i.product_image;
                      return (
                        <div key={i.id} className="flex items-center gap-3 text-sm">
                          {art ? (
                            <a href={art} target="_blank" rel="noreferrer" title="Open artwork">
                              <img
                                src={art}
                                alt={i.product_name}
                                className={`h-12 w-12 rounded bg-muted ${
                                  i.design_submission_id ? "object-contain" : "object-cover"
                                }`}
                              />
                            </a>
                          ) : (
                            <div className="h-12 w-12 rounded bg-muted" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{i.product_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {[i.selected_size, i.selected_color].filter(Boolean).join(" · ")}
                              {i.design_submission_id ? " · custom design" : ""}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">×{i.quantity}</div>
                          <div className="w-20 text-right">{money(i.subtotal, o.currency)}</div>
                        </div>
                      );
                    })}
                    <div className="space-y-1 border-t pt-3 text-sm">
                      <Row
                        label="Subtotal"
                        value={money(o.subtotal || o.total_amount, o.currency)}
                      />
                      <Row label="Discount" value={`-${money(o.discount_amount, o.currency)}`} />
                      <Row label="Shipping" value={money(o.shipping_charge, o.currency)} />
                      <Row label="Tax" value={money(o.tax_amount, o.currency)} />
                      <Row label="Total" value={money(o.total_amount, o.currency)} bold />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <div className="font-medium text-foreground">Shipping address</div>
                      <div className="whitespace-pre-line">{o.shipping_address}</div>
                    </div>
                  </div>

                  <OrderControls
                    order={o}
                    onSave={(p) => update.mutate(p)}
                    busy={update.isPending}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function OrderControls({
  order,
  onSave,
  busy,
}: {
  order: AdminOrder;
  onSave: (p: {
    orderId: string;
    status?: string;
    paymentStatus?: string;
    courierName?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    adminNotes?: string | null;
  }) => void;
  busy: boolean;
}) {
  const [status, setStatus] = useState(order.status);
  const [payment, setPayment] = useState(order.payment_status);
  const [courier, setCourier] = useState(order.courier_name ?? "");
  const [tracking, setTracking] = useState(order.tracking_number ?? "");
  const [trackingUrl, setTrackingUrl] = useState(order.tracking_url ?? "");
  const [notes, setNotes] = useState(order.admin_notes ?? "");

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">Manage order</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Order status</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Payment status</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
          >
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Courier</Label>
          <Input value={courier} onChange={(e) => setCourier(e.target.value)} />
        </div>
        <div>
          <Label>Tracking number</Label>
          <Input value={tracking} onChange={(e) => setTracking(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Tracking URL</Label>
          <Input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Internal notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Marking an order Shipped deducts the reserved stock. Cancelling, returning or refunding it
        puts the stock back automatically.
      </p>
      <Button
        disabled={busy}
        onClick={() =>
          onSave({
            orderId: order.id,
            status,
            paymentStatus: payment,
            courierName: courier.trim() || null,
            trackingNumber: tracking.trim() || null,
            trackingUrl: trackingUrl.trim() || null,
            adminNotes: notes.trim() || null,
          })
        }
      >
        {busy ? "Saving…" : "Save order"}
      </Button>
    </div>
  );
}
