import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  adminListVariants,
  adminSetVariantInventory,
  adminAddVariantInventory,
  adminRemoveVariantInventory,
  adminListInventoryTransactions,
  type AdminVariant,
  type InventoryTransactionRecord,
} from "@/lib/admin.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  History,
  Plus,
  Minus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Package,
  Layers,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/inventory")({
  component: InventoryPage,
});

type Group = {
  productId: string;
  name: string;
  image: string | null;
  isActive: boolean;
  variants: AdminVariant[];
};

function stockState(v: AdminVariant) {
  const available = Math.max(0, v.stock_quantity - v.reserved_stock);
  if (available <= 0) return { label: "Out of Stock", tone: "destructive" as const, available };
  if (available <= v.low_stock_threshold)
    return { label: "Low Stock", tone: "secondary" as const, available };
  return { label: "In Stock", tone: "default" as const, available };
}

function InventoryPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListVariants);
  const setFn = useServerFn(adminSetVariantInventory);
  const addFn = useServerFn(adminAddVariantInventory);
  const removeFn = useServerFn(adminRemoveVariantInventory);
  const listTxFn = useServerFn(adminListInventoryTransactions);

  const [search, setSearch] = useState("");
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedVariantForHistory, setSelectedVariantForHistory] = useState<string | null>(null);

  // Quick adjust modal state
  const [adjustModal, setAdjustModal] = useState<{
    variant: AdminVariant;
    mode: "add" | "remove" | "set";
  } | null>(null);
  const [adjustQty, setAdjustQty] = useState<string>("1");
  const [adjustReason, setAdjustReason] = useState<string>("");

  const variantsQ = useQuery({
    queryKey: ["admin", "variants"],
    queryFn: () => listFn(),
    refetchInterval: 20000,
  });

  const txQ = useQuery({
    queryKey: ["admin", "inventory-tx", selectedVariantForHistory],
    queryFn: () =>
      listTxFn({ data: { variantId: selectedVariantForHistory || undefined, limit: 100 } }),
    enabled: showHistory,
    refetchInterval: showHistory ? 15000 : false,
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["admin", "variants"] });
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
    qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    qc.invalidateQueries({ queryKey: ["admin", "inventory-tx"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["product"] });
  };

  const setStock = useMutation({
    mutationFn: (p: { variantId: string; quantity: number; reason?: string }) => setFn({ data: p }),
    onSuccess: () => {
      toast.success("Stock updated");
      refreshAll();
      setAdjustModal(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addStock = useMutation({
    mutationFn: (p: { variantId: string; quantity: number; reason?: string }) => addFn({ data: p }),
    onSuccess: () => {
      toast.success("Stock added successfully");
      refreshAll();
      setAdjustModal(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeStock = useMutation({
    mutationFn: (p: { variantId: string; quantity: number; reason?: string }) =>
      removeFn({ data: p }),
    onSuccess: () => {
      toast.success("Stock removed successfully");
      refreshAll();
      setAdjustModal(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = useMemo(
    () => (Array.isArray(variantsQ.data) ? variantsQ.data : []),
    [variantsQ.data],
  );

  const groups = useMemo<Group[]>(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, Group>();
    for (const v of all) {
      const st = stockState(v);
      if (onlyAlerts && st.label === "In Stock") continue;
      if (q && !`${v.product_name} ${v.size} ${v.color}`.toLowerCase().includes(q)) continue;
      let g = map.get(v.product_id);
      if (!g) {
        g = {
          productId: v.product_id,
          name: v.product_name,
          image: v.product_image,
          isActive: v.is_active,
          variants: [],
        };
        map.set(v.product_id, g);
      }
      g.variants.push(v);
    }
    return [...map.values()];
  }, [all, search, onlyAlerts]);

  const totals = useMemo(() => {
    let units = 0;
    let low = 0;
    let out = 0;
    for (const v of all) {
      const st = stockState(v);
      units += st.available;
      if (st.label === "Low Stock") low++;
      if (st.label === "Out of Stock") out++;
    }
    return { units, low, out };
  }, [all]);

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModal) return;
    const q = parseInt(adjustQty, 10);
    if (
      !Number.isFinite(q) ||
      (adjustModal.mode !== "set" && q <= 0) ||
      (adjustModal.mode === "set" && q < 0)
    ) {
      toast.error("Please enter a valid positive quantity");
      return;
    }

    if (adjustModal.mode === "add") {
      addStock.mutate({
        variantId: adjustModal.variant.id,
        quantity: q,
        reason: adjustReason.trim() || undefined,
      });
    } else if (adjustModal.mode === "remove") {
      removeStock.mutate({
        variantId: adjustModal.variant.id,
        quantity: q,
        reason: adjustReason.trim() || undefined,
      });
    } else {
      setStock.mutate({
        variantId: adjustModal.variant.id,
        quantity: q,
        reason: adjustReason.trim() || undefined,
      });
    }
  };

  const isAdjusting = setStock.isPending || addStock.isPending || removeStock.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            {totals.units} units available across {all.length} variants · {totals.low} low ·{" "}
            {totals.out} out of stock. Atomic deduction on orders, idempotent returns &amp;
            cancellations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showHistory ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setShowHistory(!showHistory);
              if (showHistory) setSelectedVariantForHistory(null);
            }}
            className="gap-1.5"
          >
            <History className="h-4 w-4" />
            {showHistory ? "Hide Audit History" : "Audit History"}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refreshAll()}
            title="Refresh inventory"
            className="h-9 w-9"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showHistory && (
        <div className="rounded-xl border bg-card p-5 space-y-4 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Inventory Movement History</h2>
              {selectedVariantForHistory && (
                <Badge variant="outline" className="text-xs">
                  Filtered by Variant
                </Badge>
              )}
            </div>
            {selectedVariantForHistory && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedVariantForHistory(null)}
                className="text-xs h-7"
              >
                Clear Filter (View All)
              </Button>
            )}
          </div>

          {txQ.isLoading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : !txQ.data || txQ.data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No inventory transactions recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="text-left uppercase text-muted-foreground border-b sticky top-0 bg-card">
                  <tr>
                    <th className="p-2.5">Time</th>
                    <th className="p-2.5">Product &amp; Variant</th>
                    <th className="p-2.5">Type</th>
                    <th className="p-2.5">Change</th>
                    <th className="p-2.5">Stock Level</th>
                    <th className="p-2.5">Reason / Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {txQ.data.map((tx: InventoryTransactionRecord) => {
                    const isPositive = tx.quantity_change > 0;
                    return (
                      <tr key={tx.id} className="hover:bg-muted/40 transition-colors">
                        <td className="p-2.5 whitespace-nowrap text-muted-foreground">
                          {new Date(tx.created_at).toLocaleString("en-IN", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="p-2.5 font-medium">
                          {tx.product_name || "Product"}
                          {tx.variant_details && (
                            <span className="ml-1 text-muted-foreground">
                              ({tx.variant_details})
                            </span>
                          )}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase font-medium ${
                              tx.transaction_type === "ORDER_DEDUCTION"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                : tx.transaction_type === "ORDER_CANCELLATION" ||
                                    tx.transaction_type === "ORDER_RETURN"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : tx.transaction_type === "ADMIN_ADD"
                                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                    : tx.transaction_type === "ADMIN_REMOVE"
                                      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                      : "bg-secondary text-foreground"
                            }`}
                          >
                            {tx.transaction_type.replace("_", " ")}
                          </span>
                        </td>
                        <td className="p-2.5 whitespace-nowrap font-mono font-semibold">
                          <span
                            className={`inline-flex items-center ${
                              isPositive
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400"
                            }`}
                          >
                            {isPositive ? (
                              <TrendingUp className="h-3 w-3 mr-0.5" />
                            ) : (
                              <TrendingDown className="h-3 w-3 mr-0.5" />
                            )}
                            {isPositive ? `+${tx.quantity_change}` : tx.quantity_change}
                          </span>
                        </td>
                        <td className="p-2.5 whitespace-nowrap text-muted-foreground font-mono">
                          {tx.previous_quantity} →{" "}
                          <strong className="text-foreground">{tx.new_quantity}</strong>
                        </td>
                        <td className="p-2.5 truncate max-w-xs text-muted-foreground">
                          {tx.reason || (tx.order_id ? `Order ${tx.order_id}` : "—")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search product, size or colour…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full sm:w-72"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyAlerts}
            onChange={(e) => setOnlyAlerts(e.target.checked)}
          />
          Only show low / out of stock
        </label>
      </div>

      {variantsQ.isLoading ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card overflow-hidden shadow-xs">
              <div className="flex items-center justify-between border-b p-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-md" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-40 rounded" />
                    <Skeleton className="h-3 w-24 rounded" />
                  </div>
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="p-3 space-y-2">
                {[1, 2, 3].map((j) => (
                  <div
                    key={j}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-12 rounded" />
                      <Skeleton className="h-4 w-16 rounded" />
                    </div>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-4 w-20 rounded" />
                      <Skeleton className="h-8 w-24 rounded-md" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
          <Package className="mx-auto h-8 w-8 mb-2 opacity-50" />
          <p>No inventory items match your search.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.productId} className="rounded-xl border bg-card overflow-hidden shadow-xs">
              <div className="flex items-center gap-3 border-b p-3 bg-muted/20">
                {g.image ? (
                  <img
                    src={g.image}
                    alt={g.name}
                    className="h-10 w-10 rounded bg-muted object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                    <Layers className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate font-medium">{g.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {g.variants.length} variant(s)
                  </div>
                </div>
                <Badge variant={g.isActive ? "default" : "secondary"} className="ml-auto">
                  {g.isActive ? "ACTIVE" : "DRAFT"}
                </Badge>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground border-b bg-muted/10">
                    <tr>
                      <th className="p-3">Size</th>
                      <th className="p-3">Color</th>
                      <th className="p-3">Stock Quantity</th>
                      <th className="p-3">Reserved</th>
                      <th className="p-3">Available</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Actions &amp; Adjust</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.variants.map((v) => {
                      const st = stockState(v);
                      return (
                        <tr key={v.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="p-3 font-medium">{v.size || "—"}</td>
                          <td className="p-3">{v.color || "—"}</td>
                          <td className="p-3 font-mono font-semibold">{v.stock_quantity}</td>
                          <td className="p-3 font-mono text-muted-foreground">
                            {v.reserved_stock}
                          </td>
                          <td className="p-3 font-mono font-bold text-foreground">
                            {st.available}
                          </td>
                          <td className="p-3">
                            <Badge variant={st.tone}>{st.label}</Badge>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <VariantStockEditor
                                key={`${v.id}-${v.stock_quantity}`}
                                stock={v.stock_quantity}
                                saving={setStock.isPending}
                                onSave={(quantity) =>
                                  setStock.mutate({ variantId: v.id, quantity })
                                }
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 text-xs gap-1 text-emerald-600 hover:text-emerald-700"
                                onClick={() => {
                                  setAdjustModal({ variant: v, mode: "add" });
                                  setAdjustQty("5");
                                  setAdjustReason("");
                                }}
                                title="Add stock"
                              >
                                <Plus className="h-3 w-3" />
                                Add
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 px-2 text-xs gap-1 text-rose-600 hover:text-rose-700"
                                onClick={() => {
                                  setAdjustModal({ variant: v, mode: "remove" });
                                  setAdjustQty("1");
                                  setAdjustReason("");
                                }}
                                title="Remove stock"
                              >
                                <Minus className="h-3 w-3" />
                                Remove
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2 text-xs text-muted-foreground"
                                onClick={() => {
                                  setSelectedVariantForHistory(v.id);
                                  setShowHistory(true);
                                }}
                                title="View history for this variant"
                              >
                                <History className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Adjust Stock Modal */}
      {adjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">
                {adjustModal.mode === "add"
                  ? "Add Stock"
                  : adjustModal.mode === "remove"
                    ? "Remove Stock"
                    : "Set Exact Stock"}
              </h3>
              <Badge variant="outline">
                {[adjustModal.variant.size, adjustModal.variant.color]
                  .filter(Boolean)
                  .join(" / ") || "Variant"}
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground">
              Product:{" "}
              <span className="font-medium text-foreground">
                {adjustModal.variant.product_name}
              </span>{" "}
              · Current stock:{" "}
              <span className="font-medium text-foreground">
                {adjustModal.variant.stock_quantity} units
              </span>
            </p>

            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {adjustModal.mode === "set" ? "New Total Stock" : "Quantity"}
                </label>
                <Input
                  type="number"
                  min={adjustModal.mode === "set" ? 0 : 1}
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  placeholder="Enter quantity"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Reason / Memo (Optional)
                </label>
                <Input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Restocked shipment, Damaged item, Audit check"
                  maxLength={120}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAdjustModal(null)}
                  disabled={isAdjusting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isAdjusting}
                  variant={adjustModal.mode === "remove" ? "destructive" : "default"}
                >
                  {isAdjusting ? "Updating…" : "Confirm Update"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function VariantStockEditor({
  stock,
  onSave,
  saving,
}: {
  stock: number;
  onSave: (quantity: number) => void;
  saving: boolean;
}) {
  const [val, setVal] = useState(String(stock));
  const dirty = val !== String(stock);
  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        min={0}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="h-8 w-20 px-2 text-xs font-mono"
        aria-label="Stock quantity"
      />
      <Button
        type="button"
        size="sm"
        variant={dirty ? "default" : "ghost"}
        disabled={!dirty || saving}
        onClick={() => {
          const q = parseInt(val, 10);
          if (Number.isFinite(q) && q >= 0) onSave(q);
        }}
        className="h-8 px-2 text-xs"
      >
        Set
      </Button>
    </div>
  );
}
