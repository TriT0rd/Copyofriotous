import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  adminListVariants,
  adminSetVariantInventory,
  type AdminVariant,
} from "@/lib/admin.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const [search, setSearch] = useState("");
  const [onlyAlerts, setOnlyAlerts] = useState(false);

  const variantsQ = useQuery({
    queryKey: ["admin", "variants"],
    queryFn: () => listFn(),
    refetchInterval: 20000,
  });

  const setStock = useMutation({
    mutationFn: (p: { variantId: string; quantity: number }) => setFn({ data: p }),
    onSuccess: () => {
      toast.success("Stock updated");
      qc.invalidateQueries({ queryKey: ["admin", "variants"] });
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = variantsQ.data ?? [];

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          {totals.units} units available across {all.length} size/colour variants · {totals.low} low
          · {totals.out} out of stock. Stock is reserved the moment an order is placed, deducted
          when it ships and restored if it is cancelled.
        </p>
      </div>

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
        <p className="text-muted-foreground">Loading inventory…</p>
      ) : groups.length === 0 ? (
        <p className="text-muted-foreground">Nothing to show.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.productId} className="rounded-xl border bg-card">
              <div className="flex items-center gap-3 border-b p-3">
                {g.image ? (
                  <img
                    src={g.image}
                    alt={g.name}
                    className="h-10 w-10 rounded bg-muted object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded bg-muted" />
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
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr className="border-b">
                      <th className="p-3">Size</th>
                      <th className="p-3">Color</th>
                      <th className="p-3">Stock</th>
                      <th className="p-3">Reserved</th>
                      <th className="p-3">Available</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Adjust</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.variants.map((v) => {
                      const st = stockState(v);
                      return (
                        <tr key={v.id} className="border-b last:border-0">
                          <td className="p-3 font-medium">{v.size || "—"}</td>
                          <td className="p-3">{v.color || "—"}</td>
                          <td className="p-3">{v.stock_quantity}</td>
                          <td className="p-3 text-muted-foreground">{v.reserved_stock}</td>
                          <td className="p-3 font-medium">{st.available}</td>
                          <td className="p-3">
                            <Badge variant={st.tone}>{st.label}</Badge>
                          </td>
                          <td className="p-3">
                            <VariantStockEditor
                              key={`${v.id}-${v.stock_quantity}`}
                              stock={v.stock_quantity}
                              saving={setStock.isPending}
                              onSave={(quantity) => setStock.mutate({ variantId: v.id, quantity })}
                            />
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
        className="h-8 w-20 px-2 text-xs"
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
        Save
      </Button>
    </div>
  );
}
