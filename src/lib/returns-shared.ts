/** Shared, client-safe constants for the return management system. */

export const RETURN_STATUSES = [
  "Return Requested",
  "Under Review",
  "Approved",
  "Rejected",
  "Pickup Scheduled",
  "Picked Up",
  "Received",
  "Refund Processing",
  "Refunded",
  "Return Cancelled",
] as const;

export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const REFUND_STATUSES = [
  "Refund Pending",
  "Refund Processing",
  "Refunded",
  "Refund Failed",
] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** Allowed next steps — mirrors private.return_transition_allowed in the database. */
export const NEXT_STATUSES: Record<ReturnStatus, ReturnStatus[]> = {
  "Return Requested": ["Under Review", "Approved", "Rejected", "Return Cancelled"],
  "Under Review": ["Approved", "Rejected", "Return Cancelled"],
  Approved: ["Pickup Scheduled", "Return Cancelled"],
  Rejected: [],
  "Pickup Scheduled": ["Picked Up", "Return Cancelled"],
  "Picked Up": ["Received"],
  Received: ["Refund Processing", "Refunded"],
  "Refund Processing": ["Refunded"],
  Refunded: [],
  "Return Cancelled": [],
};

/** The happy path shown to the customer as a timeline. */
export const RETURN_TIMELINE: ReturnStatus[] = [
  "Return Requested",
  "Under Review",
  "Approved",
  "Pickup Scheduled",
  "Picked Up",
  "Received",
  "Refund Processing",
  "Refunded",
];

export const RETURN_STATUS_TONE: Record<string, string> = {
  "Return Requested": "bg-amber-500/15 text-amber-500",
  "Under Review": "bg-sky-500/15 text-sky-400",
  Approved: "bg-emerald-500/15 text-emerald-400",
  Rejected: "bg-destructive/15 text-destructive",
  "Pickup Scheduled": "bg-indigo-500/15 text-indigo-400",
  "Picked Up": "bg-violet-500/15 text-violet-400",
  Received: "bg-teal-500/15 text-teal-400",
  "Refund Processing": "bg-sky-500/15 text-sky-400",
  Refunded: "bg-emerald-500/15 text-emerald-400",
  "Return Cancelled": "bg-muted text-muted-foreground",
};

export const REFUND_STATUS_TONE: Record<string, string> = {
  "Refund Pending": "bg-amber-500/15 text-amber-500",
  "Refund Processing": "bg-sky-500/15 text-sky-400",
  Refunded: "bg-emerald-500/15 text-emerald-400",
  "Refund Failed": "bg-destructive/15 text-destructive",
};

export const RETURN_REASONS = [
  "Wrong size",
  "Damaged / defective",
  "Wrong item received",
  "Not as described",
  "Quality issue",
  "Changed my mind",
  "Other",
];

export type ReturnRecord = {
  id: string;
  return_number: string;
  order_id: string;
  order_number: string | null;
  order_created_at: string | null;
  order_item_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  product_image: string | null;
  selected_size: string | null;
  selected_color: string | null;
  quantity: number;
  unit_price: number;
  currency: string;
  reason: string;
  customer_message: string | null;
  images: string[];
  status: ReturnStatus;
  admin_message: string | null;
  rejection_reason: string | null;
  refund_status: RefundStatus;
  refund_amount: number | null;
  refund_reference: string | null;
  refunded_at: string | null;
  pickup_details: string | null;
  inventory_restored: boolean;
  created_at: string;
  updated_at: string;
};

export type ReturnHistoryEntry = {
  id: string;
  previous_status: string | null;
  new_status: string;
  changed_by_role: string;
  note: string | null;
  created_at: string;
};

/** Email events, one per meaningful status change. */
export const RETURN_EMAIL_EVENTS = {
  requested: "requested",
  approved: "approved",
  rejected: "rejected",
  pickup_scheduled: "pickup_scheduled",
  received: "received",
  refund_processing: "refund_processing",
  refunded: "refunded",
} as const;

export type ReturnEmailEvent = (typeof RETURN_EMAIL_EVENTS)[keyof typeof RETURN_EMAIL_EVENTS];

/** Maps a status to the email event that should fire once when reached. */
export function emailEventForStatus(status: string): ReturnEmailEvent | null {
  switch (status) {
    case "Return Requested":
      return "requested";
    case "Approved":
      return "approved";
    case "Rejected":
      return "rejected";
    case "Pickup Scheduled":
      return "pickup_scheduled";
    case "Received":
      return "received";
    case "Refund Processing":
      return "refund_processing";
    case "Refunded":
      return "refunded";
    default:
      return null;
  }
}
