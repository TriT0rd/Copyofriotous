import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth-middleware";
import {
  buildReturnRecord,
  loadReturnWindow,
  type ReturnableItem,
  type ReturnableOrder,
} from "@/lib/returns-utils";
import type { ReturnHistoryEntry, ReturnRecord } from "@/lib/returns-shared";
import { ensureDbSchema, getSql } from "@/lib/db";

export type { ReturnableItem, ReturnableOrder };

export const getReturnSettings = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => loadReturnWindow());

export const getReturnableOrders = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<ReturnableOrder[]> => {
    const settings = await loadReturnWindow();
    const sql = getSql();

    const orders = await sql`
      SELECT id, order_number, created_at, delivered_at, status, currency
      FROM orders
      WHERE user_id = ${context.userId}
      ORDER BY created_at DESC
      LIMIT 100
    `;

    if (orders.length === 0) return [];

    const orderIds = orders.map((o) => o.id);
    const [items, rets] = await Promise.all([
      sql`
        SELECT id, order_id, product_id, variant_id, product_name, product_image, quantity, price, selected_size, selected_color
        FROM order_items
        WHERE order_id = ANY(${orderIds})
      `,
      sql`
        SELECT order_item_id, quantity, status
        FROM returns
        WHERE order_id = ANY(${orderIds})
      `,
    ]);

    const returnedByItem = new Map<string, number>();
    for (const r of rets as any[]) {
      if (r.status === "Rejected" || r.status === "Return Cancelled") continue;
      returnedByItem.set(
        r.order_item_id,
        (returnedByItem.get(r.order_item_id) ?? 0) + Number(r.quantity || 0),
      );
    }

    const itemsByOrderId = new Map<string, any[]>();
    for (const it of items as any[]) {
      const oId = it.order_id;
      if (!itemsByOrderId.has(oId)) itemsByOrderId.set(oId, []);
      itemsByOrderId.get(oId)!.push(it);
    }

    const now = Date.now();
    return (orders as any[]).map((o) => {
      const anchor = o.delivered_at ?? o.created_at;
      const daysSince = Math.floor((now - new Date(anchor).getTime()) / 86400000);
      const daysLeft = settings.windowDays - daysSince;
      const delivered = o.status === "Delivered";
      const windowOpen = daysLeft >= 0;
      const orderEligible = windowOpen && (!settings.requireDelivered || delivered);
      const orderItems = itemsByOrderId.get(o.id) ?? [];

      return {
        orderId: o.id,
        orderNumber: o.order_number,
        createdAt: new Date(o.created_at).toISOString(),
        deliveredAt: o.delivered_at ? new Date(o.delivered_at).toISOString() : null,
        status: o.status,
        currency: o.currency || "INR",
        delivered,
        windowOpen,
        daysLeft,
        eligible: orderEligible,
        items: orderItems.map((it) => {
          const already = returnedByItem.get(it.id) ?? 0;
          const remaining = Math.max(0, Number(it.quantity || 0) - already);
          return {
            orderItemId: it.id,
            productId: it.product_id,
            variantId: it.variant_id,
            productName: it.product_name,
            productImage: it.product_image,
            quantity: Number(it.quantity || 0),
            remaining,
            price: Number(it.price || 0),
            size: it.selected_size,
            color: it.selected_color,
            eligible: orderEligible && remaining > 0,
          };
        }),
      };
    });
  });

export const getMyReturns = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<ReturnRecord[]> => {
    const sql = getSql();
    const rows = await sql`
      SELECT r.id, r.return_number, r.order_id, r.order_item_id, r.quantity, r.status, r.reason, r.comments, r.refund_amount,
        r.items, r.created_at, r.updated_at, o.order_number, o.created_at as order_created_at
      FROM returns r
      LEFT JOIN orders o ON r.order_id = o.id
      WHERE r.user_id = ${context.userId}
      ORDER BY r.created_at DESC
    `;
    return rows.map(buildReturnRecord);
  });

export const getMyReturnHistory = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: { returnId: string }) => ({ returnId: String(d.returnId) }))
  .handler(async (): Promise<ReturnHistoryEntry[]> => {
    return [];
  });

export type RequestReturnInput = {
  orderId: string;
  orderItemId: string;
  quantity: number;
  reason: string;
  message?: string | null;
  images?: string[];
};

export const requestReturn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: RequestReturnInput) => {
    const reason = String(d?.reason ?? "")
      .trim()
      .slice(0, 200);
    if (!d?.orderId || !d?.orderItemId) throw new Error("Missing order item");
    if (!reason) throw new Error("Please choose a reason for the return");
    return {
      orderId: String(d.orderId),
      orderItemId: String(d.orderItemId),
      quantity: Math.max(1, Math.min(99, Math.round(Number(d.quantity) || 1))),
      reason,
      message: d.message ? String(d.message).slice(0, 2000) : null,
      images: (d.images ?? []).slice(0, 5).map((v) => String(v).slice(0, 500)),
    };
  })
  .handler(async ({ data, context }) => {
    const settings = await loadReturnWindow();
    const sql = getSql();

    const orders = await sql`
      SELECT id, order_number, user_id, status, delivered_at, created_at, currency, shipping_email
      FROM orders
      WHERE id = ${data.orderId} AND user_id = ${context.userId}
      LIMIT 1
    `;
    if (orders.length === 0) throw new Error("Order not found");
    const order = orders[0];

    if (settings.requireDelivered && order.status !== "Delivered")
      throw new Error("Returns open once your order has been delivered");

    const anchor = order.delivered_at ?? order.created_at;
    const daysSince = Math.floor((Date.now() - new Date(anchor).getTime()) / 86400000);
    if (daysSince > settings.windowDays)
      throw new Error(`The ${settings.windowDays}-day return window for this order has closed`);

    const items = await sql`
      SELECT id, product_id, variant_id, product_name, product_image, quantity, price, selected_size, selected_color
      FROM order_items
      WHERE id = ${data.orderItemId} AND order_id = ${data.orderId}
      LIMIT 1
    `;
    if (items.length === 0) throw new Error("That item is not part of this order");
    const item = items[0];

    const returnId = `ret_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const returnNumber = `RET-${Date.now().toString(36).toUpperCase()}`;

    await sql`
      INSERT INTO returns (
        id, return_number, order_id, order_item_id, user_id, quantity, status, reason, comments, items
      ) VALUES (
        ${returnId}, ${returnNumber}, ${order.id}, ${item.id}, ${context.userId},
        ${data.quantity}, 'Requested', ${data.reason}, ${data.message}, ${JSON.stringify(data.images)}
      );
    `;

    return {
      ok: true as const,
      returnId,
      returnNumber,
      emailSent: false,
    };
  });

export const cancelMyReturn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { returnId: string }) => ({ returnId: String(d.returnId) }))
  .handler(async ({ data, context }) => {
    const sql = getSql();
    await sql`
      UPDATE returns SET status = 'Return Cancelled', updated_at = NOW()
      WHERE id = ${data.returnId} AND user_id = ${context.userId}
    `;
    return { ok: true as const };
  });
