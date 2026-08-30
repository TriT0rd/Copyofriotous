import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { Loader2, Package, ArrowRight, LifeBuoy, CheckCircle2 } from "lucide-react";
import { getMyOrders, type CustomerOrder } from "@/lib/orders.functions";
import { formatPrice } from "@/lib/catalog";
import { useAuth } from "@/hooks/use-auth";
import { CustomerReturns } from "@/components/returns/customer-returns";
import {
  getMySupportRequests,
  submitSupportRequest,
  type SupportRequest,
} from "@/lib/support.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/account/returns")({
  head: () => ({
    meta: [
      { title: "Returns & Support — RIOTOUS" },
      {
        name: "description",
        content:
          "Request a return within 7 days of delivery or raise a support request with the RIOTOUS team.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReturnsPage,
});

const RETURN_WINDOW_DAYS = 7;

type SupportRequest = {
  id: string;
  request_type: "return" | "refund" | "support";
  order_name: string | null;
  reason: string | null;
  details: string;
  status: string;
  created_at: string;
};

function daysSince(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function ReturnsPage() {
  const { user } = useAuth();
  const fetchOrders = useServerFn(getMyOrders);
  const { data: orders, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => fetchOrders(),
  });

  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(false);

  const refreshRequests = async () => {
    if (!user) return;
    setLoadingReqs(true);
    try {
      const token = localStorage.getItem("riotous_session") || "";
      const data = await getMySupportRequests({ headers: { Authorization: `Bearer ${token}` } });
      setRequests(data || []);
    } catch {
      setRequests([]);
    }
    setLoadingReqs(false);
  };

  useEffect(() => {
    refreshRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const expired = useMemo(
    () => (orders ?? []).filter((o) => daysSince(o.processedAt) > RETURN_WINDOW_DAYS),
    [orders],
  );

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-16 md:px-10 md:py-24">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Account
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">Returns & Support</h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Returns are open for {RETURN_WINDOW_DAYS} days from the order date. After that window,
            our team can still help — raise a support request below.
          </p>
        </div>
        <Link
          to="/account/orders"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          ← Back to orders
        </Link>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && orders && orders.length === 0 && (
        <div className="rounded-2xl border border-border bg-secondary/40 py-20 text-center">
          <Package className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-4 text-lg font-semibold">No orders yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You'll be able to request returns once you have an order.
          </p>
          <Link
            to="/shop"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90"
          >
            Start shopping <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {!isLoading && orders && orders.length > 0 && (
        <div className="space-y-12">
          {/* Returns */}
          <CustomerReturns windowDays={RETURN_WINDOW_DAYS} />

          {/* Past window - support only */}
          {expired.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <LifeBuoy className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-bold tracking-tight">
                  Past return window — support only
                </h2>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                These orders are outside the {RETURN_WINDOW_DAYS}-day return window. You can still
                raise a support request and our team will review it.
              </p>
              <div className="space-y-4">
                {expired.map((o) => (
                  <OrderRequestCard
                    key={o.id}
                    order={o}
                    daysLeft={0}
                    contactEmail={user?.email ?? ""}
                    onSubmitted={refreshRequests}
                    mode="support"
                  />
                ))}
              </div>
            </section>
          )}

          {/* Existing requests */}
          <section>
            <div className="mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-bold tracking-tight">Your requests</h2>
            </div>
            {loadingReqs ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : requests.length === 0 ? (
              <p className="text-sm text-muted-foreground">You haven't raised any requests yet.</p>
            ) : (
              <ul className="space-y-3">
                {requests.map((r) => (
                  <li key={r.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                          {r.request_type}
                        </span>
                        {r.order_name && (
                          <span className="text-sm font-medium">{r.order_name}</span>
                        )}
                      </div>
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        {r.status}
                      </span>
                    </div>
                    {r.reason && (
                      <p className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
                        Reason: {r.reason}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-foreground/80">{r.details}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("en-IN")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

const RETURN_REASONS = [
  "Wrong size",
  "Damaged / defective",
  "Wrong item received",
  "Not as described",
  "Quality issue",
  "Other",
];

function OrderRequestCard({
  order,
  daysLeft,
  contactEmail,
  onSubmitted,
  mode,
}: {
  order: CustomerOrder;
  daysLeft: number;
  contactEmail: string;
  onSubmitted: () => void;
  mode: "return" | "support";
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"return" | "refund" | "support">(
    mode === "return" ? "return" : "support",
  );
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [resolution, setResolution] = useState("Refund");
  const [details, setDetails] = useState("");
  const [email, setEmail] = useState(contactEmail);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setEmail(contactEmail), [contactEmail]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (details.trim().length < 10) {
      toast.error("Please add a few details (min 10 characters).");
      return;
    }
    setSubmitting(true);
    try {
      const token = localStorage.getItem("riotous_session") || "";
      await submitSupportRequest({
        data: {
          request_type: type,
          order_name: order.name,
          reason: type === "support" ? null : reason,
          details: details.trim(),
          contact_email: email.trim() || null,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Request submitted. We'll email you within 48 hours.");
      setDetails("");
      refreshRequests();
    } catch {
      toast.error("Could not submit request. Try again.");
    } finally {
      setSubmitting(false);
    }
    setOpen(false);
    onSubmitted();
  }

  return (
    <article className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Order {order.name}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(order.processedAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            · {formatPrice(order.total.amount, order.total.currencyCode)}
          </p>
        </div>
        {mode === "return" ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            {daysLeft} day{daysLeft === 1 ? "" : "s"} left
          </span>
        ) : (
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            Return window closed
          </span>
        )}
      </header>

      <ul className="mt-4 flex flex-wrap gap-2">
        {order.lineItems.slice(0, 4).map((li, i) => (
          <li key={i} className="flex items-center gap-2 rounded-lg bg-secondary/50 px-2 py-1.5">
            {li.imageUrl && (
              <img src={li.imageUrl} alt={li.title} className="h-8 w-8 rounded object-cover" />
            )}
            <span className="text-xs">
              {li.title} × {li.quantity}
            </span>
          </li>
        ))}
      </ul>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90"
        >
          {mode === "return" ? "Request return" : "Raise support request"}
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-4 border-t border-border pt-5">
          {mode === "return" && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider">
                Request type
              </label>
              <div className="flex flex-wrap gap-2">
                {(["return", "refund", "support"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition ${
                      type === t
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-foreground/40"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {type !== "support" && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider">
                  Reason
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  {RETURN_REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider">
                  Preferred resolution
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Refund",
                    "Exchange (same size)",
                    "Exchange (different size)",
                    "Store credit",
                  ].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setResolution(r)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        resolution === r
                          ? "border-foreground bg-foreground text-background"
                          : "border-border hover:border-foreground/40"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider">
              Details
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
              placeholder="Tell us more — item(s), what went wrong, any photos you can share over email."
              rows={4}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">{details.length}/1000</p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider">
              Contact email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit request
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
