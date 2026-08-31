import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { fetchProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import { EmptyProducts } from "@/components/empty-products";
import { Search, X } from "lucide-react";
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

type ShopSearch = {
  q?: string;
  size?: string;
  sort?: string;
};

export const Route = createFileRoute("/shop")({
  validateSearch: (search: Record<string, unknown>): ShopSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
    size: typeof search.size === "string" ? search.size : undefined,
    sort: typeof search.sort === "string" ? search.sort : undefined,
  }),
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
  const searchParams = Route.useSearch();
  const navigate = useNavigate({ from: "/shop" });

  const [sort, setSort] = useState(searchParams.sort || "featured");
  const [size, setSize] = useState<string>(searchParams.size || "all");
  const [q, setQ] = useState(searchParams.q || "");

  useEffect(() => {
    setQ(searchParams.q || "");
  }, [searchParams.q]);

  const sizes = useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => {
      p.node.options.forEach((o) => {
        if (o.name.toLowerCase() === "size") o.values.forEach((v) => s.add(v));
      });
    });
    return Array.from(s);
  }, [products]);

  const handleQueryChange = (val: string) => {
    setQ(val);
    navigate({
      search: (prev) => ({
        ...prev,
        q: val.trim() ? val.trim() : undefined,
      }),
      replace: true,
    });
  };

  const filtered = useMemo(() => {
    let list = products;

    if (q.trim()) {
      const term = q.trim().toLowerCase();
      list = list.filter((p) => {
        const title = p.node.title.toLowerCase();
        const desc = (p.node.description || "").toLowerCase();
        const tags = (p.node.tags || []).join(" ").toLowerCase();
        const handle = p.node.handle.toLowerCase();
        return (
          title.includes(term) ||
          desc.includes(term) ||
          tags.includes(term) ||
          handle.includes(term)
        );
      });
    }

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
  }, [products, sort, size, q]);

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-16 md:px-10 md:py-24">
      <div className="mb-12 max-w-3xl">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
          Shop
        </p>
        <h1 className="text-5xl font-semibold tracking-tight md:text-7xl">
          {q.trim() ? `Search: "${q.trim()}"` : "The full collection."}
        </h1>
        {q.trim() && (
          <p className="mt-2 text-sm text-muted-foreground">
            Showing results for "{q.trim()}".{" "}
            <button
              type="button"
              onClick={() => handleQueryChange("")}
              className="text-brand-red underline hover:opacity-80"
            >
              Clear filter
            </button>
          </p>
        )}
      </div>

      {products.length > 0 && (
        <div className="sticky top-16 z-30 -mx-6 mb-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/80 px-6 py-4 backdrop-blur-xl md:top-20 md:-mx-10 md:px-10">
          <div className="flex items-center gap-3 flex-1 min-w-[240px] max-w-md">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={q}
                onChange={(e) => handleQueryChange(e.target.value)}
                placeholder="Search products by keyword…"
                className="h-10 w-full rounded-full border border-border bg-card/60 pl-9 pr-8 text-sm outline-none transition-colors focus:border-brand-red focus:bg-background"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => handleQueryChange("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">
              {filtered.length} item{filtered.length !== 1 && "s"}
            </p>
          </div>

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
        q.trim() ? (
          <div className="mx-auto max-w-md py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold">No matching products found</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We couldn't find any products matching "{q}". Try searching for something else or
              clearing the search filter.
            </p>
            <button
              type="button"
              onClick={() => handleQueryChange("")}
              className="mt-6 inline-flex items-center rounded-full bg-brand-red px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Clear Search & View All
            </button>
          </div>
        ) : (
          <EmptyProducts />
        )
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
