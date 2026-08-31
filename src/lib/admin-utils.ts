import { getSql } from "@/lib/db";
import { isAdminEmail } from "@/lib/auth";

export type AdminCtx = {
  userId: string;
  user?: { email?: string; role?: string };
  isAdmin?: boolean;
};

export async function assertAdmin(context: {
  userId: string;
  user?: { email?: string; role?: string };
  isAdmin?: boolean;
}) {
  if (context.isAdmin) return;
  if (context.user?.role === "admin" || isAdminEmail(context.user?.email)) return;

  const sql = getSql();
  const rows = await sql`
    SELECT role, email FROM profiles WHERE id = ${context.userId} LIMIT 1
  `;
  if (rows.length === 0) {
    if (isAdminEmail(context.user?.email)) return;
    throw new Error("Forbidden: admin only");
  }
  const r = rows[0];
  if (r.role === "admin" || isAdminEmail(r.email)) {
    return;
  }
  throw new Error("Forbidden: admin only");
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export const ARCHIVED_TAG = "__archived";

export type ProductInput = {
  title: string;
  description?: string;
  price: string | number;
  sizes?: string[];
  colors?: string[];
  tags?: string[];
  category?: string;
  stock?: number;
  sizeStock?: Record<string, number>;
  images?: string[];
  isActive?: boolean;
};

function cleanList(list?: string[]) {
  return Array.from(new Set((list ?? []).map((v) => String(v).trim()).filter(Boolean)));
}

/** Normalises + validates a product payload coming from the admin form. */
export function normalizeProductInput(d: ProductInput) {
  const title = String(d.title ?? "").trim();
  if (!title) throw new Error("Invalid product data: name is required");
  if (title.length > 200) throw new Error("Invalid product data: name is too long (max 200 chars)");

  const price = Number(d.price);
  if (!Number.isFinite(price) || price < 0)
    throw new Error("Invalid product data: price must be a number ≥ 0");

  let sizes = cleanList(d.sizes);
  if (sizes.length === 0) {
    sizes = ["S", "M", "L", "XL", "XXL"];
  }

  const explicitStockSum =
    d.sizeStock && typeof d.sizeStock === "object"
      ? Object.values(d.sizeStock).reduce(
          (sum, v) => sum + Math.max(0, Math.round(Number(v) || 0)),
          0,
        )
      : 0;

  const passedTotalStock = Math.max(0, Math.round(Number(d.stock) || 0));
  const sizeStock: Record<string, number> = {};
  let totalStock = 0;

  if (explicitStockSum > 0) {
    for (const s of sizes) {
      const q = Math.max(0, Math.round(Number(d.sizeStock?.[s]) || 0));
      sizeStock[s] = q;
      totalStock += q;
    }
  } else if (passedTotalStock > 0) {
    totalStock = passedTotalStock;
    const base = Math.floor(totalStock / sizes.length);
    const rem = totalStock % sizes.length;
    sizes.forEach((s, idx) => {
      sizeStock[s] = base + (idx < rem ? 1 : 0);
    });
  } else {
    totalStock = 0;
    sizes.forEach((s) => {
      sizeStock[s] = 0;
    });
  }

  // Sanitize images: preserve valid URLs, data URLs, and paths
  const images = (d.images ?? [])
    .map((img) => String(img || "").trim())
    .filter((img) => img.length > 0);

  return {
    name: title,
    description: d.description?.trim() ? d.description.trim() : null,
    price,
    images: images.length > 0 ? images : ["/placeholder-tee.jpg"],
    sizes,
    colors: cleanList(d.colors).length > 0 ? cleanList(d.colors) : ["Black"],
    tags: cleanList(d.tags),
    category: d.category?.trim() ? d.category.trim() : "Oversized Tees",
    stock_quantity: totalStock,
    sizeStock,
    is_active: d.isActive !== false,
  };
}

/** Records an important admin action. Never throws — logging must not break the action. */
export async function logAudit(
  context: AdminCtx,
  action: string,
  entityType: string | null,
  entityId: string | null,
  details: Record<string, unknown> = {},
) {
  try {
    const sql = getSql();
    const id = `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    await sql`
      INSERT INTO admin_audit_log (id, actor_id, actor_email, action, entity_type, entity_id, details)
      VALUES (
        ${id},
        ${context.userId},
        ${context.user?.email || null},
        ${action},
        ${entityType},
        ${entityId},
        ${JSON.stringify(details)}::jsonb
      );
    `;
  } catch (e) {
    console.warn("[Admin Audit] Notice:", e);
  }
}

/**
 * Makes sure a product has one inventory row per size/colour combination and synchronizes stock.
 */
export async function syncProductVariants(
  context: AdminCtx,
  productId: string,
  sizes: string[],
  colors: string[],
  distributeTotal?: number,
  sizeStock?: Record<string, number>,
) {
  const sql = getSql();
  const s = sizes.length ? sizes : [""];
  const c = colors.length ? colors : [""];
  const desired: Array<{ size: string; color: string }> = [];
  for (const color of c) for (const size of s) desired.push({ size, color });

  const existing = await sql`
    SELECT id, size, color, stock_quantity, reserved_stock
    FROM product_variants
    WHERE product_id::text = ${String(productId)}
  `;

  const key = (v: { size: string; color: string }) =>
    `${(v.size || "").trim()}|${(v.color || "").trim()}`;
  const existingMap = new Map<string, any>();
  for (const v of existing ?? []) {
    existingMap.set(key(v), v);
  }

  const hasExplicitSizeStock = Boolean(
    sizeStock &&
    Object.keys(sizeStock).length > 0 &&
    Object.values(sizeStock).some((val) => val > 0),
  );

  if (hasExplicitSizeStock) {
    // 1. Explicit per-size allocation
    for (const item of desired) {
      const k = key(item);
      const targetQty = Math.max(0, Math.round(Number(sizeStock![item.size]) || 0));
      const ex = existingMap.get(k);
      if (ex) {
        await sql`
          UPDATE product_variants
          SET stock_quantity = ${targetQty}, updated_at = NOW()
          WHERE id::text = ${String(ex.id)}
        `;
      } else {
        const varId = `var_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        await sql`
          INSERT INTO product_variants (id, product_id, size, color, stock_quantity)
          VALUES (${varId}, ${String(productId)}, ${item.size}, ${item.color}, ${targetQty});
        `;
      }
    }
  } else if (distributeTotal !== undefined && Number(distributeTotal) >= 0) {
    // 2. Distribute total across desired combinations
    const total = Math.max(0, Math.round(Number(distributeTotal)));
    const base = desired.length ? Math.floor(total / desired.length) : 0;
    const rem = desired.length ? total % desired.length : 0;

    for (let i = 0; i < desired.length; i++) {
      const item = desired[i];
      const k = key(item);
      const targetQty = base + (i < rem ? 1 : 0);
      const ex = existingMap.get(k);
      if (ex) {
        await sql`
          UPDATE product_variants
          SET stock_quantity = ${targetQty}, updated_at = NOW()
          WHERE id::text = ${String(ex.id)}
        `;
      } else {
        const varId = `var_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        await sql`
          INSERT INTO product_variants (id, product_id, size, color, stock_quantity)
          VALUES (${varId}, ${String(productId)}, ${item.size}, ${item.color}, ${targetQty});
        `;
      }
    }
  } else {
    // 3. Make sure any missing variants exist
    for (const item of desired) {
      const k = key(item);
      if (!existingMap.has(k)) {
        const varId = `var_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        await sql`
          INSERT INTO product_variants (id, product_id, size, color, stock_quantity)
          VALUES (${varId}, ${String(productId)}, ${item.size}, ${item.color}, 0);
        `;
      }
    }
  }

  // Safely clean up stale variants that are not desired and have 0 reserved stock & no order references
  const wanted = new Set(desired.map(key));
  const stale = (existing ?? []).filter(
    (v: any) => !wanted.has(key(v)) && Number(v.reserved_stock || 0) === 0,
  );
  if (stale.length) {
    for (const st of stale) {
      const refs = await sql`
        SELECT count(*)::int as count FROM order_items WHERE variant_id::text = ${String(st.id)}
      `;
      if ((refs[0]?.count ?? 0) === 0) {
        await sql`DELETE FROM product_variants WHERE id::text = ${String(st.id)}`;
      }
    }
  }

  // Sync parent product total stock from sum of variants
  const varSum = await sql`
    SELECT COALESCE(SUM(stock_quantity), 0)::int as total
    FROM product_variants
    WHERE product_id::text = ${String(productId)}
  `;
  const finalTotal = Number(varSum[0]?.total ?? 0);
  await sql`
    UPDATE products
    SET stock_quantity = ${finalTotal}, updated_at = NOW()
    WHERE id::text = ${String(productId)}
  `;
}
