import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, ImagePlus, X, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Stars, StarPicker } from "@/components/reviews/star-rating";
import { getProductReviews, getReviewEligibility, submitReview } from "@/lib/reviews.functions";
import {
  MAX_REVIEW_IMAGES,
  reviewImageUrl,
  uploadReviewImage,
  validateReviewImage,
} from "@/lib/review-images";
import {
  REVIEW_PAGE_SIZE,
  REVIEW_SORTS,
  REVIEW_SORT_LABEL,
  type ReviewSort,
} from "@/lib/reviews-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function reviewDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ProductReviews({
  productId,
  productTitle,
}: {
  productId: string;
  productTitle: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(getProductReviews);
  const eligFn = useServerFn(getReviewEligibility);
  const submitFn = useServerFn(submitReview);

  const listQ = useQuery({
    queryKey: ["reviews", productId],
    queryFn: () => listFn({ data: { productId } }),
  });

  const eligQ = useQuery({
    queryKey: ["review-eligibility", productId, user?.id],
    queryFn: () => eligFn({ data: { productId } }),
    enabled: !!user,
  });

  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [paths, setPaths] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<number | null>(null);
  const [sort, setSort] = useState<ReviewSort>("recent");
  const [visible, setVisible] = useState(REVIEW_PAGE_SIZE);

  const existing = eligQ.data?.existing ?? null;

  const startEditing = () => {
    if (existing) {
      setRating(existing.rating);
      setTitle(existing.title ?? "");
      setText(existing.review ?? "");
      setPaths(existing.images ?? []);
    }
    setOpen(true);
  };

  const mutation = useMutation({
    mutationFn: () =>
      submitFn({
        data: { productId, rating, title, review: text, images: paths },
      }),
    onSuccess: () => {
      toast.success("Thank you for your review!");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["review-eligibility", productId] });
      qc.invalidateQueries({ queryKey: ["reviews", productId] });
      qc.invalidateQueries({ queryKey: ["my-reviews"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPick = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    const room = MAX_REVIEW_IMAGES - paths.length;
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    if (!chosen.length) {
      toast.error(`You can add up to ${MAX_REVIEW_IMAGES} photos`);
      return;
    }
    setUploading(true);
    try {
      for (const f of chosen) {
        const invalid = validateReviewImage(f);
        if (invalid) {
          toast.error(invalid);
          continue;
        }
        const path = await uploadReviewImage(f, user.id);
        setPaths((p) => [...p, path]);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const summary = listQ.data?.summary;
  const reviews = useMemo(() => {
    const all = listQ.data?.reviews ?? [];
    const filtered = filter ? all.filter((r) => Math.round(r.rating) === filter) : all;
    const sorted = [...filtered];
    if (sort === "highest") sorted.sort((a, b) => b.rating - a.rating);
    else if (sort === "lowest") sorted.sort((a, b) => a.rating - b.rating);
    else if (sort === "verified")
      sorted.sort((a, b) => Number(b.verified_purchase) - Number(a.verified_purchase));
    return sorted;
  }, [listQ.data, filter, sort]);

  const shown = reviews.slice(0, visible);

  return (
    <section id="reviews" className="mt-16 border-t border-border pt-12">
      <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Customer reviews</h2>

      {listQ.isLoading ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading reviews…
        </p>
      ) : (
        <div className="mt-6 grid gap-10 lg:grid-cols-[280px_1fr]">
          {/* Summary */}
          <div>
            {summary && summary.total > 0 ? (
              <>
                <div className="flex items-end gap-3">
                  <span className="text-5xl font-semibold leading-none">
                    {summary.average.toFixed(1)}
                  </span>
                  <div className="pb-1">
                    <Stars value={summary.average} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Based on {summary.total} review{summary.total > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-5 space-y-1.5">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = summary.distribution[star - 1] ?? 0;
                    const pct = summary.total ? (count / summary.total) * 100 : 0;
                    const active = filter === star;
                    return (
                      <button
                        key={star}
                        onClick={() => {
                          setFilter(active ? null : star);
                          setVisible(REVIEW_PAGE_SIZE);
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-xs transition-colors hover:bg-secondary ${
                          active ? "bg-secondary" : ""
                        }`}
                      >
                        <span className="w-6 text-left tabular-nums">{star}★</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                          <span
                            className="block h-full rounded-full bg-brand-red"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="w-6 text-right tabular-nums text-muted-foreground">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {filter && (
                  <button
                    onClick={() => setFilter(null)}
                    className="mt-3 text-xs text-brand-red underline"
                  >
                    Clear filter
                  </button>
                )}
              </>
            ) : (
              <div>
                <p className="text-sm font-medium">No reviews yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Be the first to share your experience with {productTitle}.
                </p>
              </div>
            )}

            {/* Write / edit */}
            <div className="mt-8">
              {!user ? (
                <Link
                  to="/auth"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-medium hover:bg-secondary"
                >
                  Sign in to write a review
                </Link>
              ) : existing ? (
                <div className="rounded-2xl border border-border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">Your review</span>
                  </div>
                  <Stars value={existing.rating} className="mt-2" />
                  {existing.review && (
                    <p className="mt-2 text-xs text-muted-foreground">{existing.review}</p>
                  )}
                  {existing.admin_note && (
                    <p className="mt-2 text-xs text-destructive">{existing.admin_note}</p>
                  )}
                  <Button variant="outline" size="sm" className="mt-3" onClick={startEditing}>
                    Edit review
                  </Button>
                </div>
              ) : (
                <Button className="h-11 rounded-full px-5" onClick={startEditing}>
                  Write a review
                </Button>
              )}
            </div>
          </div>

          {/* List */}
          <div>
            {open && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate();
                }}
                className="mb-8 rounded-2xl border border-border p-5"
              >
                <p className="text-sm font-semibold">
                  {existing ? "Edit your review" : `Review ${productTitle}`}
                </p>
                <div className="mt-4">
                  <StarPicker value={rating} onChange={setRating} disabled={mutation.isPending} />
                </div>
                <Input
                  className="mt-4"
                  placeholder="Headline (optional)"
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <Textarea
                  className="mt-3 min-h-28"
                  placeholder="What did you like or dislike? Fit, print quality, fabric…"
                  maxLength={2000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {paths.map((p) => (
                    <div key={p} className="relative h-16 w-16 overflow-hidden rounded-lg border">
                      <img src={reviewImageUrl(p)} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPaths((cur) => cur.filter((x) => x !== p))}
                        className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5"
                        aria-label="Remove photo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {paths.length < MAX_REVIEW_IMAGES && (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed text-muted-foreground hover:border-foreground"
                      aria-label="Add photo"
                    >
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ImagePlus className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => onPick(e.target.files)}
                  />
                </div>
                <div className="mt-5 flex gap-2">
                  <Button type="submit" disabled={mutation.isPending || uploading}>
                    {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit review
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Reviews are published after a quick check by our team.
                </p>
              </form>
            )}

            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {filter
                  ? "No reviews with this rating."
                  : "No reviews yet. Be the first to share your experience."}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Showing 1–{shown.length} of {reviews.length} reviews
                  </p>
                  <select
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value as ReviewSort);
                      setVisible(REVIEW_PAGE_SIZE);
                    }}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    aria-label="Sort reviews"
                  >
                    {REVIEW_SORTS.map((s) => (
                      <option key={s} value={s}>
                        {REVIEW_SORT_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>

                <ul className="mt-6 space-y-6">
                  {shown.map((r) => (
                    <li key={r.id} className="border-b border-border pb-6 last:border-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <Stars value={r.rating} />
                        {r.verified_purchase && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                            <ShieldCheck className="h-3 w-3" /> Verified purchase
                          </span>
                        )}
                      </div>
                      {r.title && <p className="mt-2 text-sm font-semibold">{r.title}</p>}
                      {r.review && (
                        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                          {r.review}
                        </p>
                      )}
                      {r.images.length > 0 && (
                        <div className="mt-3 flex gap-2 overflow-x-auto">
                          {r.images.map((p) => (
                            <a
                              key={p}
                              href={reviewImageUrl(p)}
                              target="_blank"
                              rel="noreferrer"
                              className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border"
                            >
                              <img
                                src={reviewImageUrl(p)}
                                alt="Customer photo"
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                      <p className="mt-3 text-xs text-muted-foreground">
                        {r.author_name || "Customer"} · {reviewDate(r.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>

                {shown.length < reviews.length && (
                  <Button
                    variant="outline"
                    className="mt-8 rounded-full"
                    onClick={() => setVisible((v) => v + REVIEW_PAGE_SIZE)}
                  >
                    Load more reviews
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
