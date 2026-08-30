# RIOTUS Storefront — Build Plan

A premium, minimal, Apple × Nike streetwear storefront wired to your Shopify dev store, with a live custom T-shirt designer. Products load real-time from Shopify; cart and checkout use the Shopify Storefront API.

## Design system

- **Palette**: white `#FFFFFF`, black `#000000`, light gray `#F5F5F7`, dark gray `#1C1C1E`, accent Electric Blue.
- **Typography**: Inter (loaded via `<link>` in `__root.tsx`). Large hero display sizes, tight tracking, generous whitespace.
- **Tokens**: mapped in `src/styles.css` via `@theme inline` (oklch). Semantic classes only — no hardcoded colors in components.
- **Motion**: subtle fade-in, slide-up, hover-scale, image zoom on product cards. No AI-slop gradients or generic sections.

## Routes (TanStack Start)

```
src/routes/
  __root.tsx           header + footer chrome, font <link>, sitewide meta
  index.tsx            home
  shop.tsx             grid + filters (size, color, price, sort)
  product.$handle.tsx  PDP with gallery, variants, add to cart
  design.tsx           Design Your Own studio
  about.tsx
  contact.tsx
```

Each leaf gets its own `head()` with unique title/description/og.

## Home page sections

1. Fullscreen hero — "WE DON'T FOLLOW TRENDS. WE PRINT THEM." + Shop / Design Your Own CTAs.
2. Featured categories (4 tiles).
3. Featured products (loaded from Shopify, first 8).
4. Why RIOTUS (fabric, DTF durability, shipping, returns, Made in India, packaging).
5. Reviews — empty-state cards only ("No reviews yet"). No fabricated reviews.
6. Newsletter signup (frontend only, stored locally until an email provider is wired later).
7. Footer.

## Shopify wiring

- `src/lib/shopify.ts` — `SHOPIFY_STORE_PERMANENT_DOMAIN`, `SHOPIFY_STOREFRONT_TOKEN` (fetched via tools), `SHOPIFY_API_VERSION = '2025-07'`, `storefrontApiRequest` helper with 402 toast.
- `src/lib/shopify-queries.ts` — products list, product-by-handle, cart mutations (create, add, update, remove, query).
- `src/stores/cart-store.ts` — Zustand + `persist`, real Shopify cart, `checkoutUrl` from `cartCreate`, `channel=online_store` param, opens in new tab.
- `src/hooks/use-cart-sync.ts` — syncs on load + tab visibility.
- `src/components/cart-drawer.tsx` — shadcn Sheet, quantity, remove, checkout.

If the store has no products, all product surfaces show an empty state prompting you to send product info in chat.

## Design Your Own studio (`/design`)

Client-side canvas editor using `fabric.js`:

- Choose base shirt (from Shopify products tagged `blank`) and color swatch.
- Upload PNG / SVG / JPG artwork; drag, resize, rotate.
- Add text with font picker and color.
- Toggle Front / Back / Sleeve print areas.
- Live preview over shirt mockup.
- Price updates live (base variant price + print-area surcharges as configurable constants).
- "Add to Cart" attaches the design as line-item properties (`_design_json`, preview image data URL) to a designated "Custom Print" Shopify product variant, so it flows through the standard cart/checkout.

Note: rendering the final print file for production is out of scope for the frontend; the design JSON + preview travel with the order for you to fulfill.

## Out of scope (Shopify-native, not built here)

- Admin panel, analytics, order/customer/inventory management → Shopify Admin.
- Checkout pages, payment methods (UPI, cards, COD, etc.) → Shopify Checkout.
- Loyalty program logic, wishlist persistence, reviews collection, abandoned-cart emails → Shopify apps you'll install later.
- User accounts / login → Shopify's hosted customer accounts (linked from header once you enable them in Shopify admin).

The storefront links out to these where relevant; nothing is faked.

## Technical details

- Fonts loaded via `<link>` in `__root.tsx` head; `--font-sans: "Inter"` in `@theme`.
- Product queries via `useSuspenseQuery` + `ensureQueryData` in route loaders (per project conventions).
- Filters as URL search params on `/shop` (typed via `validateSearch`).
- Header: sticky, glassmorphic on scroll, logo + nav + search + wishlist icon (visual only for now) + cart.
- Mobile: sticky bottom nav (Home / Shop / Design / Cart / Account).
- New deps: `zustand`, `fabric`, `@types/fabric`.
- No Lovable Cloud — Shopify handles all persistence.

## Build order

1. Design tokens + Inter font + header/footer chrome in `__root.tsx`.
2. Shopify lib + queries + cart store + cart drawer + sync hook.
3. Home page.
4. Shop grid + filters, PDP with variants.
5. About + Contact.
6. Design Your Own studio.
7. SEO polish (per-route `head()`, JSON-LD on PDP).

After the plan is approved, send your product list (name, price in INR, sizes, colors, images) and I'll create them in Shopify via batch tools.
