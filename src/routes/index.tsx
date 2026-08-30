import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandName } from "@/components/brand-name";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowUpRight, Sparkles, Truck, RotateCcw, MapPin, Package } from "lucide-react";
import { fetchProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/product-card";
import { EmptyProducts } from "@/components/empty-products";
import heroVideo from "@/assets/riotus-hero.mp4";

const productsQuery = {
  queryKey: ["products", "home"],
  queryFn: () => fetchProducts(8),
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RIOTOUS — We Don't Follow Trends. We Print Them." },
      {
        name: "description",
        content:
          "Premium DTF printed streetwear made in India. Custom apparel for creators, dreamers, and streetwear lovers.",
      },
      { property: "og:title", content: "RIOTOUS — Premium DTF Streetwear" },
      {
        property: "og:description",
        content: "Premium DTF printed streetwear made in India. Custom apparel for creators.",
      },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://riotous.store/#organization",
              name: "RIOTOUS",
              url: "https://riotous.store",
              logo: "https://riotous.store/favicon.ico",
              description: "Premium DTF printed streetwear made in India.",
            },
            {
              "@type": "WebSite",
              "@id": "https://riotous.store/#website",
              name: "RIOTOUS",
              url: "https://riotous.store",
              publisher: { "@id": "https://riotous.store/#organization" },
            },
          ],
        }),
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(productsQuery),
  component: HomePage,
});

function HomePage() {
  const { data: products } = useSuspenseQuery(productsQuery);

  return (
    <>
      {/* Hero */}
      <section className="relative -mt-16 flex min-h-[75svh] items-end overflow-hidden bg-foreground md:-mt-20 md:min-h-[100svh]">
        <video
          className="absolute inset-0 h-full w-full object-contain object-center opacity-90 md:object-cover md:opacity-70"

          src={heroVideo}

          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/20 via-transparent to-foreground/80 md:from-foreground/60 md:via-foreground/40 md:to-foreground/90" />
        <div
          className="absolute inset-0 opacity-30 mix-blend-overlay"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 20% 30%, oklch(0.62 0.22 258 / 0.5), transparent 60%), radial-gradient(ellipse at 80% 70%, oklch(0.3 0.15 258 / 0.6), transparent 60%)",
          }}
        />
        <div className="relative mx-auto w-full max-w-[1400px] px-6 pb-20 pt-40 text-background md:px-10 md:pb-32 md:pt-48">
          <p className="mb-6 text-xs font-medium uppercase tracking-[0.3em] text-background/70">
            Premium DTF apparel · Made in India
          </p>
          <h1 className="max-w-5xl text-[13vw] font-black leading-[0.9] tracking-[-0.04em] text-background md:text-[8.5vw] lg:text-[7rem]">
            We Don't Follow Trends.
            <br />
            We Print Them.
          </h1>
          <p className="mt-8 max-w-lg text-base text-background/80 md:text-lg">
            Premium DTF printed apparel made for creators, dreamers and streetwear lovers. Oversized
            tees and graphic prints, designed and made in India.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/shop"
              className="group inline-flex items-center gap-2 rounded-full bg-background px-7 py-4 text-sm font-medium text-foreground transition-transform hover:scale-[1.02]"
            >
              Shop Now
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
            <Link
              to="/design"
              className="group inline-flex items-center gap-2 rounded-full border border-background/30 px-7 py-4 text-sm font-medium text-background backdrop-blur transition-colors hover:bg-background/10"
            >
              Design Your Own
              <Sparkles className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Featured categories */}
      <section className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
              Collections
            </p>
            <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">Shop the drop.</h2>
          </div>
          <Link
            to="/shop"
            className="group inline-flex items-center gap-1 text-sm font-medium text-foreground/70 hover:text-foreground"
          >
            View all
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
          {[
            { title: "DTF Printed Tees", tag: "Signature" },
            { title: "Custom Printing", tag: "Design your own", to: "/design" },
            { title: "Oversized", tag: "New silhouettes" },
            { title: "Best Sellers", tag: "Community favorites" },
          ].map((c, i) => (
            <Link
              key={i}
              to={c.to ?? "/shop"}
              className="group relative flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-2xl bg-brand-red p-5 text-white md:p-6"
            >
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/70">
                {c.tag}
              </span>
              <div>
                <h3 className="text-xl font-semibold tracking-tight md:text-2xl">{c.title}</h3>
                <ArrowUpRight className="mt-2 h-5 w-5 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section className="mx-auto max-w-[1400px] px-6 py-16 md:px-10 md:py-24">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">Featured.</h2>
          <Link
            to="/shop"
            className="group inline-flex items-center gap-1 text-sm font-medium text-foreground/70 hover:text-foreground"
          >
            All products
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>
        {products.length === 0 ? (
          <EmptyProducts />
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4 md:gap-x-6">
            {products.map((p) => (
              <ProductCard key={p.node.id} product={p} />
            ))}
          </div>
        )}
      </section>

      {/* Why RIOTOUS */}
      <section className="bg-secondary py-24 md:py-32">
        <div className="mx-auto max-w-[1400px] px-6 md:px-10">
          <div className="mb-16 max-w-3xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
              Why <BrandName />
            </p>
            <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">
              Built for the ones who create.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              {
                icon: Sparkles,
                title: "Premium fabric",
                body: "Heavyweight combed cotton. Cut and sewn for durability and drape.",
              },
              {
                icon: Package,
                title: "Long-lasting DTF prints",
                body: "Ultra-vibrant direct-to-film prints that survive the wash and the mosh.",
              },
              {
                icon: Truck,
                title: "Fast shipping",
                body: "Free shipping over ₹1499. Dispatched within 24 hours across India.",
              },
              {
                icon: RotateCcw,
                title: "Easy returns",
                body: "7-day no-questions returns. If you don't love it, send it back.",
              },
              {
                icon: MapPin,
                title: "Made in India",
                body: "Designed, printed, and packed by our team. Fair wages, fair work.",
              },
              {
                icon: Package,
                title: "Premium packaging",
                body: (
                  <>
                    Every drop arrives in signature <BrandName /> packaging. Unboxing is part of the
                    fit.
                  </>
                ),
              },
            ].map((f, i) => (
              <div key={i} className="group">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-background transition-colors group-hover:bg-brand-red group-hover:text-white">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold tracking-tight">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Design your own CTA */}
      <section className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
        <div className="relative overflow-hidden rounded-3xl bg-brand-red p-10 text-background md:p-20">
          <div className="metallic-shine absolute inset-0 opacity-30" />
          <div className="relative max-w-2xl">
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.3em] text-background/60">
              Design Studio
            </p>
            <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">
              Your art. Our shirt.
              <br />
              Zero limits.
            </h2>
            <p className="mt-6 max-w-lg text-background/70">
              Upload artwork, add text, place it front, back or sleeve — see it live before you
              order.
            </p>
            <Link
              to="/design"
              className="group mt-10 inline-flex items-center gap-2 rounded-full bg-background px-7 py-4 text-sm font-medium text-foreground transition-transform hover:scale-[1.02]"
            >
              Open the Studio
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Reviews placeholder */}
      <section className="mx-auto max-w-[1400px] px-6 pb-24 md:px-10 md:pb-32">
        <div className="mb-12 max-w-2xl">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
            Reviews
          </p>
          <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
            Straight from the community.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-background p-8">
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, s) => (
                  <span key={s} className="text-lg text-muted-foreground/40">
                    ★
                  </span>
                ))}
              </div>
              <p className="mt-6 text-sm text-muted-foreground">No reviews yet.</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
