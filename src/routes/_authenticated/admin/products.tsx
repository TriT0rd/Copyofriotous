import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  adminListProducts,
  adminDeleteProduct,
  adminSetProductStatus,
  adminCreateProduct,
  adminUpdateProduct,
  type AdminProduct,
} from "@/lib/admin.functions";
import { ARCHIVED_TAG, ProductForm } from "@/components/admin/product-ui";
import { money } from "@/components/admin/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/products")({
  component: ProductsPage,
});

function ProductsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListProducts);
  const deleteFn = useServerFn(adminDeleteProduct);
  const statusFn = useServerFn(adminSetProductStatus);
  const createFn = useServerFn(adminCreateProduct);
  const updateFn = useServerFn(adminUpdateProduct);

  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "DRAFT">("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  const productsQ = useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => listFn(),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
    qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["product"] });
  };

  const del = useMutation({
    mutationFn: (productId: string) => deleteFn({ data: { productId } }),
    onSuccess: (res) => {
      toast.success(
        res?.archived
          ? "Product archived (it appears in past orders, so history is kept)"
          : "Product deleted",
      );
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: (p: { productId: string; status: "ACTIVE" | "DRAFT" }) => statusFn({ data: p }),
    onSuccess: () => {
      toast.success("Status updated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const products = productsQ.data ?? [];
  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category).filter(Boolean) as string[])).sort(),
    [products],
  );
  const visible = useMemo(
    () =>
      products.filter((p) => {
        if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
        if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
        if (categoryFilter !== "ALL" && (p.category ?? "") !== categoryFilter) return false;
        return true;
      }),
    [products, search, statusFilter, categoryFilter],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            {products.length} product(s) · {products.filter((p) => p.status === "ACTIVE").length}{" "}
            live
          </p>
        </div>
        {!creating && !editing && (
          <Button className="gap-2" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New product
          </Button>
        )}
      </div>

      {creating && (
        <ProductForm
          heading="New product"
          submitLabel="Create product"
          onCancel={() => setCreating(false)}
          onSubmit={async (values) => {
            await createFn({ data: { ...values, stock: Number(values.stock) || 0 } });
            toast.success("Product created");
            refresh();
            setCreating(false);
          }}
        />
      )}

      {editing && (
        <ProductForm
          heading={`Edit · ${editing.title}`}
          submitLabel="Save changes"
          initial={{
            title: editing.title,
            description: editing.description ?? "",
            price: editing.price,
            category: editing.category ?? "",
            images: editing.images,
            colors: editing.colors,
            sizes: editing.sizes,
            tags: editing.tags.filter((t) => t !== ARCHIVED_TAG),
            stock: String(editing.totalInventory),
            isActive: editing.status === "ACTIVE",
          }}
          onCancel={() => setEditing(null)}
          onSubmit={async (values) => {
            await updateFn({
              data: {
                ...values,
                stock: Number(values.stock) || 0,
                productId: editing.id,
              },
            });
            toast.success("Product updated");
            refresh();
            setEditing(null);
          }}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full sm:w-64"
        />
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="DRAFT">Draft</option>
        </select>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="ALL">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {productsQ.isLoading ? (
        <p className="text-muted-foreground">Loading products…</p>
      ) : productsQ.isError ? (
        <p className="text-destructive">
          {(productsQ.error as Error)?.message ?? "Could not load products"}
        </p>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground">No products match your filters.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-4 rounded-xl border bg-card p-4 lg:flex-row lg:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-4">
                {p.featuredImage ? (
                  <img
                    src={p.featuredImage}
                    alt={p.title}
                    className="h-16 w-16 rounded bg-muted object-cover"
                  />
                ) : (
                  <div className="h-16 w-16 rounded bg-muted" />
                )}
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {money(p.price)}
                    {p.category ? ` · ${p.category}` : ""} · Stock: {p.totalInventory}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.sizes.map((s) => (
                      <Badge key={`s-${s}`} variant="outline" className="text-[10px]">
                        {s}
                      </Badge>
                    ))}
                    {p.colors.map((c) => (
                      <Badge key={`c-${c}`} variant="secondary" className="text-[10px]">
                        {c}
                      </Badge>
                    ))}
                  </div>
                  <Link
                    to="/admin/inventory"
                    className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                  >
                    Manage size / colour stock →
                  </Link>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={p.status === "ACTIVE" ? "default" : "secondary"}>
                  {p.tags.includes(ARCHIVED_TAG) ? "ARCHIVED" : p.status}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => {
                    setCreating(false);
                    setEditing(p);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toggleStatus.mutate({
                      productId: p.id,
                      status: p.status === "ACTIVE" ? "DRAFT" : "ACTIVE",
                    })
                  }
                >
                  {p.status === "ACTIVE" ? "Unpublish" : "Publish"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (
                      confirm(
                        `Are you sure you want to delete "${p.title}"? This cannot be undone.`,
                      )
                    )
                      del.mutate(p.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
