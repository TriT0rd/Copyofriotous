import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import {
  adminListReviews,
  adminUpdateReviewStatus,
  adminDeleteReview,
  adminReviewFormOptions,
  adminSaveReview,
} from "@/lib/admin-reviews.functions";
import {
  REVIEW_STATUSES,
  REVIEW_STATUS_LABEL,
  REVIEW_STATUS_TONE,
  type AdminReview,
  type ReviewStatus,
} from "@/lib/reviews-shared";
import { Stars, StarPicker } from "@/components/reviews/star-rating";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MAX_REVIEW_IMAGES,
  reviewImageUrl,
  uploadReviewImage,
  validateReviewImage,
} from "@/lib/review-images";
import { productImageUrl } from "@/lib/product-images";
import { dateTime } from "@/components/admin/format";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/reviews")({
  component: AdminReviewsPage,
});

function img(path: string | null | undefined) {
  if (!path) return null;
  return path.startsWith("http") || path.startsWith("/api/") ? path : productImageUrl(path);
}

type SortKey = "newest" | "oldest" | "highest" | "lowest";

type FormState = {
  reviewId: string | null;
  productId: string;
  userId: string;
  rating: number;
  title: string;
  review: string;
  images: string[];
  verifiedPurchase: boolean;
  status: ReviewStatus;
  adminNote: string;
};

const emptyForm: FormState = {
  reviewId: null,
  productId: "",
  userId: "",
  rating: 5,
  title: "",
  review: "",
  images: [],
  verifiedPurchase: false,
  status: "approved",
  adminNote: "",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function AdminReviewsPage() {
  const { user } = useAuth();
  const listFn = useServerFn(adminListReviews);
  const statusFn = useServerFn(adminUpdateReviewStatus);
  const deleteFn = useServerFn(adminDeleteReview);
  const optionsFn = useServerFn(adminReviewFormOptions);
  const saveFn = useServerFn(adminSaveReview);
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | ReviewStatus>("");
  const [verification, setVerification] = useState<"" | "yes" | "no">("");
  const [ratingFilter, setRatingFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormState | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const listQ = useQuery({
    queryKey: ["admin", "reviews"],
    queryFn: () => listFn(),
    refetchInterval: 30_000,
  });

  const optionsQ = useQuery({
    queryKey: ["admin", "review-options"],
    queryFn: () => optionsFn(),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "reviews"] });
    qc.invalidateQueries({ queryKey: ["reviews"] });
  };

  const setStatusM = useMutation({
    mutationFn: (v: { reviewId: string; status: ReviewStatus; adminNote?: string | null }) =>
      statusFn({ data: v }),
    onSuccess: () => {
      toast.success("Review updated");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (reviewId: string) => deleteFn({ data: { reviewId } }),
    onSuccess: () => {
      toast.success("Review deleted");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveM = useMutation({
    mutationFn: (f: FormState) =>
      saveFn({
        data: {
          reviewId: f.reviewId,
          productId: f.productId,
          userId: f.userId,
          rating: f.rating,
          title: f.title,
          review: f.review,
          images: f.images,
          verifiedPurchase: f.verifiedPurchase,
          status: f.status,
          adminNote: f.adminNote,
        },
      }),
    onSuccess: () => {
      toast.success("Review saved");
      setForm(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = useMemo(() => (Array.isArray(listQ.data) ? listQ.data : []), [listQ.data]);

  const stats = useMemo(() => {
    const by = (s: ReviewStatus) => all.filter((r) => r.status === s).length;
    const approved = all.filter((r) => r.status === "approved");
    const avg = approved.length
      ? Math.round((approved.reduce((a, r) => a + r.rating, 0) / approved.length) * 10) / 10
      : 0;
    return {
      total: all.length,
      verified: all.filter((r) => r.verified_purchase).length,
      unverified: all.filter((r) => !r.verified_purchase).length,
      pending: by("pending"),
      approved: by("approved"),
      rejected: by("rejected"),
      hidden: by("hidden"),
      avg,
    };
  }, [all]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = all.filter((r) => {
      if (status && r.status !== status) return false;
      if (verification === "yes" && !r.verified_purchase) return false;
      if (verification === "no" && r.verified_purchase) return false;
      if (ratingFilter && Math.round(r.rating) !== Number(ratingFilter)) return false;
      if (productFilter && r.product_id !== productFilter) return false;
      if (!term) return true;
      return [r.product?.name, r.customer_email, r.customer_name, r.title, r.review]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
    const sorted = [...filtered];
    if (sort === "oldest") sorted.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    else if (sort === "highest") sorted.sort((a, b) => b.rating - a.rating);
    else if (sort === "lowest") sorted.sort((a, b) => a.rating - b.rating);
    else sorted.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return sorted;
  }, [all, q, status, verification, ratingFilter, productFilter, sort]);

  const startEdit = (r: AdminReview) =>
    setForm({
      reviewId: r.id,
      productId: r.product_id,
      userId: r.user_id,
      rating: r.rating,
      title: r.title ?? "",
      review: r.review ?? "",
      images: r.images ?? [],
      verifiedPurchase: r.verified_purchase,
      status: r.status,
      adminNote: r.admin_note ?? "",
    });

  const onPick = async (files: FileList | null) => {
    if (!files?.length || !form || !user) return;
    const room = MAX_REVIEW_IMAGES - form.images.length;
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    if (!chosen.length) return toast.error(`Up to ${MAX_REVIEW_IMAGES} photos`);
    setUploading(true);
    try {
      for (const f of chosen) {
        const invalid = validateReviewImage(f);
        if (invalid) {
          toast.error(invalid);
          continue;
        }
        const path = await uploadReviewImage(f, user.id);
        setForm((cur) => (cur ? { ...cur, images: [...cur.images, path] } : cur));
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reviews</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {stats.pending} awaiting approval · {stats.total} total
          </p>
        </div>
        <Button onClick={() => setForm({ ...emptyForm })} className="rounded-full">
          <Plus className="mr-1.5 h-4 w-4" /> Add review
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Total" value={stats.total} />
        <Stat label="Verified" value={stats.verified} />
        <Stat label="Not verified" value={stats.unverified} />
        <Stat label="Pending" value={stats.pending} />
        <Stat label="Approved" value={stats.approved} />
        <Stat label="Rejected" value={stats.rejected} />
        <Stat label="Hidden" value={stats.hidden} />
        <Stat label="Avg rating" value={stats.avg ? stats.avg.toFixed(1) : "—"} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search product, customer, text…"
          className="h-9 w-full sm:w-64"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "" | ReviewStatus)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          {REVIEW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {REVIEW_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={verification}
          onChange={(e) => setVerification(e.target.value as "" | "yes" | "no")}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All verification</option>
          <option value="yes">Verified</option>
          <option value="no">Not verified</option>
        </select>
        <select
          value={ratingFilter}
          onChange={(e) => setRatingFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All ratings</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} star{n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="h-9 max-w-[220px] rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All products</option>
          {(optionsQ.data?.products ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="highest">Highest rating</option>
          <option value="lowest">Lowest rating</option>
        </select>
      </div>

      {form && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveM.mutate(form);
          }}
          className="mt-6 rounded-2xl border bg-card/40 p-5"
        >
          <p className="text-sm font-semibold">{form.reviewId ? "Edit review" : "Add review"}</p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-xs font-medium">
              Product
              <select
                required
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select a product</option>
                {(optionsQ.data?.products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium">
              Customer
              <select
                required
                value={form.userId}
                onChange={(e) => setForm({ ...form, userId: e.target.value })}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select a customer</option>
                {(optionsQ.data?.customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name || c.email || c.id}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium">Rating</p>
            <StarPicker
              value={form.rating}
              onChange={(v) => setForm({ ...form, rating: v })}
              disabled={saveM.isPending}
            />
          </div>

          <Input
            className="mt-4"
            placeholder="Review title"
            maxLength={100}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <Textarea
            className="mt-3 min-h-24"
            placeholder="Review text"
            maxLength={2000}
            value={form.review}
            onChange={(e) => setForm({ ...form, review: e.target.value })}
          />

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-xs font-medium">
              Verification
              <select
                value={form.verifiedPurchase ? "yes" : "no"}
                onChange={(e) => setForm({ ...form, verifiedPurchase: e.target.value === "yes" })}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="yes">Verified purchase</option>
                <option value="no">Not verified</option>
              </select>
            </label>
            <label className="text-xs font-medium">
              Status
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ReviewStatus })}
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {REVIEW_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {REVIEW_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Input
            className="mt-4"
            placeholder="Admin note (optional)"
            maxLength={500}
            value={form.adminNote}
            onChange={(e) => setForm({ ...form, adminNote: e.target.value })}
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {form.images.map((p) => (
              <div key={p} className="relative h-16 w-16 overflow-hidden rounded-lg border">
                <img src={reviewImageUrl(p)} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, images: form.images.filter((x) => x !== p) })}
                  className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5"
                  aria-label="Remove photo"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {form.images.length < MAX_REVIEW_IMAGES && (
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
            <Button type="submit" disabled={saveM.isPending || uploading}>
              {saveM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save review
            </Button>
            <Button type="button" variant="ghost" onClick={() => setForm(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {listQ.isLoading ? (
        <div className="mt-6 space-y-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-xl border bg-card/40 p-4 flex flex-wrap items-start gap-4 shadow-xs"
            >
              <Skeleton className="h-16 w-16 rounded-lg shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-36 rounded" />
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3.5 w-48 rounded" />
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3.5 w-1/2 rounded" />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Skeleton className="h-8 w-20 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">No reviews match this filter.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card/40 p-4">
              <div className="flex flex-wrap items-start gap-4">
                {img(r.product?.image) && (
                  <img
                    src={img(r.product?.image)!}
                    alt=""
                    className="h-16 w-16 rounded-lg border object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{r.product?.name ?? "Product"}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        REVIEW_STATUS_TONE[r.status] ?? ""
                      }`}
                    >
                      {REVIEW_STATUS_LABEL[r.status]}
                    </span>
                    {r.verified_purchase ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        <ShieldCheck className="h-3 w-3" /> Verified
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        Not verified
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.customer_name || r.customer_email || r.user_id} · {dateTime(r.created_at)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Order: {r.order_id ? `#${r.order_id.slice(0, 8)}` : "Not applicable"} · User ID:{" "}
                    {r.user_id.slice(0, 8)}…
                  </p>
                  <Stars value={r.rating} className="mt-2" />
                  {r.title && <p className="mt-2 text-sm font-medium">{r.title}</p>}
                  {r.review && (
                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                      {r.review}
                    </p>
                  )}
                  {r.images.length > 0 && (
                    <div className="mt-3 flex gap-2">
                      {r.images.map((p) => (
                        <a
                          key={p}
                          href={reviewImageUrl(p)}
                          target="_blank"
                          rel="noreferrer"
                          className="h-16 w-16 overflow-hidden rounded-lg border"
                        >
                          <img
                            src={reviewImageUrl(p)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Input
                      value={notes[r.id] ?? r.admin_note ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                      placeholder="Internal / customer note (optional)"
                      className="h-9 w-full max-w-sm"
                    />
                    <Button size="sm" variant="secondary" onClick={() => startEdit(r)}>
                      Edit
                    </Button>
                    {(["approved", "rejected", "hidden", "pending"] as ReviewStatus[])
                      .filter((s) => s !== r.status)
                      .map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={s === "approved" ? "default" : "outline"}
                          disabled={setStatusM.isPending}
                          onClick={() =>
                            setStatusM.mutate({
                              reviewId: r.id,
                              status: s,
                              adminNote: notes[r.id] ?? r.admin_note ?? null,
                            })
                          }
                        >
                          {s === "pending"
                            ? "Restore to pending"
                            : s.charAt(0).toUpperCase() + s.slice(1)}
                        </Button>
                      ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={deleteM.isPending}
                      onClick={() => {
                        if (confirm("Delete this review permanently?")) deleteM.mutate(r.id);
                      }}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
