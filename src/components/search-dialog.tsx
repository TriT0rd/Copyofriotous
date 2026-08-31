import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, X, ArrowRight, Sparkles, ShoppingBag } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { fetchProducts, type ShopifyProduct } from "@/lib/catalog";
import { money } from "@/components/admin/format";

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const POPULAR_SEARCHES = ["Oversized", "Graphic Tee", "Acid Wash", "Hoodie", "Vintage", "Black"];

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { data: products = [] } = useQuery({
    queryKey: ["products", "search-dialog"],
    queryFn: () => fetchProducts(50),
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [open]);

  const trimmedQuery = query.trim().toLowerCase();

  const filteredProducts = useMemo(() => {
    if (!trimmedQuery) return [];
    return products
      .filter((p: ShopifyProduct) => {
        const title = p.node.title.toLowerCase();
        const desc = (p.node.description || "").toLowerCase();
        const tags = (p.node.tags || []).join(" ").toLowerCase();
        const handle = p.node.handle.toLowerCase();
        return (
          title.includes(trimmedQuery) ||
          desc.includes(trimmedQuery) ||
          tags.includes(trimmedQuery) ||
          handle.includes(trimmedQuery)
        );
      })
      .slice(0, 6);
  }, [products, trimmedQuery]);

  const handleSelectProduct = (handle: string) => {
    onOpenChange(false);
    navigate({ to: "/product/$handle", params: { handle } });
  };

  const handleSearchAll = (termToSearch = query) => {
    if (!termToSearch.trim()) return;
    onOpenChange(false);
    navigate({
      to: "/shop",
      search: { q: termToSearch.trim() },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden p-0 border-border bg-background shadow-2xl rounded-2xl">
        <DialogTitle className="sr-only">Search Products</DialogTitle>

        {/* Search Header / Input Bar */}
        <div className="relative flex items-center border-b border-border px-4 py-3.5 bg-card/50">
          <Search className="h-5 w-5 text-muted-foreground mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (filteredProducts.length === 1) {
                  handleSelectProduct(filteredProducts[0].node.handle);
                } else {
                  handleSearchAll();
                }
              }
            }}
            placeholder="Search hoodies, oversized tees, drops…"
            className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground text-foreground"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              ESC
            </kbd>
          )}
        </div>

        {/* Results / Popular suggestions area */}
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4">
          {trimmedQuery.length > 0 ? (
            <div>
              <div className="flex items-center justify-between px-2 pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Products ({filteredProducts.length})
                </span>
                {filteredProducts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleSearchAll()}
                    className="text-xs font-medium text-brand-red hover:underline flex items-center gap-1"
                  >
                    View in shop <ArrowRight className="h-3 w-3" />
                  </button>
                )}
              </div>

              {filteredProducts.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Search className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-base font-semibold">No products found for "{query}"</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try checking your spelling or search for another term like "tee" or "oversized".
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSearchAll()}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-red px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    Browse Full Collection <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="grid gap-2">
                  {filteredProducts.map((p) => {
                    const img = p.node.featuredImage?.url;
                    const price = parseFloat(p.node.priceRange.minVariantPrice.amount);
                    return (
                      <button
                        key={p.node.id}
                        type="button"
                        onClick={() => handleSelectProduct(p.node.handle)}
                        className="group flex items-center gap-3.5 rounded-xl p-2.5 text-left transition-all hover:bg-secondary/70 focus:bg-secondary/70 focus:outline-none"
                      >
                        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted border border-border/50">
                          {img ? (
                            <img
                              src={img}
                              alt={p.node.featuredImage?.altText || p.node.title}
                              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <ShoppingBag className="h-5 w-5" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate text-foreground group-hover:text-brand-red transition-colors">
                            {p.node.title}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {p.node.description || "RIOTOUS Streetwear"}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-foreground">{money(price)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div>
                <div className="flex items-center gap-1.5 px-2 pb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-brand-red" />
                  Popular Searches
                </div>
                <div className="flex flex-wrap gap-2 px-2">
                  {POPULAR_SEARCHES.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => {
                        setQuery(term);
                        handleSearchAll(term);
                      }}
                      className="rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-xs font-medium text-foreground transition-all hover:border-brand-red hover:bg-brand-red/10 hover:text-brand-red"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>

              {products.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <span className="block px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Featured Drops
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {products.slice(0, 3).map((p) => {
                      const img = p.node.featuredImage?.url;
                      const price = parseFloat(p.node.priceRange.minVariantPrice.amount);
                      return (
                        <button
                          key={p.node.id}
                          type="button"
                          onClick={() => handleSelectProduct(p.node.handle)}
                          className="group flex flex-col rounded-xl border border-border/60 bg-card p-2 text-left transition-all hover:border-brand-red/40 hover:shadow-md focus:outline-none"
                        >
                          <div className="aspect-square w-full overflow-hidden rounded-lg bg-muted mb-2">
                            {img && (
                              <img
                                src={img}
                                alt={p.node.title}
                                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            )}
                          </div>
                          <p className="text-xs font-semibold truncate text-foreground">
                            {p.node.title}
                          </p>
                          <p className="text-xs font-bold text-brand-red mt-0.5">{money(price)}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search Footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            Press <kbd className="font-mono font-semibold text-foreground">Enter</kbd> to search
          </span>
          <button
            type="button"
            onClick={() => handleSearchAll()}
            className="font-medium text-brand-red hover:underline flex items-center gap-1"
          >
            Explore all items <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
