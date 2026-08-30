import { Link } from "@tanstack/react-router";
import { Instagram, Youtube, Facebook } from "lucide-react";
import { useState } from "react";
import { BrandName } from "@/components/brand-name";

export function SiteFooter() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-[1400px] px-6 py-20 md:px-10">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <h3 className="text-4xl font-semibold tracking-tight md:text-5xl">
              Wear the print.
              <br />
              Not the trend.
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (email.includes("@")) {
                  setSubscribed(true);
                  setEmail("");
                }
              }}
              className="mt-8 flex max-w-md items-center gap-2 border-b border-foreground pb-2"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email"
                suppressHydrationWarning
                className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                suppressHydrationWarning
                className="text-sm font-medium uppercase tracking-wider text-foreground/70 transition-colors hover:text-accent"
              >
                Join
              </button>
            </form>
            {subscribed && <p className="mt-3 text-xs text-accent">Thanks — you're on the list.</p>}
          </div>

          <FooterCol
            title="Shop"
            links={[
              { to: "/shop", label: "All Products" },
              { to: "/design", label: "Design Your Own" },
              { to: "/shop", label: "Best Sellers" },
              { to: "/shop", label: "New Arrivals" },
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              { to: "/about", label: "About" },
              { to: "/contact", label: "Contact" },
            ]}
          />
          <FooterCol
            title="Support"
            links={[
              { to: "/contact", label: "Help" },
              { to: "/contact", label: "Shipping" },
              { to: "/contact", label: "Returns" },
              { to: "/contact", label: "Privacy" },
            ]}
          />
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-6 border-t border-border pt-8 md:flex-row md:items-center">
          <div className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} <BrandName />. Made in India.
          </div>
          <div className="flex items-center gap-4">
            <SocialLink href="https://instagram.com" label="Instagram">
              <Instagram className="h-4 w-4" />
            </SocialLink>
            <SocialLink href="https://youtube.com" label="YouTube">
              <Youtube className="h-4 w-4" />
            </SocialLink>
            <SocialLink href="https://facebook.com" label="Facebook">
              <Facebook className="h-4 w-4" />
            </SocialLink>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: Array<{ to: string; label: string }>;
}) {
  return (
    <div className="md:col-span-2">
      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </p>
      <ul className="space-y-3">
        {links.map((l, i) => (
          <li key={i}>
            <Link
              to={l.to}
              className="text-sm text-foreground/80 transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border transition-colors hover:border-foreground hover:text-accent"
    >
      {children}
    </a>
  );
}
