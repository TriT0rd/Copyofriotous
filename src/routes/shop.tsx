import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import { EmptyProducts } from "@/components/empty-products";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const productsQuery = {
  queryKey: ["products", "shop"],
  queryFn: () => fetchProducts(50),
};

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop — RIOTOUS" },
      {
        name: "description",
        content:
          "Browse the full RIOTOUS collection. DTF printed tees, oversized fits, and limited drops.",
      },
      { property: "og:title", content: "Shop — RIOTOUS" },
      {
        property: "og:description",
        content: "Browse the full RIOTOUS collection.",
      },
      { property: "og:url", content: "/shop" },
    ],
    links: [{ rel: "canonical", href: "/shop" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(productsQuery),
  component: ShopPage,
});

function ShopPage() {
  const { data: products } = useSuspenseQuery(productsQuery);
  const [sort, setSort] = useState("featured");
  const [size, setSize] = useState<string>("all");

  const sizes = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => {
      p.node.options.forEach((o) => {
        if (o.name.toLowerCase() === "size") o.values.forEach((v) => s.add(v));
      });
    });
    return Array.from(s);
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (size !== "all") {
      list = list.filter((p) =>
        p.node.options.some(
          (o) =>
            o.name.toLowerCase() === "size" &&
            o.values.map((v) => v.toLowerCase()).includes(size.toLowerCase()),
        ),
      );
    }
    const arr = [...list];
    if (sort === "price-asc") {
      arr.sort(
        (a, b) =>
          parseFloat(a.node.priceRange.minVariantPrice.amount) -
          parseFloat(b.node.priceRange.minVariantPrice.amount),
      );
    } else if (sort === "price-desc") {
      arr.sort(
        (a, b) =>
          parseFloat(b.node.priceRange.minVariantPrice.amount) -
          parseFloat(a.node.priceRange.minVariantPrice.amount),
      );
    } else if (sort === "title") {
      arr.sort((a, b) => a.node.title.localeCompare(b.node.title));
    }
    return arr;
  }, [products, sort, size]);

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-16 md:px-10 md:py-24">
      <div className="mb-12 max-w-3xl">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
          Shop
        </p>
        <h1 className="text-5xl font-semibold tracking-tight md:text-7xl">The full collection.</h1>
      </div>

      {products.length > 0 && (
        <div className="sticky top-16 z-30 -mx-6 mb-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/80 px-6 py-4 backdrop-blur-xl md:top-20 md:-mx-10 md:px-10">
          <p className="text-sm text-muted-foreground">
            {filtered.length} product{filtered.length !== 1 && "s"}
          </p>
          <div className="flex items-center gap-2">
            {sizes.length > 0 && (
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger className="h-10 w-[130px] rounded-full border-border">
                  <SelectValue placeholder="Size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sizes</SelectItem>
                  {sizes.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="h-10 w-[160px] rounded-full border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="featured">Featured</SelectItem>
                <SelectItem value="title">A → Z</SelectItem>
                <SelectItem value="price-asc">Price: Low to High</SelectItem>
                <SelectItem value="price-desc">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyProducts />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4">
          {filtered.map((p) => (
            <ProductCard key={p.node.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
