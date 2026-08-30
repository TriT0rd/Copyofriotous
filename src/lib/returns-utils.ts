import type { ReturnRecord } from "@/lib/returns-shared";
import { getSql } from "@/lib/db";

export type ReturnableItem = {
  orderItemId: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  productImage: string | null;
  quantity: number;
  remaining: number;
  price: number;
  size: string | null;
  color: string | null;
  eligible: boolean;
};

export type ReturnableOrder = {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  deliveredAt: string | null;
  status: string;
  currency: string;
  delivered: boolean;
  windowOpen: boolean;
  daysLeft: number;
  eligible: boolean;
  items: ReturnableItem[];
};

export function buildReturnRecord(row: any): ReturnRecord {
  return {
    ...row,
    order_number: row.order_number ?? null,
    order_created_at: row.order_created_at ?? null,
    images: Array.isArray(row.images) ? row.images : [],
  } as ReturnRecord;
}

export type AdminReturnRecord = ReturnRecord & {
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: string | null;
};

export function buildAdminReturnRecord(row: any): AdminReturnRecord {
  return {
    ...buildReturnRecord(row),
    customer_name: row.shipping_name ?? null,
    customer_email: row.shipping_email ?? null,
    customer_phone: row.shipping_phone ?? null,
    shipping_address: row.shipping_address ?? null,
  };
}

export async function loadReturnWindow(): Promise<{
  windowDays: number;
  requireDelivered: boolean;
}> {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT window_days, require_delivered FROM return_settings WHERE id = 'default' LIMIT 1
    `;
    if (rows.length > 0) {
      return {
        windowDays: Number(rows[0].window_days || 7),
        requireDelivered: Boolean(rows[0].require_delivered),
      };
    }
  } catch {
    /* fallback defaults */
  }
  return { windowDays: 7, requireDelivered: true };
}
