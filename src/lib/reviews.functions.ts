import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth-middleware";
import {
  summarize,
  type MyReview,
  type PublicReview,
  type ReviewSummary,
} from "@/lib/reviews-shared";
import { ensureDbSchema, getSql } from "@/lib/db";

export type ProductReviewsResult = {
  summary: ReviewSummary;
  reviews: PublicReview[];
};

export const getProductReviews = createServerFn({ method: "POST" })
  .inputValidator((d: { productId: string }) => ({ productId: String(d.productId) }))
  .handler(async ({ data }): Promise<ProductReviewsResult> => {
    try {
      await ensureDbSchema();
      const sql = getSql();
      const rows = await sql`
        SELECT r.id, r.product_id, r.user_id, r.author_name, r.rating, r.title, r.content as review,
          r.is_verified_buyer as verified_purchase, r.status, r.images, r.created_at
        FROM reviews r
        WHERE r.product_id = ${data.productId} AND (r.status = 'approved' OR r.status = 'Approved')
        ORDER BY r.created_at DESC
      `;

      const reviews: PublicReview[] = rows.map((r: any) => ({
        id: r.id,
        productId: r.product_id,
        authorName: r.author_name || "Anonymous",
        rating: Number(r.rating || 5),
        title: r.title || null,
        review: r.review || "",
        verifiedPurchase: Boolean(r.verified_purchase),
        images: Array.isArray(r.images)
          ? r.images
          : typeof r.images === "string"
            ? JSON.parse(r.images)
            : [],
        createdAt: new Date(r.created_at).toISOString(),
      }));

      return { summary: summarize(reviews.map((r) => r.rating)), reviews };
    } catch {
      return { summary: summarize([]), reviews: [] };
    }
  });

export type ReviewEligibility = {
  canReview: boolean;
  willBeVerified: boolean;
  existing: MyReview | null;
};

export const getReviewEligibility = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { productId: string }) => ({ productId: String(d.productId) }))
  .handler(async ({ data, context }): Promise<ReviewEligibility> => {
    const sql = getSql();
    const mine = await sql`
      SELECT id, product_id, rating, title, content as review, images, is_verified_buyer as verified_purchase, status, created_at, updated_at
      FROM reviews
      WHERE user_id = ${context.userId} AND product_id = ${data.productId}
      LIMIT 1
    `;

    const purchased = await sql`
      SELECT i.id
      FROM order_items i
      JOIN orders o ON i.order_id = o.id
      WHERE i.product_id = ${data.productId} AND o.user_id = ${context.userId} AND o.status = 'Delivered'
      LIMIT 1
    `;

    const existingReview = mine[0]
      ? {
          id: mine[0].id,
          product_id: mine[0].product_id,
          rating: Number(mine[0].rating),
          title: mine[0].title || null,
          review: mine[0].review || null,
          images: Array.isArray(mine[0].images) ? mine[0].images : [],
          verified_purchase: Boolean(mine[0].verified_purchase),
          status: mine[0].status,
          created_at: new Date(mine[0].created_at).toISOString(),
          updated_at: new Date(mine[0].updated_at).toISOString(),
        }
      : null;

    return {
      canReview: true,
      willBeVerified: purchased.length > 0,
      existing: existingReview as unknown as MyReview,
    };
  });

export type ReviewInput = {
  productId: string;
  rating: number;
  title?: string | null;
  review?: string | null;
  images?: string[];
};

function normalize(d: ReviewInput) {
  const rating = Math.round(Number(d.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error("Please choose a rating between 1 and 5 stars.");
  }
  const title = d.title?.trim() ? d.title.trim().slice(0, 100) : null;
  const review = d.review?.trim() ? d.review.trim().slice(0, 2000) : null;
  const images = Array.from(new Set((d.images ?? []).filter(Boolean))).slice(0, 5);
  return { rating, title, review, images };
}

export const submitReview = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: ReviewInput) => d)
  .handler(async ({ data, context }): Promise<MyReview> => {
    const patch = normalize(data);
    const sql = getSql();

    const existing = await sql`
      SELECT id FROM reviews WHERE user_id = ${context.userId} AND product_id = ${data.productId} LIMIT 1
    `;

    const purchased = await sql`
      SELECT i.id
      FROM order_items i
      JOIN orders o ON i.order_id = o.id
      WHERE i.product_id = ${data.productId} AND o.user_id = ${context.userId} AND o.status = 'Delivered'
      LIMIT 1
    `;
    const isVerified = purchased.length > 0;
    const authorName = context.user.fullName || context.user.email || "Customer";

    if (existing.length > 0) {
      const reviewId = existing[0].id;
      await sql`
        UPDATE reviews SET
          rating = ${patch.rating},
          title = ${patch.title},
          content = ${patch.review || ""},
          images = ${JSON.stringify(patch.images)},
          is_verified_buyer = ${isVerified},
          updated_at = NOW()
        WHERE id = ${reviewId}
      `;
      return {
        id: reviewId,
        product_id: data.productId,
        rating: patch.rating,
        title: patch.title,
        review: patch.review,
        images: patch.images,
        verified_purchase: isVerified,
        status: "approved",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as MyReview;
    }

    const reviewId = `rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    await sql`
      INSERT INTO reviews (
        id, product_id, user_id, author_name, rating, title, content, is_verified_buyer, status, images
      ) VALUES (
        ${reviewId}, ${data.productId}, ${context.userId}, ${authorName}, ${patch.rating}, ${patch.title}, ${patch.review || ""},
        ${isVerified}, 'approved', ${JSON.stringify(patch.images)}
      );
    `;

    return {
      id: reviewId,
      product_id: data.productId,
      rating: patch.rating,
      title: patch.title,
      review: patch.review,
      images: patch.images,
      verified_purchase: isVerified,
      status: "approved",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as MyReview;
  });

export const getMyReviews = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<MyReview[]> => {
    const sql = getSql();
    const rows = await sql`
      SELECT r.id, r.product_id, r.rating, r.title, r.content as review, r.images, r.is_verified_buyer as verified_purchase,
        r.status, r.created_at, r.updated_at, p.name as product_name, p.slug as product_slug, p.images as product_images
      FROM reviews r
      LEFT JOIN products p ON r.product_id = p.id
      WHERE r.user_id = ${context.userId}
      ORDER BY r.created_at DESC
    `;

    return rows.map((r: any) => {
      const pImages = Array.isArray(r.product_images)
        ? r.product_images
        : typeof r.product_images === "string"
          ? JSON.parse(r.product_images)
          : [];
      return {
        id: r.id,
        product_id: r.product_id,
        rating: Number(r.rating || 5),
        title: r.title || null,
        review: r.review || null,
        images: Array.isArray(r.images)
          ? r.images
          : typeof r.images === "string"
            ? JSON.parse(r.images)
            : [],
        verified_purchase: Boolean(r.verified_purchase),
        status: r.status,
        created_at: new Date(r.created_at).toISOString(),
        updated_at: new Date(r.updated_at).toISOString(),
        product: r.product_name
          ? {
              name: r.product_name,
              slug: r.product_slug,
              image: pImages[0] ?? null,
            }
          : null,
      } as MyReview;
    });
  });
