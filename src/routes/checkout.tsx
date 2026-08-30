import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Lock, ShieldCheck, Truck, CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCartStore } from "@/stores/cart-store";
import { formatPrice } from "@/lib/catalog";
import { placeOrder } from "@/lib/orders.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/checkout")({
  component: CheckoutPage,
  head: () => ({
    meta: [
      { title: "Checkout · RIOTOUS" },
      {
        name: "description",
        content: "Review your bag, enter your shipping address and place your RIOTOUS order.",
      },
      { property: "og:title", content: "Checkout · RIOTOUS" },
      {
        property: "og:description",
        content: "Review your order and place it in a few seconds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CheckoutPage() {
  const navigate = useNavigate();
  const { items, isLoading, isSyncing, clearCart } = useCartStore();
  const { user } = useAuth();
  const placeOrderFn = useServerFn(placeOrder);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [placing, setPlacing] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!user) return;
    setEmail((v) => v || user.email || "");
    setName((v) => v || ((user.user_metadata?.full_name as string | undefined) ?? ""));
  }, [user]);

  const displayItems = mounted ? items : [];
  const currency = displayItems[0]?.price.currencyCode ?? "INR";
  const subtotal = displayItems.reduce((s, i) => s + parseFloat(i.price.amount) * i.quantity, 0);
  const shipping = subtotal >= 1999 || subtotal === 0 ? 0 : 79;
  const total = subtotal + shipping;

  const proceed = async () => {
    if (!user) {
      toast.error("Please sign in to place your order");
      navigate({ to: "/auth" });
      return;
    }
    if (!name.trim() || !email.trim() || !address.trim()) {
      toast.error("Please fill in your name, email and shipping address");
      return;
    }
    setPlacing(true);
    try {
      const res = await placeOrderFn({
        data: {
          shippingName: name,
          shippingEmail: email,
          shippingPhone: phone,
          shippingAddress: address,
          currency,
          items: displayItems.map((i) => ({
            productId: i.productId,
            designSubmissionId: i.designSubmissionId ?? null,
            productName: i.productTitle,
            productImage: i.imageUrl,
            quantity: i.quantity,
            price: parseFloat(i.price.amount),
            selectedSize:
              i.selectedOptions.find((o) => o.name.toLowerCase() === "size")?.value ?? null,
            selectedColor:
              i.selectedOptions.find((o) => o.name.toLowerCase() === "color")?.value ?? null,
          })),
        },
      });
      clearCart();
      toast.success(`Order ${res.orderNumber} placed`);
      navigate({ to: "/account/orders" });
    } catch (e) {
      toast.error((e as Error).message || "Could not place your order");
    } finally {
      setPlacing(false);
    }
  };

  if (displayItems.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-32 md:pt-40">
        <div className="rounded-3xl border border-border bg-card p-12 text-center">
          <h1 className="mb-3 text-3xl font-semibold tracking-tight">Your bag is empty</h1>
          <p className="mb-8 text-muted-foreground">Add something before you check out.</p>
          <Button onClick={() => navigate({ to: "/shop" })} size="lg" className="rounded-full">
            Browse the shop
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1200px] px-6 pb-24 pt-28 md:px-10 md:pt-36">
      <div className="mb-10">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Step 1 of 1 · Review &amp; place order
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">Checkout</h1>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_420px]">
        {/* LEFT — items + info */}
        <div className="space-y-8">
          <section className="rounded-3xl border border-border bg-card p-6 md:p-8">
            <h2 className="mb-6 text-lg font-semibold">Your items</h2>
            <ul className="divide-y divide-border">
              {displayItems.map((item) => (
                <li key={item.variantId} className="flex gap-4 py-5 first:pt-0 last:pb-0">
                  <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl bg-secondary">
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt={item.productTitle}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div>
                      <p className="truncate text-sm font-medium">{item.productTitle}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.selectedOptions.map((o) => o.value).join(" · ")}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">Qty {item.quantity}</p>
                  </div>
                  <div className="text-right text-sm font-semibold">
                    {formatPrice(
                      parseFloat(item.price.amount) * item.quantity,
                      item.price.currencyCode,
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-3xl border border-border bg-card p-6 md:p-8">
            <div className="mb-4 flex items-center gap-3">
              <Truck className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Shipping &amp; address</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ship-name">Full name</Label>
                <Input
                  id="ship-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ship-email">Email</Label>
                <Input
                  id="ship-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ship-phone">Phone</Label>
                <Input
                  id="ship-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 …"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ship-address">Shipping address</Label>
                <Textarea
                  id="ship-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House / street, area, city, state, PIN code"
                  rows={4}
                />
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Free shipping on orders over {formatPrice(1999, currency)}. Estimated delivery: 5-7
              business days.
            </p>
          </section>

          <section className="rounded-3xl border border-border bg-card p-6 md:p-8">
            <div className="mb-4 flex items-center gap-3">
              <CreditCard className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Payment</h2>
            </div>
            <p className="mb-5 text-sm text-muted-foreground">
              Online payments aren't live yet. Place your order now — it's recorded as{" "}
              <strong>payment pending</strong> and our team will contact you on the details below to
              collect payment.
            </p>
            <div className="flex flex-wrap gap-2">
              {["UPI", "Bank transfer", "Cash on Delivery"].map((m) => (
                <span
                  key={m}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium"
                >
                  {m}
                </span>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Your details are stored securely and only visible to you and our team
            </div>
          </section>
        </div>

        {/* RIGHT — summary */}
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-3xl border border-border bg-card p-6 md:p-8">
            <h2 className="mb-6 text-lg font-semibold">Order summary</h2>

            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Subtotal ({displayItems.reduce((s, i) => s + i.quantity, 0)} items)
                </dt>
                <dd>{formatPrice(subtotal, currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Shipping</dt>
                <dd>{shipping === 0 ? "Free" : formatPrice(shipping, currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Taxes</dt>
                <dd className="text-muted-foreground">Included</dd>
              </div>
            </dl>

            <div className="my-6 h-px bg-border" />

            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-3xl font-semibold tracking-tight">
                {formatPrice(total, currency)}
              </span>
            </div>

            <Button
              onClick={proceed}
              size="lg"
              disabled={isLoading || isSyncing || placing}
              className="mt-6 h-12 w-full rounded-full text-sm font-medium"
            >
              {isLoading || isSyncing || placing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Place order
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              You'll be able to track this order in My Orders
            </p>

            <Link
              to="/shop"
              className="mt-6 block text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              Continue shopping
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
