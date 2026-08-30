import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Star } from "lucide-react";
import { getMyReviews } from "@/lib/reviews.functions";
import { Stars } from "@/components/reviews/star-rating";
import { reviewImageUrl } from "@/lib/review-images";
import { productImageUrl } from "@/lib/product-images";
import { REVIEW_STATUS_LABEL, REVIEW_STATUS_TONE } from "@/lib/reviews-shared";

export const Route = createFileRoute("/_authenticated/account/reviews")({
  head: () => ({
    meta: [
      { title: "My Reviews — RIOTOUS" },
      {
        name: "description",
        content: "Reviews you have written on RIOTOUS products and their approval status.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyReviewsPage,
});

function img(path: string | null) {
  if (!path) return null;
  return path.startsWith("http") || path.startsWith("/api/") ? path : productImageUrl(path);
}

function MyReviewsPage() {
  const fn = useServerFn(getMyReviews);
  const { data, isLoading } = useQuery({
    queryKey: ["my-reviews"],
    queryFn: () => fn(),
  });

  return (
    <div className="container max-w-3xl py-12 md:py-20">
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">My reviews</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Reviews are published once our team approves them.
      </p>

      {isLoading ? (
        <p className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : !data?.length ? (
        <div className="mt-10 rounded-2xl border border-border p-8 text-center">
          <Star className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            You haven't reviewed anything yet. Reviews open up once an order is delivered.
          </p>
          <Link
            to="/account/orders"
            className="mt-5 inline-flex h-11 items-center rounded-full border border-border px-5 text-sm font-medium hover:bg-secondary"
          >
            View my orders
          </Link>
        </div>
      ) : (
        <ul className="mt-10 space-y-5">
          {data.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border p-5">
              <div className="flex items-start gap-4">
                {img(r.product?.image ?? null) && (
                  <img
                    src={img(r.product?.image ?? null)!}
                    alt=""
                    className="h-16 w-16 flex-shrink-0 rounded-xl border object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {r.product ? (
                      <Link
                        to="/product/$handle"
                        params={{ handle: r.product.slug }}
                        className="truncate text-sm font-semibold hover:underline"
                      >
                        {r.product.name}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold">Product</span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        REVIEW_STATUS_TONE[r.status] ?? ""
                      }`}
                    >
                      {REVIEW_STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Stars value={r.rating} />
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        r.verified_purchase
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {r.verified_purchase ? "✓ Verified purchase" : "Normal review"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  {r.title && <p className="mt-2 text-sm font-medium">{r.title}</p>}
                  {r.review && (
                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                      {r.review}
                    </p>
                  )}
                  {r.images.length > 0 && (
                    <div className="mt-3 flex gap-2">
                      {r.images.map((p) => (
                        <img
                          key={p}
                          src={reviewImageUrl(p)}
                          alt=""
                          className="h-16 w-16 rounded-lg border object-cover"
                        />
                      ))}
                    </div>
                  )}
                  {r.admin_note && (
                    <p className="mt-2 text-xs text-destructive">Note: {r.admin_note}</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
