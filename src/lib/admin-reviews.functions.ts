import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth-middleware";
import { assertAdmin, logAudit } from "@/lib/admin-utils";
import { REVIEW_STATUSES, type AdminReview, type ReviewStatus } from "@/lib/reviews-shared";
import { getSql } from "@/lib/db";

export const adminListReviews = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminReview[]> => {
    await assertAdmin(context);
    const sql = getSql();

    const rows = await sql`
      SELECT r.id, r.product_id, r.user_id, r.rating, r.title, r.content as review, r.images, r.is_verified_buyer as verified_purchase,
        r.status, r.created_at, r.updated_at, p.name as product_name, p.slug as product_slug, p.images as product_images,
        prof.email as customer_email, prof.full_name as customer_name
      FROM reviews r
      LEFT JOIN products p ON r.product_id = p.id
      LEFT JOIN profiles prof ON r.user_id = prof.id
      ORDER BY r.created_at DESC
      LIMIT 500
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
        user_id: r.user_id,
        rating: Number(r.rating || 5),
        title: r.title || null,
        review: r.review || null,
        images: Array.isArray(r.images) ? r.images : [],
        verified_purchase: Boolean(r.verified_purchase),
        status: r.status as ReviewStatus,
        created_at: new Date(r.created_at).toISOString(),
        updated_at: new Date(r.updated_at).toISOString(),
        customer_email: r.customer_email || null,
        customer_name: r.customer_name || null,
        product: r.product_name
          ? {
              name: r.product_name,
              slug: r.product_slug,
              image: pImages[0] ?? null,
            }
          : null,
      } as AdminReview;
    });
  });

export const adminUpdateReviewStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { reviewId: string; status: ReviewStatus; adminNote?: string | null }) => {
    if (!REVIEW_STATUSES.includes(d.status)) throw new Error("Invalid review status");
    return {
      reviewId: String(d.reviewId),
      status: d.status,
      adminNote: d.adminNote?.trim() ? d.adminNote.trim().slice(0, 500) : null,
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sql = getSql();
    await sql`
      UPDATE reviews SET status = ${data.status}, updated_at = NOW()
      WHERE id = ${data.reviewId}
    `;
    await logAudit(context, "review.status", "review", data.reviewId, {
      status: data.status,
    });
    return { ok: true };
  });

export const adminDeleteReview = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { reviewId: string }) => ({ reviewId: String(d.reviewId) }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sql = getSql();
    await sql`DELETE FROM reviews WHERE id = ${data.reviewId}`;
    await logAudit(context, "review.delete", "review", data.reviewId, {});
    return { ok: true };
  });

export const adminReviewFormOptions = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const sql = getSql();
    const [products, customers] = await Promise.all([
      sql`SELECT id, name, images FROM products ORDER BY name ASC LIMIT 500`,
      sql`SELECT id, email, full_name FROM profiles ORDER BY created_at DESC LIMIT 500`,
    ]);

    return {
      products: products.map((p: any) => ({
        id: p.id,
        name: p.name,
        images: Array.isArray(p.images) ? p.images : [],
      })),
      customers: customers.map((c: any) => ({
        id: c.id,
        email: c.email,
        full_name: c.full_name,
      })),
    };
  });

export const adminSaveReview = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (d: {
      reviewId?: string | null;
      productId: string;
      userId?: string | null;
      rating: number;
      title?: string | null;
      review?: string | null;
      images?: string[];
      verifiedPurchase: boolean;
      status: ReviewStatus;
      adminNote?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sql = getSql();

    if (data.reviewId) {
      await sql`
        UPDATE reviews SET
          rating = ${data.rating},
          title = ${data.title || null},
          content = ${data.review || null},
          images = ${JSON.stringify(data.images || [])}::jsonb,
          is_verified_buyer = ${data.verifiedPurchase},
          status = ${data.status},
          updated_at = NOW()
        WHERE id = ${data.reviewId}
      `;
      await logAudit(context, "review.update", "review", data.reviewId, {
        rating: data.rating,
        status: data.status,
      });
      return { ok: true, id: data.reviewId };
    }

    const id = `rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    await sql`
      INSERT INTO reviews (
        id, product_id, user_id, rating, title, content, images, is_verified_buyer, status
      ) VALUES (
        ${id}, ${data.productId}, ${data.userId || context.userId}, ${data.rating}, ${data.title || null}, ${data.review || null}, ${JSON.stringify(data.images || [])}::jsonb, ${data.verifiedPurchase}, ${data.status}
      )
    `;
    await logAudit(context, "review.create", "review", id, {
      rating: data.rating,
      status: data.status,
    });

    return { ok: true, id };
  });
