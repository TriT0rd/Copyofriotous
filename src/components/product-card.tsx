import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import type { CatalogProduct } from "@/lib/catalog";
import { formatPrice } from "@/lib/catalog";
import { useFavorites } from "@/hooks/use-favorites";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { BrandName } from "@/components/brand-name";

export function ProductCard({ product }: { product: CatalogProduct }) {
  const p = product.node;
  const img = p.images.edges[0]?.node;
  const img2 = p.images.edges[1]?.node ?? img;
  const price = p.priceRange.minVariantPrice;
  const soldOut = p.variants.edges.every((v) => !v.node.availableForSale);

  const { user } = useAuth();
  const { isFavorite, toggle } = useFavorites();
  const liked = isFavorite(p.handle);

  const tag = p.tags.find((t) =>
    ["new", "trending", "best seller", "limited"].includes(t.toLowerCase()),
  );

  const onLike = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.error("Sign in to save favorites");
      return;
    }
    toggle({
      handle: p.handle,
      title: p.title,
      image: img?.url ?? null,
      price: Number(price.amount),
      currency: price.currencyCode,
    });
  };

  return (
    <Link to="/product/$handle" params={{ handle: p.handle }} className="group block">
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-secondary">
        {img && (
          <img
            src={img.url}
            alt={img.altText ?? p.title}
            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500 group-hover:opacity-0"
            loading="lazy"
          />
        )}
        {img2 && (
          <img
            src={img2.url}
            alt={img2.altText ?? p.title}
            className="absolute inset-0 h-full w-full scale-105 object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            loading="lazy"
          />
        )}
        {tag && (
          <span className="absolute left-4 top-4 rounded-full bg-background/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest backdrop-blur">
            {tag}
          </span>
        )}
        {soldOut && (
          <span className="absolute right-4 top-4 rounded-full bg-foreground px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-background">
            Sold out
          </span>
        )}
        <button
          type="button"
          onClick={onLike}
          suppressHydrationWarning
          className={`absolute ${soldOut ? "right-4 top-14" : "right-4 top-4"} flex h-9 w-9 items-center justify-center rounded-full bg-background/90 backdrop-blur transition-all hover:bg-background hover:scale-110`}
          aria-label={liked ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart
            className={`h-4 w-4 transition-colors ${liked ? "fill-brand-red text-brand-red" : "text-foreground"}`}
          />
        </button>
      </div>
      <div className="mt-4 flex items-start justify-between gap-4 px-1">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{p.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{p.productType || <BrandName />}</p>
        </div>
        <p className="whitespace-nowrap text-sm font-semibold">
          {formatPrice(price.amount, price.currencyCode)}
        </p>
      </div>
    </Link>
  );
}
