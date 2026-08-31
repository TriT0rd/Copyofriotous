/**
 * Server-only email layer for return notifications.
 *
 * Provider agnostic: the only place that knows how a mail is actually sent is
 * `deliver()` below. Today it supports a generic HTTP provider configured via
 * server env vars (RESEND_API_KEY + RETURN_EMAIL_FROM). If no provider is
 * configured the notification is recorded as `pending` so nothing is lost and
 * an admin can retry it later — the return itself never fails.
 */
import type { ReturnEmailEvent } from "@/lib/returns-shared";

type ReturnLike = {
  id: string;
  return_number: string;
  order_number: string | null;
  product_name: string;
  quantity: number;
  reason: string;
  status: string;
  rejection_reason: string | null;
  admin_message: string | null;
  pickup_details: string | null;
  refund_amount: number | null;
  refund_reference: string | null;
  refunded_at: string | null;
  currency: string;
};

const BRAND = "RIOTOUS";

export function emailContent(event: ReturnEmailEvent, r: ReturnLike) {
  const orderId = r.order_number ?? r.id.slice(0, 8);
  const base = [
    `Return ID: ${r.return_number}`,
    `Order ID: ${orderId}`,
    `Product: ${r.product_name}`,
    `Quantity: ${r.quantity}`,
    `Reason: ${r.reason}`,
    `Current status: ${r.status}`,
  ];

  switch (event) {
    case "requested":
      return {
        subject: `Return Request Received - Order #${orderId}`,
        lines: [
          "We've received your return request.",
          "",
          ...base,
          "",
          "What happens next: our team reviews your request, then you'll get an email once it's approved or rejected. If approved we'll schedule a pickup.",
        ],
      };
    case "approved":
      return {
        subject: `Your Return Has Been Approved - Return #${r.return_number}`,
        lines: [
          "Good news — your return has been approved.",
          "",
          ...base,
          r.admin_message ? `\nNote from our team: ${r.admin_message}` : "",
          "",
          "Next steps: keep the item with its original packaging. We'll email you again once the pickup is scheduled.",
        ],
      };
    case "rejected":
      return {
        subject: `Return Request Update - Return #${r.return_number}`,
        lines: [
          "Your return request could not be approved.",
          "",
          ...base,
          `\nReason: ${r.rejection_reason ?? "Not specified"}`,
          "",
          "If you think this is a mistake, reply to this email or raise a support request from your account.",
        ],
      };
    case "pickup_scheduled":
      return {
        subject: `Return Pickup Scheduled - Return #${r.return_number}`,
        lines: [
          "Your return pickup has been scheduled.",
          "",
          ...base,
          r.pickup_details ? `\nPickup details: ${r.pickup_details}` : "",
        ],
      };
    case "received":
      return {
        subject: `Returned Item Received - Return #${r.return_number}`,
        lines: ["We've received your returned item. ", "", ...base],
      };
    case "refund_processing":
      return {
        subject: `Your Refund Is Being Processed - Return #${r.return_number}`,
        lines: ["Your refund is now being processed.", "", ...base],
      };
    case "refunded":
      return {
        subject: `Refund Completed - Return #${r.return_number}`,
        lines: [
          "Your refund has been completed.",
          "",
          ...base,
          r.refund_amount != null
            ? `\nRefund amount: ${r.currency} ${Number(r.refund_amount).toFixed(2)}`
            : "",
          r.refunded_at ? `Refund date: ${new Date(r.refunded_at).toUTCString()}` : "",
          r.refund_reference ? `Reference: ${r.refund_reference}` : "",
        ],
      };
  }
}

function isProviderConfigured() {
  return !!process.env["RESEND_API_KEY"];
}

/** The single provider-specific call. Swap this to change email provider. */
async function deliver(to: string, subject: string, text: string) {
  const key = process.env["RESEND_API_KEY"];
  const from =
    process.env["RETURN_EMAIL_FROM"] ||
    process.env["EMAIL_FROM"] ||
    "RIOTOUS <onboarding@resend.dev>";
  if (!key) throw new Error("no_email_provider_configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) {
    throw new Error(`Email provider error ${res.status}: ${await res.text()}`);
  }
}

import { ensureDbSchema, getSql } from "@/lib/db";

/**
 * Records + sends one return email exactly once per (return, event).
 * Never throws: email problems must not break the return workflow.
 */
export async function notifyReturnEvent(
  event: ReturnEmailEvent,
  ret: ReturnLike,
  recipient: string,
): Promise<{ sent: boolean; reason?: string }> {
  const content = emailContent(event, ret);
  const subject = content.subject;
  const text = `${BRAND}\n\n${content.lines.filter(Boolean).join("\n")}\n\n— Team ${BRAND}`;

  try {
    await ensureDbSchema();
    const sql = getSql();

    // Dedupe: unique (return_id, event)
    const existingRows = await sql`
      SELECT id, status, attempts FROM return_notifications
      WHERE return_id = ${ret.id} AND event = ${event}
      LIMIT 1
    `;
    const existing = existingRows[0] as
      { id: string; status: string; attempts: number } | undefined;

    if (existing?.status === "sent") return { sent: true };

    let rowId = existing?.id;
    if (!rowId) {
      rowId = `notif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      await sql`
        INSERT INTO return_notifications (id, return_id, event, recipient, subject, status)
        VALUES (${rowId}, ${ret.id}, ${event}, ${recipient}, ${subject}, 'pending')
      `;
    }

    if (!isProviderConfigured()) {
      if (rowId) {
        await sql`
          UPDATE return_notifications
          SET status = 'pending', error = 'No email provider configured (set RESEND_API_KEY and RETURN_EMAIL_FROM)', recipient = ${recipient}, subject = ${subject}
          WHERE id = ${rowId}
        `;
      }
      return { sent: false, reason: "no_provider" };
    }

    try {
      await deliver(recipient, subject, text);
      if (rowId) {
        const attempts = (Number(existing?.attempts) || 0) + 1;
        await sql`
          UPDATE return_notifications
          SET status = 'sent', sent_at = CURRENT_TIMESTAMP, error = NULL, attempts = ${attempts}
          WHERE id = ${rowId}
        `;
      }
      return { sent: true };
    } catch (err) {
      if (rowId) {
        const attempts = (Number(existing?.attempts) || 0) + 1;
        const errMsg = err instanceof Error ? err.message.slice(0, 500) : "Unknown error";
        await sql`
          UPDATE return_notifications
          SET status = 'failed', error = ${errMsg}, attempts = ${attempts}
          WHERE id = ${rowId}
        `;
      }
      return { sent: false, reason: "failed" };
    }
  } catch {
    return { sent: false, reason: "log_failed" };
  }
}
