import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Mail, Instagram } from "lucide-react";
import { BrandName } from "@/components/brand-name";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — RIOTOUS" },
      {
        name: "description",
        content:
          "Reach RIOTOUS about orders, custom prints, or wholesale. Email, WhatsApp, or Instagram.",
      },
      { property: "og:title", content: "Contact — RIOTOUS" },
      {
        property: "og:description",
        content: "Get in touch with the RIOTOUS team.",
      },
      { property: "og:url", content: "/contact" },
    ],
    links: [{ rel: "canonical", href: "/contact" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          name: "RIOTOUS",
          url: "https://riotous.store/contact",
          description:
            "Premium DTF printed streetwear studio. Orders, custom prints and wholesale support.",
          areaServed: "IN",
          openingHoursSpecification: [
            {
              "@type": "OpeningHoursSpecification",
              dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
              opens: "10:00",
              closes: "19:00",
            },
          ],
        }),
      },
    ],
  }),
  component: ContactPage,
});

const schema = z.object({
  name: z.string().trim().min(1, "Required").max(100),
  email: z.string().trim().email("Invalid email").max(255),
  message: z.string().trim().min(1, "Required").max(1000),
});

function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form.");
      return;
    }
    toast.success("Message sent — we'll be in touch.");
    setForm({ name: "", email: "", message: "" });
  };

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
      <div className="grid gap-16 md:grid-cols-2 md:gap-24">
        <div>
          <p className="mb-6 text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
            Contact
          </p>
          <h1 className="text-5xl font-semibold tracking-tight md:text-7xl">Say hi.</h1>
          <p className="mt-6 max-w-md text-muted-foreground">
            Custom prints, wholesale, press, or you just want to nerd out about fabric — reach out.
          </p>

          <div className="mt-12 space-y-6">
            <a href="mailto:support@riotous.store" className="block">
              <ContactRow icon={Mail} label="Support" value="support@riotous.store" />
            </a>
            <ContactRow icon={Instagram} label="Instagram" value="@riotous" />
          </div>

          <div className="mt-12 border-t border-border pt-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Studio hours
            </p>
            <p className="mt-3 text-sm">Mon — Sat · 10:00 — 19:00 IST</p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="rounded-3xl border border-border bg-secondary/40 p-8 md:p-10"
        >
          <div className="space-y-5">
            <Field
              label="Name"
              value={form.name}
              onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            />
            <Field
              label="Email"
              type="email"
              value={form.email}
              onChange={(v) => setForm((f) => ({ ...f, email: v }))}
            />
            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Message
              </label>
              <textarea
                required
                rows={5}
                maxLength={1000}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors focus:border-foreground"
              />
            </div>
          </div>
          <button
            type="submit"
            className="mt-6 h-12 w-full rounded-full bg-foreground text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Send message
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <input
        required
        type={type}
        value={value}
        maxLength={type === "email" ? 255 : 100}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-full border border-border bg-background px-5 py-3 text-sm outline-none transition-colors focus:border-foreground"
      />
    </div>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}
