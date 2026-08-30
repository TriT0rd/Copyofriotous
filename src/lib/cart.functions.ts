import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth-middleware";
import { ensureDbSchema, getSql } from "@/lib/db";
import type { CartItem } from "@/stores/cart-store";

export const getMyCart = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<CartItem[]> => {
    try {
      await ensureDbSchema();
      const sql = getSql();
      const rows = await sql`
        SELECT items FROM carts WHERE user_id = ${context.userId} LIMIT 1
      `;
      if (rows.length > 0 && rows[0].items) {
        const items = typeof rows[0].items === "string" ? JSON.parse(rows[0].items) : rows[0].items;
        return Array.isArray(items) ? items : [];
      }
    } catch {
      /* fallback */
    }
    return [];
  });

export const saveMyCart = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { items: CartItem[] }) => ({ items: d.items ?? [] }))
  .handler(async ({ data, context }) => {
    try {
      await ensureDbSchema();
      const sql = getSql();
      const jsonItems = JSON.stringify(data.items);
      await sql`
        INSERT INTO carts (user_id, items, updated_at)
        VALUES (${context.userId}, ${jsonItems}::jsonb, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          items = ${jsonItems}::jsonb,
          updated_at = NOW();
      `;
    } catch (e) {
      console.warn("saveMyCart error", e);
    }
    return { ok: true };
  });
