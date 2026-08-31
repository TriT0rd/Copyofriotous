import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth-middleware";
import { ensureDbSchema, getSql } from "@/lib/db";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import {
  deductOrderInventory,
  restoreOrderInventory,
  InventoryError,
} from "@/lib/inventory.service";

export type OrderLineItem = {
  title: string;
  quantity: number;
  imageUrl: string | null;
  size: string | null;
  color: string | null;
  designSubmissionId: string | null;
  price: { amount: string; currencyCode: string } | null;
};

export type CustomerOrder = {
  id: string;
  name: string;
  processedAt: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  total: { amount: string; currencyCode: string };
  shipping: {
    name: string;
    email: string;
    phone: string | null;
    address: string;
  };
  lineItems: OrderLineItem[];
};

export type PlaceOrderInput = {
  shippingName: string;
  shippingEmail: string;
  shippingPhone?: string | null;
  shippingAddress: string;
  items: Array<{
    productId: string | null;
    designSubmissionId?: string | null;
    productName: string;
    productImage?: string | null;
    quantity: number;
    price: number;
    selectedSize?: string | null;
    selectedColor?: string | null;
  }>;
  shipping?: number;
  currency?: string;
};

export const getMyOrders = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<CustomerOrder[]> => {
    try {
      await ensureDbSchema();
      const sql = getSql();

      const orders = await sql`
        SELECT id, order_number, created_at, total_amount, currency, status, payment_status,
          shipping_name, shipping_email, shipping_phone, shipping_address
        FROM orders
        WHERE user_id::text = ${String(context.userId)}
        ORDER BY created_at DESC
      `;

      if (orders.length === 0) return [];

      const orderIds = orders.map((o) => String(o.id));
      const items = await sql`
        SELECT i.order_id, i.product_name, i.product_image, i.quantity, i.price, i.selected_size, i.selected_color,
          i.design_submission_id, d.preview_data_url
        FROM order_items i
        LEFT JOIN design_submissions d ON i.design_submission_id = d.id
        WHERE i.order_id::text = ANY(${orderIds}::text[])
      `;

      const itemsByOrderId = new Map<string, OrderLineItem[]>();
      for (const item of items as any[]) {
        const oId = String(item.order_id);
        if (!itemsByOrderId.has(oId)) itemsByOrderId.set(oId, []);
        const currency = "INR";
        itemsByOrderId.get(oId)!.push({
          title: item.product_name,
          quantity: Number(item.quantity || 1),
          imageUrl: item.preview_data_url || item.product_image || null,
          size: item.selected_size || null,
          color: item.selected_color || null,
          designSubmissionId: item.design_submission_id || null,
          price: { amount: String(item.price || 0), currencyCode: currency },
        });
      }

      return orders.map((o: any) => ({
        id: String(o.id),
        name: o.order_number,
        processedAt: new Date(o.created_at).toISOString(),
        financialStatus: o.payment_status || "Pending",
        fulfillmentStatus: o.status || "Pending",
        total: { amount: String(o.total_amount || 0), currencyCode: o.currency || "INR" },
        shipping: {
          name: o.shipping_name || "",
          email: o.shipping_email || "",
          phone: o.shipping_phone || null,
          address: o.shipping_address || "",
        },
        lineItems: itemsByOrderId.get(String(o.id)) || [],
      }));
    } catch (e) {
      console.warn("getMyOrders error", e);
      return [];
    }
  });

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: PlaceOrderInput) => {
    const name = str(d?.shippingName, 120);
    const email = str(d?.shippingEmail, 255);
    const address = str(d?.shippingAddress, 1000);
    if (!name || !email || !address) throw new Error("Missing shipping details");
    if (!Array.isArray(d.items) || d.items.length === 0) throw new Error("Your bag is empty");
    return {
      shippingName: name,
      shippingEmail: email,
      shippingPhone: str(d.shippingPhone, 30) || null,
      shippingAddress: address,
      currency: str(d.currency, 8) || "INR",
      shipping: Number.isFinite(d.shipping) ? Number(d.shipping) : 0,
      items: d.items.map((i) => ({
        productId: typeof i.productId === "string" ? i.productId : null,
        designSubmissionId: typeof i.designSubmissionId === "string" ? i.designSubmissionId : null,
        productName: str(i.productName, 200) || "Item",
        productImage: typeof i.productImage === "string" ? i.productImage.slice(0, 2000) : null,
        quantity: Math.max(1, Math.min(99, Math.round(Number(i.quantity) || 1))),
        selectedSize: str(i.selectedSize, 40) || null,
        selectedColor: str(i.selectedColor, 40) || null,
      })),
    };
  })
  .handler(async ({ data, context }) => {
    await ensureDbSchema();
    const sql = getSql();

    const productIds = data.items.map((i) => i.productId).filter((v): v is string => !!v);
    const priceById = new Map<string, number>();
    if (productIds.length) {
      const prods = await sql`
        SELECT id, price FROM products WHERE id::text = ANY(${productIds}::text[])
      `;
      for (const p of prods as any[]) priceById.set(String(p.id), Number(p.price || 0));
    }

    const CUSTOM_PRICE = 1499;
    const items = data.items.map((i) => {
      const price = i.productId ? (priceById.get(i.productId) ?? CUSTOM_PRICE) : CUSTOM_PRICE;
      return { ...i, price, subtotal: price * i.quantity };
    });

    const itemsTotal = items.reduce((s, i) => s + i.subtotal, 0);
    const shipping = itemsTotal >= 1999 ? 0 : 79;
    const total = itemsTotal + shipping;

    const orderId = `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const orderNumber = `RIO-${Date.now().toString(36).toUpperCase()}`;

    // Atomically check and deduct inventory before finalizing the order
    try {
      await deductOrderInventory(
        orderId,
        items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          selectedSize: i.selectedSize,
          selectedColor: i.selectedColor,
        })),
        String(context.userId),
      );
    } catch (err) {
      if (err instanceof InventoryError) {
        throw new Error(err.message);
      }
      throw new Error("Unable to reserve inventory for your items. Please try again.");
    }

    await sql`
      INSERT INTO orders (
        id, user_id, order_number, subtotal, discount_amount, shipping_charge, tax_amount, total_amount,
        currency, status, payment_status, payment_method, stock_state, shipping_name, shipping_email, shipping_phone, shipping_address
      ) VALUES (
        ${orderId}, ${String(context.userId)}, ${orderNumber}, ${itemsTotal}, 0, ${shipping}, 0, ${total},
        ${data.currency}, 'Pending', 'Pending', 'COD', 'Deducted', ${data.shippingName}, ${data.shippingEmail}, ${data.shippingPhone}, ${data.shippingAddress}
      );
    `;

    for (const i of items) {
      const itemId = `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      await sql`
        INSERT INTO order_items (
          id, order_id, product_id, design_submission_id, product_name, product_image, quantity, price, selected_size, selected_color, subtotal
        ) VALUES (
          ${itemId}, ${orderId}, ${i.productId}, ${i.designSubmissionId}, ${i.productName}, ${i.productImage},
          ${i.quantity}, ${i.price}, ${i.selectedSize}, ${i.selectedColor}, ${i.subtotal}
        );
      `;
    }

    // Clear cart in Neon DB
    await sql`
      INSERT INTO carts (user_id, items, updated_at)
      VALUES (${context.userId}, '[]'::jsonb, NOW())
      ON CONFLICT (user_id) DO UPDATE SET items = '[]'::jsonb, updated_at = NOW();
    `;

    // Attempt to notify store admins in background
    sendTemplateEmail("admin-order-notification", data.shippingEmail, {
      templateData: {
        orderId,
        orderNumber,
        customerName: data.shippingName,
        customerEmail: data.shippingEmail,
        total: `${data.currency} ${total.toLocaleString("en-IN")}`,
        itemsCount: items.reduce((s, i) => s + i.quantity, 0),
        placedAt: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      },
    }).catch((err) => console.warn("[Order Service] Email notification notice:", err));

    return {
      ok: true,
      orderId,
      orderNumber,
      total,
      shipping,
    };
  });

export const cancelMyOrder = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { orderId: string; reason?: string }) => ({
    orderId: String(d.orderId),
    reason: d.reason ? String(d.reason).slice(0, 200) : "Cancelled by customer",
  }))
  .handler(async ({ data, context }) => {
    await ensureDbSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT id, user_id, status, order_number FROM orders
      WHERE id::text = ${data.orderId} AND user_id::text = ${String(context.userId)}
      LIMIT 1
    `;
    if (rows.length === 0) throw new Error("Order not found");
    if (["Shipped", "Delivered", "Cancelled", "Returned"].includes(rows[0].status)) {
      throw new Error(
        `Order cannot be cancelled because it is already ${rows[0].status.toLowerCase()}`,
      );
    }
    const res = await restoreOrderInventory(data.orderId, data.reason, context.userId);
    return { ok: true, restored: res.restoredCount, alreadyRestored: res.alreadyRestored };
  });
