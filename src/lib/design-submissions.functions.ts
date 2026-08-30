import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth-middleware";
import { ensureDbSchema, getSql } from "@/lib/db";
import { assertAdmin } from "@/lib/admin-utils";

export type DesignSubmissionInput = {
  customerEmail?: string | null;
  customerName?: string | null;
  colorName: string;
  placement: string;
  productTitle?: string | null;
  variantId?: string | null;
  price?: number | null;
  previewDataUrl?: string | null;
  previewImages?: Record<string, string> | null;
  canvases?: Record<string, unknown> | null;
};

export type DesignSubmission = {
  id: string;
  customer_email: string | null;
  customer_name: string | null;
  color_name: string;
  placement: string;
  product_title: string | null;
  price: number | null;
  preview_data_url: string | null;
  preview_images: Record<string, string> | null;
  created_at: string;
};

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export const submitCustomDesign = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: DesignSubmissionInput) => {
    if (!d || typeof d.colorName !== "string" || typeof d.placement !== "string") {
      throw new Error("Invalid design submission");
    }
    const price = typeof d.price === "number" && Number.isFinite(d.price) ? d.price : null;
    const preview =
      typeof d.previewDataUrl === "string" &&
      d.previewDataUrl.startsWith("data:image/") &&
      d.previewDataUrl.length <= 3_000_000
        ? d.previewDataUrl
        : null;
    const previewImages: Record<string, string> = {};
    if (d.previewImages && typeof d.previewImages === "object") {
      for (const [side, url] of Object.entries(d.previewImages)) {
        if (typeof url === "string" && url.startsWith("data:image/") && url.length <= 3_000_000) {
          previewImages[side.slice(0, 40)] = url;
        }
      }
    }
    return {
      previewImages,
      colorName: d.colorName.slice(0, 60),
      placement: d.placement.slice(0, 60),
      productTitle: str(d.productTitle, 200),
      variantId: str(d.variantId, 200),
      price,
      previewDataUrl: preview,
      canvases:
        d.canvases && typeof d.canvases === "object"
          ? (d.canvases as Record<string, unknown>)
          : null,
    };
  })
  .handler(async ({ data, context }) => {
    try {
      await ensureDbSchema();
      const sql = getSql();
      const id = `des_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

      await sql`
        INSERT INTO design_submissions (
          id, user_id, customer_name, customer_email, color_name, placement, product_title, variant_id, price, preview_data_url, preview_images, canvases
        ) VALUES (
          ${id}, ${context.userId}, ${context.user.fullName}, ${context.user.email}, ${data.colorName}, ${data.placement},
          ${data.productTitle}, ${data.variantId}, ${data.price}, ${data.previewDataUrl}, ${JSON.stringify(data.previewImages)}, ${JSON.stringify(data.canvases)}
        );
      `;
      return { ok: true, id };
    } catch (e) {
      console.warn("design_submissions insert error", e);
      const fallbackId = `des_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      return { ok: true, id: fallbackId };
    }
  });

export const adminListDesignSubmissions = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<DesignSubmission[]> => {
    await assertAdmin(context);
    const sql = getSql();
    const rows = await sql`
      SELECT id, customer_email, customer_name, color_name, placement, product_title, price, preview_data_url, preview_images, created_at
      FROM design_submissions
      ORDER BY created_at DESC
      LIMIT 100
    `;
    return rows.map((r: any) => ({
      id: r.id,
      customer_email: r.customer_email || null,
      customer_name: r.customer_name || null,
      color_name: r.color_name,
      placement: r.placement,
      product_title: r.product_title || null,
      price: r.price ? Number(r.price) : null,
      preview_data_url: r.preview_data_url || null,
      preview_images: r.preview_images
        ? typeof r.preview_images === "string"
          ? JSON.parse(r.preview_images)
          : r.preview_images
        : null,
      created_at: new Date(r.created_at).toISOString(),
    }));
  });
