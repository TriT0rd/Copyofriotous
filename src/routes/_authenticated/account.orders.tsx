import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Package, ArrowRight, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getMyOrders, cancelMyOrder } from "@/lib/orders.functions";
import { formatPrice } from "@/lib/catalog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/account/orders")({
  head: () => ({
    meta: [
      { title: "My Orders — RIOTOUS" },
      { name: "description", content: "View your RIOTOUS order history." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const qc = useQueryClient();
  const fetchOrders = useServerFn(getMyOrders);
  const cancelOrderFn = useServerFn(cancelMyOrder);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => fetchOrders(),
  });

  const cancelMut = useMutation({
    mutationFn: (orderId: string) => cancelOrderFn({ data: { orderId } }),
    onSuccess: () => {
      toast.success("Order cancelled and inventory restored");
      qc.invalidateQueries({ queryKey: ["my-orders"] });
      setCancellingId(null);
    },
    onError: (e: Error) => {
      toast.error(e.message || "Failed to cancel order");
      setCancellingId(null);
    },
  });

  const orders = Array.isArray(data) ? data : [];

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-16 md:px-10 md:py-24">
      <div className="mb-10 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Account
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">My Orders</h1>
        </div>
        <div className="flex gap-4 text-sm font-medium text-muted-foreground">
          <Link to="/account/returns" className="hover:text-foreground">
            Returns & support →
          </Link>
          <Link to="/account/favorites" className="hover:text-foreground">
            Favorites →
          </Link>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && <p className="text-sm text-destructive">Could not load your orders.</p>}

      {!isLoading && orders.length === 0 && (
        <div className="rounded-2xl border border-border bg-secondary/40 py-20 text-center">
          <Package className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-4 text-lg font-semibold">No orders yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When you place an order it'll appear here.
          </p>
          <Link
            to="/shop"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90"
          >
            Start shopping <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {!isLoading && orders.length > 0 && (
        <div className="space-y-6">
          {orders.map((o) => (
            <article key={o.id} className="rounded-2xl border border-border bg-card p-6 md:p-8">
              <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Order {o.name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Placed{" "}
                    {new Date(o.processedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">
                    {formatPrice(o.total.amount, o.total.currencyCode)}
                  </p>
                  <div className="mt-1 flex flex-wrap justify-end gap-1.5">
                    {o.financialStatus && (
                      <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                        {o.financialStatus.toLowerCase()}
                      </span>
                    )}
                    {o.fulfillmentStatus && (
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        {o.fulfillmentStatus.toLowerCase()}
                      </span>
                    )}
                  </div>
                </div>
              </header>

              <ul className="mt-5 space-y-4">
                {o.lineItems.map((li, i) => (
                  <li key={i} className="flex items-center gap-4">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-secondary">
                      {li.imageUrl && (
                        <img
                          src={li.imageUrl}
                          alt={li.title}
                          className={`h-full w-full ${
                            li.designSubmissionId ? "object-contain" : "object-cover"
                          }`}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{li.title}</p>
                      <p className="text-xs text-muted-foreground">Qty {li.quantity}</p>
                    </div>
                    {li.price && (
                      <p className="whitespace-nowrap text-sm font-medium">
                        {formatPrice(li.price.amount, li.price.currencyCode)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>

              {["Pending", "Processing"].includes(o.fulfillmentStatus || "") && (
                <div className="mt-5 pt-4 border-t border-border flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Change of mind? You can cancel your order before it ships.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={cancelMut.isPending && cancellingId === o.id}
                    onClick={() => {
                      if (confirm(`Are you sure you want to cancel order ${o.name}?`)) {
                        setCancellingId(o.id);
                        cancelMut.mutate(o.id);
                      }
                    }}
                  >
                    {cancelMut.isPending && cancellingId === o.id ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Cancelling…
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel Order
                      </>
                    )}
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
