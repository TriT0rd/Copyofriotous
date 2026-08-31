import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth-middleware";
import {
  ARCHIVED_TAG,
  assertAdmin,
  logAudit,
  normalizeProductInput,
  slugify,
  syncProductVariants,
  type ProductInput,
} from "@/lib/admin-utils";
import { ensureDbSchema, getSql } from "@/lib/db";
import {
  addInventory,
  removeInventory,
  setInventory,
  listInventoryTransactions,
  restoreOrderInventory,
  type InventoryTransactionRecord,
} from "@/lib/inventory.service";

export type { ProductInput, InventoryTransactionRecord };

export type AdminProduct = {
  id: string;
  title: string;
  handle: string;
  status: "ACTIVE" | "DRAFT";
  totalInventory: number;
  featuredImage: string | null;
  images: string[];
  price: string;
  description: string | null;
  sizes: string[];
  colors: string[];
  tags: string[];
  category: string | null;
  sizeStock?: Record<string, number>;
};

export type AdminOrderItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  product_image: string | null;
  quantity: number;
  price: number;
  selected_size: string | null;
  selected_color: string | null;
  subtotal: number;
  design_submission_id: string | null;
  design_preview: string | null;
};

export type AdminOrder = {
  id: string;
  order_number: string;
  created_at: string;
  total_amount: number;
  subtotal: number;
  discount_amount: number;
  discount_code: string | null;
  shipping_charge: number;
  tax_amount: number;
  currency: string;
  status: string;
  payment_status: string;
  payment_method: string;
  stock_state: string;
  shipping_name: string;
  shipping_email: string;
  shipping_phone: string | null;
  shipping_address: string;
  billing_address: string | null;
  courier_name: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  admin_notes: string | null;
  items: AdminOrderItem[];
};

export const ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Processing",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Delivered",
  "Cancelled",
  "Returned",
  "Refunded",
] as const;

export const PAYMENT_STATUSES = ["Pending", "Paid", "Failed", "Refunded"] as const;

export const checkIsAdmin = createServerFn({ method: "GET" })
  .inputValidator((d?: { token?: string }) => ({
    token: typeof d?.token === "string" ? d.token : undefined,
  }))
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<boolean> => {
    return context.isAdmin;
  });

export const adminListProducts = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminProduct[]> => {
    await assertAdmin(context);
    await ensureDbSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT id, name, slug, description, price, images, sizes, colors, tags, stock_quantity, is_active, category
      FROM products
      ORDER BY updated_at DESC
    `;

    const productIds = rows.map((p: any) => String(p.id));
    let variants: any[] = [];
    if (productIds.length > 0) {
      variants = await sql`
        SELECT product_id, size, stock_quantity
        FROM product_variants
        WHERE product_id::text = ANY(${productIds}::text[])
      `;
    }

    const sizeStockByProd = new Map<string, Record<string, number>>();
    for (const v of variants) {
      const pid = String(v.product_id);
      if (!sizeStockByProd.has(pid)) sizeStockByProd.set(pid, {});
      const sz = String(v.size || "");
      if (sz) {
        sizeStockByProd.get(pid)![sz] = Number(v.stock_quantity || 0);
      }
    }

    return rows.map((p: any) => ({
      id: String(p.id),
      title: p.name,
      handle: p.slug,
      status: p.is_active ? "ACTIVE" : "DRAFT",
      totalInventory: Number(p.stock_quantity ?? 0),
      featuredImage: Array.isArray(p.images) ? p.images[0] : null,
      images: Array.isArray(p.images) ? p.images : [],
      price: String(p.price),
      description: p.description ?? null,
      sizes: Array.isArray(p.sizes) ? p.sizes : [],
      colors: Array.isArray(p.colors) ? p.colors : [],
      tags: Array.isArray(p.tags) ? p.tags : [],
      category: p.category ?? null,
      sizeStock: sizeStockByProd.get(String(p.id)) || {},
    }));
  });

export const adminAddInventory = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { productId: string; quantity: number; reason?: string }) => ({
    productId: String(d.productId),
    quantity: Math.max(1, Math.round(Number(d.quantity) || 1)),
    reason: d.reason ? String(d.reason).slice(0, 120) : "Admin manual add",
  }))
  .handler(async ({ data, context }) => {
    return await addInventory(context, {
      productId: data.productId,
      quantity: data.quantity,
      reason: data.reason,
    });
  });

export const adminRemoveInventory = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { productId: string; quantity: number; reason?: string }) => ({
    productId: String(d.productId),
    quantity: Math.max(1, Math.round(Number(d.quantity) || 1)),
    reason: d.reason ? String(d.reason).slice(0, 120) : "Admin manual remove",
  }))
  .handler(async ({ data, context }) => {
    return await removeInventory(context, {
      productId: data.productId,
      quantity: data.quantity,
      reason: data.reason,
    });
  });

export const adminSetInventory = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { productId: string; quantity: number; reason?: string }) => ({
    productId: String(d.productId),
    quantity: Math.max(0, Math.round(Number(d.quantity) || 0)),
    reason: d.reason ? String(d.reason).slice(0, 120) : "Admin manual set",
  }))
  .handler(async ({ data, context }) => {
    return await setInventory(context, {
      productId: data.productId,
      quantity: data.quantity,
      reason: data.reason,
    });
  });

export const adminDeleteProduct = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { productId: string }) => ({
    productId: String(d.productId),
  }))
  .handler(async ({ data, context }): Promise<{ ok: true; archived: boolean }> => {
    await assertAdmin(context);
    const sql = getSql();

    const refs = await sql`
      SELECT count(*)::int as count FROM order_items WHERE product_id::text = ${data.productId}
    `;

    if ((refs[0]?.count ?? 0) > 0) {
      const row = await sql`SELECT tags FROM products WHERE id::text = ${data.productId} LIMIT 1`;
      const tags: string[] = Array.isArray(row[0]?.tags) ? row[0].tags : [];
      const updatedTags = tags.includes(ARCHIVED_TAG) ? tags : [...tags, ARCHIVED_TAG];

      await sql`
        UPDATE products
        SET is_active = false, tags = ${JSON.stringify(updatedTags)}::jsonb, updated_at = NOW()
        WHERE id::text = ${data.productId}
      `;
      return { ok: true, archived: true };
    }

    await sql`DELETE FROM products WHERE id::text = ${data.productId}`;
    return { ok: true, archived: false };
  });

export const adminSetProductStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { productId: string; status: "ACTIVE" | "DRAFT" }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sql = getSql();
    await sql`
      UPDATE products SET is_active = ${data.status === "ACTIVE"}, updated_at = NOW()
      WHERE id::text = ${data.productId}
    `;
    return { ok: true };
  });

export const adminCreateProduct = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: ProductInput) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const values = normalizeProductInput(data);
    const sql = getSql();
    const productId = `prod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const base = slugify(values.name) || "product";
    const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;

    await sql`
      INSERT INTO products (
        id, name, slug, description, price, currency, images, category, sizes, colors, stock_quantity, is_active, tags
      ) VALUES (
        ${productId}, ${values.name}, ${slug}, ${values.description}, ${values.price}, 'INR',
        ${JSON.stringify(values.images)}::jsonb, ${values.category}, ${JSON.stringify(values.sizes)}::jsonb,
        ${JSON.stringify(values.colors)}::jsonb, ${values.stock_quantity}, ${values.is_active}, ${JSON.stringify(values.tags)}::jsonb
      );
    `;

    await syncProductVariants(
      context,
      productId,
      values.sizes,
      values.colors,
      values.stock_quantity,
      values.sizeStock,
    );

    await logAudit(context, "product.create", "product", productId, {
      name: values.name,
      stock: values.stock_quantity,
    });
    return { ok: true, productId };
  });

export const adminUpdateProduct = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: ProductInput & { productId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (!data.productId) throw new Error("Invalid product data: missing product id");
    const values = normalizeProductInput(data);
    const sql = getSql();

    await sql`
      UPDATE products SET
        name = ${values.name},
        description = ${values.description},
        price = ${values.price},
        images = ${JSON.stringify(values.images)}::jsonb,
        category = ${values.category},
        sizes = ${JSON.stringify(values.sizes)}::jsonb,
        colors = ${JSON.stringify(values.colors)}::jsonb,
        stock_quantity = ${values.stock_quantity},
        is_active = ${values.is_active},
        tags = ${JSON.stringify(values.tags)}::jsonb,
        updated_at = NOW()
      WHERE id::text = ${data.productId}
    `;

    await syncProductVariants(
      context,
      data.productId,
      values.sizes,
      values.colors,
      values.stock_quantity,
      values.sizeStock,
    );
    await logAudit(context, "product.update", "product", data.productId, {
      name: values.name,
      stock: values.stock_quantity,
    });
    return { ok: true };
  });

export type AdminVariant = {
  id: string;
  product_id: string;
  product_name: string;
  product_image: string | null;
  is_active: boolean;
  size: string;
  color: string;
  stock_quantity: number;
  reserved_stock: number;
  low_stock_threshold: number;
};

export const adminListVariants = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminVariant[]> => {
    await assertAdmin(context);
    await ensureDbSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT 
        v.id, v.product_id, v.size, v.color, v.stock_quantity, v.reserved_stock, v.low_stock_threshold,
        p.name as product_name, p.images as product_images, p.is_active
      FROM product_variants v
      LEFT JOIN products p ON v.product_id::text = p.id::text
      ORDER BY v.created_at ASC
    `;

    return rows.map((v: any) => {
      const images = Array.isArray(v.product_images)
        ? v.product_images
        : typeof v.product_images === "string"
          ? JSON.parse(v.product_images)
          : [];
      return {
        id: String(v.id),
        product_id: String(v.product_id),
        product_name: v.product_name ?? "Product",
        product_image: images[0] ?? null,
        is_active: Boolean(v.is_active),
        size: v.size ?? "",
        color: v.color ?? "",
        stock_quantity: Number(v.stock_quantity ?? 0),
        reserved_stock: Number(v.reserved_stock ?? 0),
        low_stock_threshold: Number(v.low_stock_threshold ?? 5),
      };
    });
  });

export const adminAddVariantInventory = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { variantId: string; quantity: number; reason?: string }) => ({
    variantId: String(d.variantId),
    quantity: Math.max(1, Math.round(Number(d.quantity) || 1)),
    reason: d.reason ? String(d.reason).slice(0, 120) : "Admin manual add",
  }))
  .handler(async ({ data, context }) => {
    return await addInventory(context, {
      variantId: data.variantId,
      quantity: data.quantity,
      reason: data.reason,
    });
  });

export const adminRemoveVariantInventory = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { variantId: string; quantity: number; reason?: string }) => ({
    variantId: String(d.variantId),
    quantity: Math.max(1, Math.round(Number(d.quantity) || 1)),
    reason: d.reason ? String(d.reason).slice(0, 120) : "Admin manual remove",
  }))
  .handler(async ({ data, context }) => {
    return await removeInventory(context, {
      variantId: data.variantId,
      quantity: data.quantity,
      reason: data.reason,
    });
  });

export const adminSetVariantInventory = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { variantId: string; quantity: number; reason?: string }) => ({
    variantId: String(d.variantId),
    quantity: Math.max(0, Math.round(Number(d.quantity) || 0)),
    reason: d.reason ? String(d.reason).slice(0, 120) : "Admin manual set",
  }))
  .handler(async ({ data, context }) => {
    return await setInventory(context, {
      variantId: data.variantId,
      quantity: data.quantity,
      reason: data.reason,
    });
  });

export const adminListOrders = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminOrder[]> => {
    try {
      await assertAdmin(context);
      await ensureDbSchema();
      const sql = getSql();
      const orders = await sql`
        SELECT id, order_number, created_at, total_amount, subtotal, discount_amount, discount_code,
          shipping_charge, tax_amount, currency, status, payment_status, payment_method, stock_state,
          shipping_name, shipping_email, shipping_phone, shipping_address, billing_address,
          courier_name, tracking_number, tracking_url, shipped_at, delivered_at, cancelled_at, admin_notes
        FROM orders
        ORDER BY created_at DESC
        LIMIT 500
      `;

      if (orders.length === 0) return [];

      const orderIds = orders.map((o) => String(o.id));
      const items = await sql`
        SELECT i.id, i.order_id, i.product_id, i.product_name, i.product_image, i.quantity, i.price,
          i.selected_size, i.selected_color, i.subtotal, i.design_submission_id,
          d.preview_data_url as design_preview
        FROM order_items i
        LEFT JOIN design_submissions d ON i.design_submission_id = d.id
        WHERE i.order_id::text = ANY(${orderIds}::text[])
      `;

      const itemsByOrderId = new Map<string, AdminOrderItem[]>();
      for (const item of items) {
        const oId = String(item.order_id);
        if (!itemsByOrderId.has(oId)) itemsByOrderId.set(oId, []);
        itemsByOrderId.get(oId)!.push({
          id: String(item.id),
          product_id: item.product_id ? String(item.product_id) : null,
          product_name: (item.product_name as string) || "Item",
          product_image: (item.product_image as string) || null,
          quantity: Number(item.quantity || 1),
          price: Number(item.price || 0),
          selected_size: (item.selected_size as string) || null,
          selected_color: (item.selected_color as string) || null,
          subtotal: Number(item.subtotal || 0),
          design_submission_id: (item.design_submission_id as string) || null,
          design_preview: (item.design_preview as string) || null,
        });
      }

      return orders.map((o: any) => ({
        id: String(o.id),
        order_number: o.order_number,
        created_at: new Date(o.created_at).toISOString(),
        total_amount: Number(o.total_amount || 0),
        subtotal: Number(o.subtotal || 0),
        discount_amount: Number(o.discount_amount || 0),
        discount_code: o.discount_code || null,
        shipping_charge: Number(o.shipping_charge || 0),
        tax_amount: Number(o.tax_amount || 0),
        currency: o.currency || "INR",
        status: o.status || "Pending",
        payment_status: o.payment_status || "Pending",
        payment_method: o.payment_method || "COD",
        stock_state: o.stock_state || "Normal",
        shipping_name: o.shipping_name || "",
        shipping_email: o.shipping_email || "",
        shipping_phone: o.shipping_phone || null,
        shipping_address: o.shipping_address || "",
        billing_address: o.billing_address || null,
        courier_name: o.courier_name || null,
        tracking_number: o.tracking_number || null,
        tracking_url: o.tracking_url || null,
        shipped_at: o.shipped_at ? new Date(o.shipped_at).toISOString() : null,
        delivered_at: o.delivered_at ? new Date(o.delivered_at).toISOString() : null,
        cancelled_at: o.cancelled_at ? new Date(o.cancelled_at).toISOString() : null,
        admin_notes: o.admin_notes || null,
        items: itemsByOrderId.get(String(o.id)) || [],
      }));
    } catch (err) {
      console.warn("[Admin] adminListOrders error:", err);
      return [];
    }
  });

export type OrderPatchInput = {
  orderId: string;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  courierName?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  adminNotes?: string | null;
};

export const adminUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: OrderPatchInput) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sql = getSql();

    if (data.status) {
      if (data.status === "Cancelled" || data.status === "Returned") {
        await restoreOrderInventory(
          data.orderId,
          `Admin set status to ${data.status}`,
          context.userId,
        );
        if (data.status === "Returned") {
          await sql`UPDATE orders SET status = 'Returned', updated_at = NOW() WHERE id::text = ${String(data.orderId)}`;
        }
      } else {
        await sql`UPDATE orders SET status = ${data.status}, updated_at = NOW() WHERE id::text = ${String(data.orderId)}`;
      }
    }
    if (data.paymentStatus) {
      await sql`UPDATE orders SET payment_status = ${data.paymentStatus}, updated_at = NOW() WHERE id::text = ${String(data.orderId)}`;
    }
    if (data.courierName !== undefined) {
      await sql`UPDATE orders SET courier_name = ${data.courierName}, updated_at = NOW() WHERE id::text = ${String(data.orderId)}`;
    }
    if (data.trackingNumber !== undefined) {
      await sql`UPDATE orders SET tracking_number = ${data.trackingNumber}, updated_at = NOW() WHERE id::text = ${String(data.orderId)}`;
    }
    if (data.trackingUrl !== undefined) {
      await sql`UPDATE orders SET tracking_url = ${data.trackingUrl}, updated_at = NOW() WHERE id::text = ${String(data.orderId)}`;
    }
    if (data.adminNotes !== undefined) {
      await sql`UPDATE orders SET admin_notes = ${data.adminNotes}, updated_at = NOW() WHERE id::text = ${String(data.orderId)}`;
    }

    await logAudit(context, "order.update", "order", data.orderId, { status: data.status });
    return { ok: true };
  });

export const adminBulkUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { orderIds: string[]; status: string }) => ({
    orderIds: (d.orderIds ?? []).map(String).slice(0, 200),
    status: String(d.status),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sql = getSql();
    if (!data.orderIds.length) return { ok: true, updated: 0 };

    if (data.status === "Cancelled" || data.status === "Returned") {
      for (const orderId of data.orderIds) {
        await restoreOrderInventory(
          orderId,
          `Admin bulk ${data.status.toLowerCase()}`,
          context.userId,
        );
      }
      if (data.status === "Returned") {
        await sql`
          UPDATE orders
          SET status = 'Returned', updated_at = NOW()
          WHERE id::text = ANY(${data.orderIds}::text[])
        `;
      }
    } else {
      await sql`
        UPDATE orders
        SET status = ${data.status}, updated_at = NOW()
        WHERE id::text = ANY(${data.orderIds}::text[])
      `;
    }

    await logAudit(context, "order.bulk_update", "order", null, {
      status: data.status,
      count: data.orderIds.length,
    });
    return { ok: true, updated: data.orderIds.length };
  });

export const adminListInventoryTransactions = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator(
    (d?: { productId?: string; variantId?: string; orderId?: string; limit?: number }) => ({
      productId: d?.productId ? String(d.productId) : undefined,
      variantId: d?.variantId ? String(d.variantId) : undefined,
      orderId: d?.orderId ? String(d.orderId) : undefined,
      limit: d?.limit ? Number(d.limit) : 50,
    }),
  )
  .handler(async ({ data, context }): Promise<InventoryTransactionRecord[]> => {
    return await listInventoryTransactions(context, data);
  });

export const adminGetDesign = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sql = getSql();
    const rows = await sql`
      SELECT id, color_name, placement, product_title, preview_data_url, canvases, created_at, customer_email, customer_name
      FROM design_submissions
      WHERE id::text = ${String(data.id)}
      LIMIT 1
    `;
    return rows[0] || null;
  });
