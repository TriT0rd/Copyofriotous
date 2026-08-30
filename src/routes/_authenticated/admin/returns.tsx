import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Mail, Settings2 } from "lucide-react";
import {
  adminListReturns,
  adminReturnEmails,
  adminReturnHistory,
  adminUpdateReturn,
  adminGetReturnSettings,
  adminSetReturnSettings,
  type AdminReturnRecord,
} from "@/lib/admin-returns.functions";
import {
  NEXT_STATUSES,
  REFUND_STATUSES,
  RETURN_STATUSES,
  RETURN_STATUS_TONE,
  REFUND_STATUS_TONE,
} from "@/lib/returns-shared";
import { money, dateTime } from "@/components/admin/format";
import { productImageUrl } from "@/lib/product-images";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin/returns")({
  component: AdminReturnsPage,
});

function AdminReturnsPage() {
  const listFn = useServerFn(adminListReturns);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const listQ = useQuery({
    queryKey: ["admin", "returns"],
    queryFn: () => listFn(),
    refetchInterval: 30_000,
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (listQ.data ?? []).filter((r) => {
      if (status && r.status !== status) return false;
      if (!term) return true;
      return [
        r.return_number,
        r.order_number,
        r.product_name,
        r.customer_name,
        r.customer_email,
        r.reason,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [listQ.data, q, status]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of listQ.data ?? []) map[r.status] = (map[r.status] ?? 0) + 1;
    return map;
  }, [listQ.data]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Returns</h1>
          <p className="text-sm text-muted-foreground">
            {(listQ.data ?? []).length} total · {counts["Return Requested"] ?? 0} awaiting review
          </p>
        </div>
        <ReturnSettings />
      </header>

      <div className="flex flex-wrap gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search return, order, customer or product"
          className="max-w-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {RETURN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s} ({counts[s] ?? 0})
            </option>
          ))}
        </select>
      </div>

      {listQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading returns…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No returns match this filter.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <ReturnRow key={r.id} record={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReturnSettings() {
  const getFn = useServerFn(adminGetReturnSettings);
  const setFn = useServerFn(adminSetReturnSettings);
  const [open, setOpen] = useState(false);
  const settingsQ = useQuery({
    queryKey: ["admin", "return-settings"],
    queryFn: () => getFn(),
    enabled: open,
  });
  const [days, setDays] = useState<string>("");
  const [requireDelivered, setRequireDelivered] = useState(true);

  const save = useMutation({
    mutationFn: () =>
      setFn({
        data: {
          windowDays: Number(days || settingsQ.data?.windowDays || 7),
          requireDelivered,
        },
      }),
    onSuccess: () => {
      toast.success("Return window updated");
      settingsQ.refetch();
    },
    onError: (e: any) => toast.error(e?.message || "Could not save"),
  });

  return (
    <div className="text-right">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <Settings2 className="mr-2 h-4 w-4" /> Return window
      </Button>
      {open && (
        <div className="mt-2 w-72 rounded-xl border bg-card p-4 text-left">
          <Label htmlFor="win">Return window (days)</Label>
          <Input
            id="win"
            type="number"
            min={1}
            max={180}
            value={days || settingsQ.data?.windowDays || ""}
            onChange={(e) => setDays(e.target.value)}
            className="mt-1"
          />
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={
                days === "" && settingsQ.data ? settingsQ.data.requireDelivered : requireDelivered
              }
              onChange={(e) => setRequireDelivered(e.target.checked)}
            />
            Only allow returns after delivery
          </label>
          <Button
            size="sm"
            className="mt-3 w-full"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

function ReturnRow({ record }: { record: AdminReturnRecord }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const updateFn = useServerFn(adminUpdateReturn);
  const historyFn = useServerFn(adminReturnHistory);
  const emailsFn = useServerFn(adminReturnEmails);

  const [next, setNext] = useState("");
  const [note, setNote] = useState("");
  const [rejection, setRejection] = useState(record.rejection_reason ?? "");
  const [pickup, setPickup] = useState(record.pickup_details ?? "");
  const [refundStatus, setRefundStatus] = useState<string>(record.refund_status);
  const [refundAmount, setRefundAmount] = useState(
    String(record.refund_amount ?? record.unit_price * record.quantity),
  );
  const [refundRef, setRefundRef] = useState(record.refund_reference ?? "");

  const historyQ = useQuery({
    queryKey: ["admin", "return-history", record.id],
    queryFn: () => historyFn({ data: { returnId: record.id } }),
    enabled: open,
  });
  const emailsQ = useQuery({
    queryKey: ["admin", "return-emails", record.id],
    queryFn: () => emailsFn({ data: { returnId: record.id } }),
    enabled: open,
  });

  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      updateFn({ data: { returnId: record.id, ...patch } as never }),
    onSuccess: (res: any) => {
      toast.success(
        res?.emailSent ? "Return updated and customer emailed" : "Return updated (email queued)",
      );
      setNext("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin", "returns"] });
      qc.invalidateQueries({ queryKey: ["admin", "return-history", record.id] });
      qc.invalidateQueries({ queryKey: ["admin", "return-emails", record.id] });
    },
    onError: (e: any) => toast.error(e?.message || "Update failed"),
  });

  const allowed = NEXT_STATUSES[record.status] ?? [];

  return (
    <article className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {record.product_image && (
            <img
              src={record.product_image}
              alt={record.product_name}
              className="h-14 w-14 rounded-lg object-cover"
            />
          )}
          <div className="text-sm">
            <p className="font-semibold">
              {record.return_number} · {record.product_name}
            </p>
            <p className="text-muted-foreground">
              Order {record.order_number ?? "—"} ·{" "}
              {[record.selected_size, record.selected_color].filter(Boolean).join(" · ") || "—"} ·
              Qty {record.quantity} · {money(record.unit_price * record.quantity, record.currency)}
            </p>
            <p className="text-muted-foreground">
              {record.customer_name ?? "—"} · {record.customer_email ?? "—"}
              {record.customer_phone ? ` · ${record.customer_phone}` : ""}
            </p>
            <p className="text-muted-foreground">
              {record.reason} · requested {dateTime(record.created_at)}
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
          {record.inventory_restored && (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
              Stock restored
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-4 grid gap-6 border-t pt-4 lg:grid-cols-2">
          <div className="space-y-3 text-sm">
            {record.customer_message && (
              <p>
                <span className="font-medium">Customer note:</span> {record.customer_message}
              </p>
            )}
            {record.shipping_address && (
              <p className="whitespace-pre-line text-muted-foreground">{record.shipping_address}</p>
            )}
            {(record.images ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {record.images.map((p) => (
                  <a key={p} href={productImageUrl(p)} target="_blank" rel="noreferrer">
                    <img
                      src={productImageUrl(p)}
                      alt="Return photo"
                      className="h-20 w-20 rounded-lg object-cover"
                    />
                  </a>
                ))}
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status history
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {(historyQ.data ?? []).map((h) => (
                  <li key={h.id}>
                    <span className="text-foreground">{h.new_status}</span>
                    {h.previous_status ? ` (from ${h.previous_status})` : ""} · {h.changed_by_role}
                    {h.note ? ` — ${h.note}` : ""} · {dateTime(h.created_at)}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Mail className="h-3 w-3" /> Emails
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {(emailsQ.data ?? []).length === 0 && <li>No emails yet.</li>}
                {(emailsQ.data ?? []).map((e) => (
                  <li key={e.id}>
                    {e.event} → {e.recipient} · {e.status}
                    {e.error ? ` (${e.error})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Change status</Label>
              <div className="mt-1 flex gap-2">
                <select
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {allowed.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={!next || update.isPending}
                  onClick={() =>
                    update.mutate({
                      status: next,
                      adminMessage: note.trim() || undefined,
                      rejectionReason: next === "Rejected" ? rejection.trim() : undefined,
                      pickupDetails: next === "Pickup Scheduled" ? pickup.trim() : undefined,
                    })
                  }
                >
                  Apply
                </Button>
              </div>
              {allowed.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">This return is closed.</p>
              )}
            </div>

            <div>
              <Label htmlFor={`note-${record.id}`}>Message to customer</Label>
              <Textarea
                id={`note-${record.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1"
              />
            </div>

            {(next === "Rejected" || record.status === "Rejected") && (
              <div>
                <Label htmlFor={`rej-${record.id}`}>Rejection reason</Label>
                <Textarea
                  id={`rej-${record.id}`}
                  value={rejection}
                  onChange={(e) => setRejection(e.target.value)}
                  rows={2}
                  className="mt-1"
                />
              </div>
            )}

            {(next === "Pickup Scheduled" || record.pickup_details) && (
              <div>
                <Label htmlFor={`pick-${record.id}`}>Pickup details</Label>
                <Input
                  id={`pick-${record.id}`}
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                  className="mt-1"
                  placeholder="Courier + date"
                />
              </div>
            )}

            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Refund
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <select
                  value={refundStatus}
                  onChange={(e) => setRefundStatus(e.target.value)}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  {REFUND_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={0}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="Amount"
                />
                <Input
                  value={refundRef}
                  onChange={(e) => setRefundRef(e.target.value)}
                  placeholder="Reference / UTR"
                  className="sm:col-span-2"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate({
                    refundStatus,
                    refundAmount: Number(refundAmount) || 0,
                    refundReference: refundRef.trim() || null,
                  })
                }
              >
                Save refund details
              </Button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
