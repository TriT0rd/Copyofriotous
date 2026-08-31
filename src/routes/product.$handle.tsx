import { createFileRoute, notFound, Link, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Minus,
  Plus,
  ArrowUpRight,
  Loader2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { fetchProductByHandle } from "@/lib/catalog";
import { formatPrice } from "@/lib/catalog";
import { useCartStore } from "@/stores/cart-store";
import { toast } from "sonner";
import { BrandName } from "@/components/brand-name";
import { ProductReviews } from "@/components/reviews/product-reviews";

const productQuery = (handle: string) => ({
  queryKey: ["product", handle],
  queryFn: async () => {
    const p = await fetchProductByHandle(handle);
    if (!p) throw notFound();
    return p;
  },
});

export const Route = createFileRoute("/product/$handle")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(productQuery(params.handle)),
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Product not found — RIOTOUS" }, { name: "robots", content: "noindex" }],
      };
    }
    const p = loaderData;
    const img = p.images.edges[0]?.node.url;
    return {
      meta: [
        { title: `${p.title} — RIOTOUS` },
        {
          name: "description",
          content: p.description?.slice(0, 155) || `${p.title} by RIOTOUS.`,
        },
        { property: "og:title", content: `${p.title} — RIOTOUS` },
        {
          property: "og:description",
          content: p.description?.slice(0, 155) || `${p.title} by RIOTOUS.`,
        },
        { property: "og:type", content: "product" },
        { property: "og:url", content: `/product/${p.handle}` },
        ...(img
          ? ([
              { property: "og:image", content: img },
              { name: "twitter:image", content: img },
            ] as const)
          : []),
      ],
      links: [{ rel: "canonical", href: `/product/${p.handle}` }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: p.title,
            description: p.description || `${p.title} by RIOTOUS.`,
            image: p.images.edges.map((e) => e.node.url),
            brand: { "@type": "Brand", name: "RIOTOUS" },
            url: `https://riotous.store/product/${p.handle}`,
            offers: p.variants.edges.map((v) => ({
              "@type": "Offer",
              name: v.node.title,
              price: v.node.price.amount,
              priceCurrency: v.node.price.currencyCode,
              url: `https://riotous.store/product/${p.handle}`,
              availability: v.node.availableForSale
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
            })),
          }),
        },
      ],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const { handle } = Route.useParams();
  const { data: p } = useSuspenseQuery(productQuery(handle));

  const variants = p.variants.edges.map((v) => v.node);
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const inStock = variants.find((v) => v.available > 0) ?? variants[0];
    const opts = inStock?.selectedOptions ?? [];
    return Object.fromEntries(opts.map((o) => [o.name, o.value]));
  });
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const currentVariant = useMemo(() => {
    return (
      variants.find((v) => v.selectedOptions.every((o) => selected[o.name] === o.value)) ??
      variants[0]
    );
  }, [variants, selected]);

  /** Units still buyable for the picked size/colour. */
  const available = currentVariant?.available ?? 0;
  const maxQty = Math.max(1, Math.min(10, available || 1));

  useEffect(() => {
    setQty((q) => Math.min(q, Math.max(1, available || 1)));
  }, [available]);

  /** Is any variant with this option value still in stock? */
  const optionAvailable = (name: string, value: string) =>
    variants.some(
      (v) =>
        v.selectedOptions.some((o) => o.name === name && o.value === value) &&
        v.selectedOptions.every((o) => o.name === name || selected[o.name] === o.value) &&
        v.available > 0,
    );

  const addItem = useCartStore((s) => s.addItem);
  const isLoading = useCartStore((s) => s.isLoading);
  const [justAdded, setJustAdded] = useState(false);

  const handleAdd = async () => {
    if (!currentVariant) return;
    await addItem({
      variantId: currentVariant.id,
      productId: p.productId,
      productHandle: p.handle,
      productTitle: p.title,
      variantTitle: currentVariant.title,
      imageUrl: currentVariant.image?.url ?? p.images.edges[0]?.node.url ?? null,
      price: currentVariant.price,
      quantity: qty,
      selectedOptions: currentVariant.selectedOptions,
    });
    setJustAdded(true);
    toast.success("Added to bag");
    setTimeout(() => setJustAdded(false), 1500);
  };

  const images = p.images.edges;

  const router = useRouter();

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-10 md:px-10 md:py-16">
      <div className="grid gap-8 md:grid-cols-2 md:gap-16">
        {/* Gallery */}
        <div className="flex flex-col gap-4">
          <button
            onClick={() => router.history.back()}
            className="flex h-10 w-10 items-center justify-center self-start rounded-full hover:bg-secondary"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-secondary">
            {images[activeImage] && (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="group block h-full w-full cursor-zoom-in"
                aria-label="Open full-size image"
              >
                <img
                  src={images[activeImage].node.url}
                  alt={images[activeImage].node.altText ?? p.title}
                  className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.02]"
                />
              </button>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  aria-label={`Show image ${i + 1} of ${images.length}`}
                  className={`h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl border-2 transition-colors ${
                    activeImage === i ? "border-foreground" : "border-transparent"
                  }`}
                >
                  <img src={img.node.url} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="md:sticky md:top-24 md:self-start">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
            {p.productType || <BrandName />}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">{p.title}</h1>
          <p className="mt-4 text-2xl font-semibold">
            {formatPrice(
              currentVariant?.price.amount ?? p.priceRange.minVariantPrice.amount,
              currentVariant?.price.currencyCode ?? p.priceRange.minVariantPrice.currencyCode,
            )}
          </p>

          {/* Options */}
          <div className="mt-8 space-y-6">
            {p.options.map((opt) =>
              opt.values.length > 1 || opt.name.toLowerCase() !== "title" ? (
                <div key={opt.name}>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-medium">{opt.name}</span>
                    <span className="text-xs text-muted-foreground">{selected[opt.name]}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {opt.values.map((v) => {
                      const active = selected[opt.name] === v;
                      const inStock = optionAvailable(opt.name, v);
                      return (
                        <button
                          key={v}
                          disabled={!inStock}
                          title={inStock ? undefined : "Out of stock"}
                          onClick={() => setSelected((s) => ({ ...s, [opt.name]: v }))}
                          className={`min-w-12 rounded-full border px-4 py-2.5 text-sm transition-colors ${
                            active
                              ? "border-foreground bg-foreground text-background"
                              : "border-border hover:border-foreground"
                          } ${
                            inStock
                              ? ""
                              : "cursor-not-allowed line-through opacity-40 hover:border-border"
                          }`}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null,
            )}

            {/* Quantity */}
            <div>
              <span className="mb-3 block text-sm font-medium">Quantity</span>
              <div className="inline-flex items-center gap-4 rounded-full border border-border px-2 py-1">
                <button
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  aria-label="Decrease quantity"
                  className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-4 text-center text-sm">{qty}</span>
                <button
                  onClick={() => setQty(Math.min(maxQty, qty + 1))}
                  disabled={qty >= maxQty}
                  aria-label="Increase quantity"
                  className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {available <= 0
                  ? "Out of stock in this size/colour"
                  : available <= 5
                    ? `Only ${available} left in ${currentVariant?.title ?? "this option"}`
                    : `In stock · ${available} available`}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 space-y-3">
            <button
              onClick={handleAdd}
              disabled={isLoading || !currentVariant?.availableForSale}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : justAdded ? (
                <>
                  <Check className="h-4 w-4" /> Added
                </>
              ) : currentVariant?.availableForSale ? (
                "Add to Bag"
              ) : (
                "Sold out"
              )}
            </button>
            <Link
              to="/design"
              className="flex h-14 w-full items-center justify-center gap-2 rounded-full border border-border text-sm font-medium hover:bg-secondary"
            >
              Design Your Own <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Description */}
          {p.description && (
            <div className="mt-10 border-t border-border pt-8">
              <h2 className="text-sm font-semibold uppercase tracking-widest">Details</h2>
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {p.description}
              </p>
            </div>
          )}

          <div className="mt-8 grid grid-cols-2 gap-4 text-xs text-muted-foreground">
            <div>
              <p className="font-semibold text-foreground">Free shipping</p>
              <p>Orders over ₹1499</p>
            </div>
            <div>
              <p className="font-semibold text-foreground">7-day returns</p>
              <p>No questions asked</p>
            </div>
            <div className="col-span-2">
              <p className="font-semibold text-foreground">Estimated delivery</p>
              <p>5-7 business days</p>
            </div>
          </div>
        </div>
      </div>

      <ProductReviews productId={p.productId} productTitle={p.title} />

      {lightboxOpen && images[activeImage] && (
        <Lightbox
          images={images.map((e) => ({ url: e.node.url, alt: e.node.altText ?? p.title }))}
          index={activeImage}
          onIndex={setActiveImage}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}

function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: { url: string; alt: string }[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);

  const prev = () => {
    resetZoom();
    onIndex((index - 1 + images.length) % images.length);
  };
  const next = () => {
    resetZoom();
    onIndex((index + 1) % images.length);
  };

  const resetZoom = () => {
    setZoomed(false);
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const toggleZoom = () => {
    if (zoomed) {
      resetZoom();
    } else {
      setZoomed(true);
      setScale(2.5);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!zoomed) return;
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !zoomed) return;
    setPosition({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };

  const handleMouseUp = () => setDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    if (!zoomed) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.25 : 0.25;
    setScale((s) => {
      const next = Math.min(4, Math.max(1, s + delta));
      if (next <= 1) resetZoom();
      return next;
    });
  };

  useEffect(() => {
    resetZoom();
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (!zoomed) {
        if (e.key === "ArrowLeft") prev();
        if (e.key === "ArrowRight") next();
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [index, images.length, zoomed, onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm"
      onClick={() => {
        if (!zoomed) onClose();
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      {images.length > 1 && !zoomed && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            aria-label="Previous"
            className="absolute left-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 md:left-8"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label="Next"
            className="absolute right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 md:right-8"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      <div
        className={`relative flex h-full w-full items-center justify-center ${zoomed ? "cursor-move" : "cursor-zoom-in"}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          ref={imageRef}
          src={images[index].url}
          alt={images[index].alt}
          draggable={false}
          onClick={(e) => {
            e.stopPropagation();
            toggleZoom();
          }}
          className="max-h-[92vh] max-w-[92vw] object-contain transition-transform duration-300 ease-out"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: "center center",
          }}
        />
      </div>

      {images.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-xs text-white/80">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
