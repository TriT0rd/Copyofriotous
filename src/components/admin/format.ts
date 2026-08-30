export function money(value: number | string, currency = "INR") {
  const n = Number(value || 0);
  const symbol = currency === "INR" ? "₹" : `${currency} `;
  return `${symbol}${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function dateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const STATUS_TONE: Record<string, string> = {
  Pending: "bg-amber-500/15 text-amber-500",
  Confirmed: "bg-sky-500/15 text-sky-400",
  Processing: "bg-sky-500/15 text-sky-400",
  Packed: "bg-indigo-500/15 text-indigo-400",
  Shipped: "bg-violet-500/15 text-violet-400",
  "Out for Delivery": "bg-violet-500/15 text-violet-400",
  Delivered: "bg-emerald-500/15 text-emerald-400",
  Cancelled: "bg-muted text-muted-foreground",
  Returned: "bg-orange-500/15 text-orange-400",
  Refunded: "bg-orange-500/15 text-orange-400",
  Paid: "bg-emerald-500/15 text-emerald-400",
  Failed: "bg-destructive/15 text-destructive",
};
