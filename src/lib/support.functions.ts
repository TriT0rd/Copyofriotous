import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth-middleware";
import { ensureDbSchema, getSql } from "@/lib/db";

export type SupportRequest = {
  id: string;
  request_type: "return" | "refund" | "support";
  order_name: string | null;
  reason: string | null;
  details: string;
  status: string;
  created_at: string;
};

export const getMySupportRequests = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<SupportRequest[]> => {
    try {
      await ensureDbSchema();
      const sql = getSql();
      const rows = await sql`
        SELECT id, request_type, order_name, reason, details, status, created_at
        FROM support_requests
        WHERE user_id = ${context.userId}
        ORDER BY created_at DESC
      `;
      return rows.map((r: any) => ({
        id: r.id,
        request_type: r.request_type,
        order_name: r.order_name || null,
        reason: r.reason || null,
        details: r.details || "",
        status: r.status || "Open",
        created_at: new Date(r.created_at).toISOString(),
      }));
    } catch {
      return [];
    }
  });

export const submitSupportRequest = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator(
    (d: {
      request_type: string;
      order_name?: string | null;
      reason?: string | null;
      details: string;
      contact_email?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await ensureDbSchema();
    const sql = getSql();
    const reqId = `sup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    await sql`
      INSERT INTO support_requests (
        id, user_id, request_type, order_name, reason, details, contact_email
      ) VALUES (
        ${reqId}, ${context.userId}, ${data.request_type}, ${data.order_name || null}, ${data.reason || null}, ${data.details}, ${data.contact_email || context.user.email}
      );
    `;

    return { ok: true, id: reqId };
  });
