import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  RotateCcw,
  ImagePlus,
  X,
  ChevronDown,
  ChevronUp,
  PackageCheck,
} from "lucide-react";
import { toast } from "sonner";
import { productImageUrl, validateImageFile } from "@/lib/product-images";
import { formatPrice } from "@/lib/catalog";
import {
  getMyReturnHistory,
  getMyReturns,
  getReturnableOrders,
  cancelMyReturn,
  requestReturn,
} from "@/lib/returns.functions";
import type { ReturnableItem, ReturnableOrder } from "@/lib/returns.functions";
import {
  RETURN_REASONS,
  RETURN_STATUS_TONE,
  RETURN_TIMELINE,
  REFUND_STATUS_TONE,
  type ReturnRecord,
} from "@/lib/returns-shared";

const CANCELLABLE = ["Return Requested", "Under Review", "Approved"];

export function CustomerReturns({ windowDays = 7 }: { windowDays?: number }) {
  const qc = useQueryClient();
  const fetchOrders = useServerFn(getReturnableOrders);
  const fetchReturns = useServerFn(getMyReturns);

  const { data: orders, isLoading: loadingOrders } = useQuery({
    queryKey: ["returnable-orders"],
    queryFn: () => fetchOrders(),
  });
  const { data: returns, isLoading: loadingReturns } = useQuery({
    queryKey: ["my-returns"],
    queryFn: () => fetchReturns(),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["returnable-orders"] });
    qc.invalidateQueries({ queryKey: ["my-returns"] });
  };

  const eligibleOrders = (orders ?? []).filter((o) => o.items.some((i) => i.eligible));

  return (
    <div className="space-y-12">
      <section>
        <div className="mb-4 flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-bold tracking-tight">Request a return</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            {eligibleOrders.length}
          </span>
        </div>

        {loadingOrders ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : eligibleOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No delivered items are inside the {windowDays}-day return window right now.
          </p>
        ) : (
          <div className="space-y-4">
            {eligibleOrders.map((order) => (
              <ReturnableOrderCard key={order.orderId} order={order} onDone={refresh} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <PackageCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-bold tracking-tight">Your returns</h2>
        </div>
        {loadingReturns ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (returns ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">You haven't requested any returns yet.</p>
        ) : (
          <div className="space-y-3">
            {(returns ?? []).map((r) => (
              <ReturnCard key={r.id} record={r} onDone={refresh} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ReturnableOrderCard({ order, onDone }: { order: ReturnableOrder; onDone: () => void }) {
  const [openItem, setOpenItem] = useState<string | null>(null);
  const items = order.items.filter((i) => i.eligible);

  return (
    <article className="rounded-2xl border border-border bg-card p-5 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Order {order.orderNumber}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.deliveredAt
              ? `Delivered ${new Date(order.deliveredAt).toLocaleDateString("en-IN")}`
              : `Placed ${new Date(order.createdAt).toLocaleDateString("en-IN")}`}
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
          {order.daysLeft} day{order.daysLeft === 1 ? "" : "s"} left
        </span>
      </header>

      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.orderItemId} className="rounded-xl bg-secondary/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {item.productImage && (
                  <img
                    src={item.productImage}
                    alt={item.productName}
                    className="h-12 w-12 rounded-lg object-cover"
                  />
                )}
                <div>
                  <p className="text-sm font-medium">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {[item.size, item.color].filter(Boolean).join(" · ") || "—"} ·{" "}
                    {formatPrice(String(item.price), order.currency)} · {item.remaining} returnable
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpenItem(openItem === item.orderItemId ? null : item.orderItemId)}
                className="rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background hover:opacity-90"
              >
                {openItem === item.orderItemId ? "Close" : "Return this item"}
              </button>
            </div>
            {openItem === item.orderItemId && (
              <ReturnForm
                order={order}
                item={item}
                onSubmitted={() => {
                  setOpenItem(null);
                  onDone();
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}

function ReturnForm({
  order,
  item,
  onSubmitted,
}: {
  order: ReturnableOrder;
  item: ReturnableItem;
  onSubmitted: () => void;
}) {
  const submit = useServerFn(requestReturn);
  const [reason, setReason] = useState(RETURN_REASONS[0]!);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          orderId: order.orderId,
          orderItemId: item.orderItemId,
          quantity,
          reason,
          message: message.trim() || null,
          images,
        },
      }),
    onSuccess: (res: any) => {
      toast.success(`Return ${res.returnNumber} created. We'll email you as it progresses.`);
      onSubmitted();
    },
    onError: (e: any) => toast.error(e?.message || "Could not create the return"),
  });

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const next: string[] = [];
      for (const file of Array.from(files).slice(0, 5 - images.length)) {
        const invalid = validateImageFile(file);
        if (invalid) {
          toast.error(invalid);
          continue;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        next.push(dataUrl);
      }
      setImages((prev) => [...prev, ...next]);
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
      className="mt-4 space-y-4 border-t border-border pt-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reason
          </span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {RETURN_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Quantity
          </span>
          <select
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {Array.from({ length: item.remaining }, (_, i) => i + 1).map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Tell us more (optional)
        </span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Anything that helps us review your return faster"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
      </label>

      <div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Photos (optional, up to 5)
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {images.map((p) => (
            <div key={p} className="relative">
              <img
                src={productImageUrl(p)}
                alt="Return photo"
                className="h-16 w-16 rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={() => setImages((prev) => prev.filter((v) => v !== p))}
                className="absolute -right-1 -top-1 rounded-full bg-foreground p-0.5 text-background"
                aria-label="Remove photo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {images.length < 5 && (
            <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => onPick(e.target.files)}
              />
            </label>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={mutation.isPending || uploading}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Submit return request
      </button>
    </form>
  );
}

function ReturnCard({ record, onDone }: { record: ReturnRecord; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const fetchHistory = useServerFn(getMyReturnHistory);
  const cancel = useServerFn(cancelMyReturn);

  const { data: history } = useQuery({
    queryKey: ["return-history", record.id],
    queryFn: () => fetchHistory({ data: { returnId: record.id } }),
    enabled: open,
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancel({ data: { returnId: record.id } }),
    onSuccess: () => {
      toast.success("Return cancelled");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message || "Could not cancel"),
  });

  const stepIndex = RETURN_TIMELINE.indexOf(record.status as never);

  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {record.product_image && (
            <img
              src={record.product_image}
              alt={record.product_name}
              className="h-12 w-12 rounded-lg object-cover"
            />
          )}
          <div>
            <p className="text-sm font-semibold">{record.product_name}</p>
            <p className="text-xs text-muted-foreground">
              {record.return_number} · Order {record.order_number ?? "—"} ·{" "}
              {new Date(record.created_at).toLocaleDateString("en-IN")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              RETURN_STATUS_TONE[record.status] ?? "bg-secondary"
            }`}
          >
            {record.status}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              REFUND_STATUS_TONE[record.refund_status] ?? "bg-secondary"
            }`}
          >
            {record.refund_status}
          </span>
        </div>
      </div>

      {record.status !== "Return Cancelled" && record.status !== "Rejected" && (
        <ol className="mt-4 flex flex-wrap gap-1.5">
          {RETURN_TIMELINE.map((step, i) => (
            <li
              key={step}
              className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                i <= stepIndex
                  ? "bg-primary/15 text-primary"
                  : "bg-secondary/60 text-muted-foreground"
              }`}
            >
              {step}
            </li>
          ))}
        </ol>
      )}

      {record.rejection_reason && (
        <p className="mt-3 text-sm text-destructive">Rejected: {record.rejection_reason}</p>
      )}
      {record.admin_message && (
        <p className="mt-2 text-sm text-foreground/80">Note: {record.admin_message}</p>
      )}
      {record.pickup_details && (
        <p className="mt-2 text-sm text-foreground/80">Pickup: {record.pickup_details}</p>
      )}
      {record.refund_status === "Refunded" && (
        <p className="mt-2 text-sm text-emerald-500">
          Refunded {formatPrice(String(record.refund_amount ?? 0), record.currency)}
          {record.refund_reference ? ` · Ref ${record.refund_reference}` : ""}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {open ? "Hide" : "View"} timeline
        </button>
        {CANCELLABLE.includes(record.status) && (
          <button
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            className="text-xs font-medium text-destructive hover:opacity-80 disabled:opacity-50"
          >
            Cancel return
          </button>
        )}
      </div>

      {open && (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {(history ?? []).map((h) => (
            <li key={h.id} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{h.new_status}</span>
              {h.note ? ` — ${h.note}` : ""} · {new Date(h.created_at).toLocaleString("en-IN")}
            </li>
          ))}
          {(record.images ?? []).length > 0 && (
            <li className="flex flex-wrap gap-2 pt-2">
              {record.images.map((p) => (
                <img
                  key={p}
                  src={productImageUrl(p)}
                  alt="Return photo"
                  className="h-16 w-16 rounded-lg object-cover"
                />
              ))}
            </li>
          )}
        </ul>
      )}
    </article>
  );
}
