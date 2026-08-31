import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, Loader2, ArrowRight } from "lucide-react";
import { useFavorites } from "@/hooks/use-favorites";
import { formatPrice } from "@/lib/catalog";

export const Route = createFileRoute("/_authenticated/account/favorites")({
  head: () => ({
    meta: [
      { title: "Favorites — RIOTOUS" },
      { name: "description", content: "Products you've saved on RIOTOUS." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const { favorites, loading, toggle } = useFavorites();
  const list = Array.isArray(favorites) ? favorites : [];

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-16 md:px-10 md:py-24">
      <div className="mb-10 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Account
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">Favorites</h1>
        </div>
        <Link
          to="/account/orders"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Orders →
        </Link>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && list.length === 0 && (
        <div className="rounded-2xl border border-border bg-secondary/40 py-20 text-center">
          <Heart className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-4 text-lg font-semibold">No favorites yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap the heart on any product to save it here.
          </p>
          <Link
            to="/shop"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90"
          >
            Browse shop <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {!loading && list.length > 0 && (
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
          {list.map((f) => (
            <div key={f.id} className="group relative">
              <Link to="/product/$handle" params={{ handle: f.product_handle }} className="block">
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-secondary">
                  {f.product_image && (
                    <img
                      src={f.product_image}
                      alt={f.product_title}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="mt-4 flex items-start justify-between gap-4 px-1">
                  <h3 className="truncate text-sm font-medium">{f.product_title}</h3>
                  {f.product_price != null && (
                    <p className="whitespace-nowrap text-sm font-semibold">
                      {formatPrice(String(f.product_price), f.product_currency ?? "INR")}
                    </p>
                  )}
                </div>
              </Link>
              <button
                onClick={() =>
                  toggle({
                    handle: f.product_handle,
                    title: f.product_title,
                    image: f.product_image,
                    price: f.product_price,
                    currency: f.product_currency,
                  })
                }
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/90 backdrop-blur hover:bg-background"
                aria-label="Remove from favorites"
              >
                <Heart className="h-4 w-4 fill-brand-red text-brand-red" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
