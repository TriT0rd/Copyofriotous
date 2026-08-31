import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth-middleware";
import { assertAdmin, logAudit } from "@/lib/admin-utils";
import {
  buildAdminReturnRecord,
  loadReturnWindow,
  type AdminReturnRecord,
} from "@/lib/returns-utils";
import { type ReturnStatus } from "@/lib/returns-shared";
import { getSql } from "@/lib/db";
import { restoreReturnInventory } from "@/lib/inventory.service";

export type { AdminReturnRecord };

export const adminListReturns = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminReturnRecord[]> => {
    await assertAdmin(context);
    const sql = getSql();
    const rows = await sql`
      SELECT r.id, r.return_number, r.order_id, r.order_item_id, r.quantity, r.status, r.reason, r.comments, r.refund_amount,
        r.items, r.created_at, r.updated_at, o.order_number, o.created_at as order_created_at,
        o.shipping_name, o.shipping_email, o.shipping_phone, o.shipping_address
      FROM returns r
      LEFT JOIN orders o ON r.order_id = o.id
      ORDER BY r.created_at DESC
      LIMIT 500
    `;
    return rows.map(buildAdminReturnRecord);
  });

export const adminReturnHistory = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: { returnId: string }) => ({ returnId: String(d.returnId) }))
  .handler(async (): Promise<any[]> => {
    return [];
  });

export type ReturnEmailLog = {
  id: string;
  event: string;
  recipient: string;
  subject: string | null;
  status: string;
  error: string | null;
  sent_at: string | null;
  created_at: string;
};

export const adminReturnEmails = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: { returnId: string }) => ({ returnId: String(d.returnId) }))
  .handler(async (): Promise<ReturnEmailLog[]> => {
    return [];
  });

export type AdminReturnPatch = {
  returnId: string;
  status?: ReturnStatus;
  adminMessage?: string | null;
  rejectionReason?: string | null;
  pickupDetails?: string | null;
  refundStatus?: string;
  refundAmount?: number | null;
  refundReference?: string | null;
};

export const adminUpdateReturn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: AdminReturnPatch) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sql = getSql();

    if (data.status) {
      await sql`UPDATE returns SET status = ${data.status}, updated_at = NOW() WHERE id = ${data.returnId}`;

      // If return item reached Received or Refunded state, restore stock idempotently
      if (data.status === "Received" || data.status === "Refunded") {
        const ret = await sql`
          SELECT id, order_id, order_item_id, quantity FROM returns WHERE id = ${data.returnId} LIMIT 1
        `;
        if (ret.length > 0 && ret[0].order_item_id) {
          await restoreReturnInventory({
            returnId: String(ret[0].id),
            orderId: String(ret[0].order_id),
            orderItemId: String(ret[0].order_item_id),
            quantity: Number(ret[0].quantity || 1),
            actorId: context.userId,
          });
        }
      }
    }
    if (data.refundAmount !== undefined && data.refundAmount !== null) {
      await sql`UPDATE returns SET refund_amount = ${data.refundAmount}, updated_at = NOW() WHERE id = ${data.returnId}`;
    }

    await logAudit(context, "return.update", "return", data.returnId, { status: data.status });
    return { ok: true as const, emailSent: false };
  });

export const adminGetReturnSettings = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    return loadReturnWindow();
  });

export const adminSetReturnSettings = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: { windowDays: number; requireDelivered: boolean }) => ({
    windowDays: Math.max(1, Math.min(180, Math.round(Number(d.windowDays) || 7))),
    requireDelivered: !!d.requireDelivered,
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sql = getSql();
    await sql`
      INSERT INTO return_settings (id, window_days, require_delivered, updated_at)
      VALUES ('default', ${data.windowDays}, ${data.requireDelivered}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        window_days = EXCLUDED.window_days,
        require_delivered = EXCLUDED.require_delivered,
        updated_at = NOW();
    `;
    await logAudit(context, "returns.settings", "store_settings", "returns", data);
    return { ok: true as const };
  });
