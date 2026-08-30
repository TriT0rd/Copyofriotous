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

  const stock = Math.max(0, Math.round(Number(d.stock) || 0));

  return {
    name: title,
    description: d.description?.trim() ? d.description.trim() : null,
    price,
    images: cleanList(d.images),
    sizes: cleanList(d.sizes),
    colors: cleanList(d.colors),
    tags: cleanList(d.tags),
    category: d.category?.trim() ? d.category.trim() : null,
    stock_quantity: stock,
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
        ${JSON.stringify(details)}
      );
    `;
  } catch {
    /* ignore audit failures */
  }
}

/**
 * Makes sure a product has one inventory row per size/colour combination.
 */
export async function syncProductVariants(
  context: AdminCtx,
  productId: string,
  sizes: string[],
  colors: string[],
  distributeTotal?: number,
) {
  const sql = getSql();
  const s = sizes.length ? sizes : [""];
  const c = colors.length ? colors : [""];
  const desired: Array<{ size: string; color: string }> = [];
  for (const color of c) for (const size of s) desired.push({ size, color });

  const existing = await sql`
    SELECT id, size, color, reserved_stock
    FROM product_variants
    WHERE product_id::text = ${String(productId)}
  `;

  const key = (v: { size: string; color: string }) => `${v.size}|${v.color}`;
  const have = new Set((existing ?? []).map((v: any) => key(v)));
  const wanted = new Set(desired.map(key));

  const missing = desired.filter((v) => !have.has(key(v)));
  if (missing.length) {
    const total = Math.max(0, Math.round(Number(distributeTotal) || 0));
    const base = Math.floor(total / missing.length);
    const rem = total % missing.length;

    for (let i = 0; i < missing.length; i++) {
      const v = missing[i];
      const varId = `var_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const qty = base + (i < rem ? 1 : 0);
      await sql`
        INSERT INTO product_variants (id, product_id, size, color, stock_quantity)
        VALUES (${varId}, ${String(productId)}, ${v.size}, ${v.color}, ${qty});
      `;
    }
  }

  const stale = (existing ?? []).filter(
    (v: any) => !wanted.has(key(v)) && Number(v.reserved_stock || 0) === 0,
  );
  if (stale.length) {
    const staleIds = stale.map((v: any) => String(v.id));
    await sql`
      DELETE FROM product_variants
      WHERE id::text = ANY(${staleIds}::text[])
    `;
  }
}
