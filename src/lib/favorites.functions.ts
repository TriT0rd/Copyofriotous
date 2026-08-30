import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth-middleware";
import { ensureDbSchema, getSql } from "@/lib/db";

export type Favorite = {
  id: string;
  product_handle: string;
  product_title: string;
  product_image: string | null;
  product_price: number | null;
  product_currency: string | null;
  created_at: string;
};

export const getMyFavorites = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<Favorite[]> => {
    try {
      await ensureDbSchema();
      const sql = getSql();
      const rows = await sql`
        SELECT id, product_handle, product_title, product_image, product_price, product_currency, created_at
        FROM favorites
        WHERE user_id = ${context.userId}
        ORDER BY created_at DESC
      `;
      return rows.map((r: any) => ({
        id: r.id,
        product_handle: r.product_handle,
        product_title: r.product_title,
        product_image: r.product_image || null,
        product_price: r.product_price ? Number(r.product_price) : null,
        product_currency: r.product_currency || "INR",
        created_at: new Date(r.created_at).toISOString(),
      }));
    } catch {
      return [];
    }
  });

export const addFavorite = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (d: {
      handle: string;
      title: string;
      image?: string | null;
      price?: number | null;
      currency?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }): Promise<Favorite> => {
    await ensureDbSchema();
    const sql = getSql();
    const favId = `fav_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    await sql`
      INSERT INTO favorites (
        id, user_id, product_handle, product_title, product_image, product_price, product_currency
      ) VALUES (
        ${favId}, ${context.userId}, ${data.handle}, ${data.title}, ${data.image || null}, ${data.price || null}, ${data.currency || "INR"}
      );
    `;

    return {
      id: favId,
      product_handle: data.handle,
      product_title: data.title,
      product_image: data.image || null,
      product_price: data.price ? Number(data.price) : null,
      product_currency: data.currency || "INR",
      created_at: new Date().toISOString(),
    };
  });

export const removeFavorite = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await ensureDbSchema();
    const sql = getSql();
    await sql`
      DELETE FROM favorites WHERE id = ${data.id} AND user_id = ${context.userId}
    `;
    return { ok: true };
  });
