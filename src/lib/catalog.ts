import { ensureDbSchema, getSql } from "@/lib/db";
import { createServerFn } from "@tanstack/react-start";

/** A product row as stored in the database. */
export interface ProductRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  currency: string;
  images: string[];
  category: string | null;
  sizes: string[];
  colors: string[];
  stock_quantity: number;
  is_active: boolean;
  tags: string[];
  product_variants?: VariantRow[];
}

/** Per size/colour inventory row. */
export interface VariantRow {
  id: string;
  size: string;
  color: string;
  stock_quantity: number;
  reserved_stock: number;
  low_stock_threshold: number;
}

export interface CatalogImage {
  url: string;
  altText: string | null;
}

export interface CatalogVariant {
  id: string;
  /** Database id of the product_variants row, when the product has variants. */
  variantRowId: string | null;
  /** Units a customer can still buy right now. */
  available: number;
  title: string;
  price: { amount: string; currencyCode: string };
  availableForSale: boolean;
  selectedOptions: Array<{ name: string; value: string }>;
  image?: CatalogImage | null;
}

export interface CatalogProductNode {
  id: string;
  productId: string;
  title: string;
  description: string;
  handle: string;
  tags: string[];
  productType: string;
  stock: number;
  /** Units still purchasable across all variants. */
  available: number;
  priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
  images: { edges: Array<{ node: CatalogImage }> };
  variants: { edges: Array<{ node: CatalogVariant }> };
  options: Array<{ name: string; values: string[] }>;
}

export interface CatalogProduct {
  node: CatalogProductNode;
}

/** Stable variant key encoding product + chosen size/colour. */
export function makeVariantId(productId: string, size: string | null, color: string | null) {
  return [productId, size ?? "", color ?? ""].join("|");
}

export function parseVariantId(variantId: string) {
  const [productId, size, color] = variantId.split("|");
  return {
    productId: productId ?? null,
    size: size || null,
    color: color || null,
  };
}

/** Maps a database row into the shape the storefront UI renders. */
export function toCatalogProduct(row: ProductRow): CatalogProduct {
  const currency = row.currency || "INR";
  const price = { amount: String(row.price), currencyCode: currency };
  const rows = row.product_variants ?? [];

  const byKey = new Map<string, VariantRow>();
  for (const v of rows) byKey.set(`${v.size}|${v.color}`, v);

  const sizes = row.sizes?.length ? row.sizes : [null];
  const colors = row.colors?.length ? row.colors : [null];

  const variants: CatalogVariant[] = [];
  for (const color of colors) {
    for (const size of sizes) {
      const match = byKey.get(`${size ?? ""}|${color ?? ""}`);
      // Products without variant rows fall back to the product-level stock.
      const available = match
        ? Math.max(0, (match.stock_quantity ?? 0) - (match.reserved_stock ?? 0))
        : rows.length
          ? 0
          : Math.max(0, row.stock_quantity ?? 0);
      variants.push({
        id: makeVariantId(row.id, size, color),
        variantRowId: match?.id ?? null,
        available,
        title: [size, color].filter(Boolean).join(" / ") || "Default",
        price,
        availableForSale: row.is_active && available > 0,
        selectedOptions: [
          ...(size ? [{ name: "Size", value: size }] : []),
          ...(color ? [{ name: "Color", value: color }] : []),
        ],
        image: row.images?.[0] ? { url: row.images[0], altText: row.name } : null,
      });
    }
  }

  const options = [
    ...(row.sizes?.length ? [{ name: "Size", values: row.sizes }] : []),
    ...(row.colors?.length ? [{ name: "Color", values: row.colors }] : []),
  ];

  const available = variants.reduce((s, v) => s + v.available, 0);

  return {
    node: {
      id: row.id,
      productId: row.id,
      title: row.name,
      description: row.description ?? "",
      handle: row.slug,
      tags: row.tags ?? [],
      productType: row.category ?? "",
      stock: row.stock_quantity ?? 0,
      available,
      priceRange: { minVariantPrice: price },
      images: {
        edges: (row.images ?? []).map((url) => ({
          node: { url, altText: row.name },
        })),
      },
      variants: { edges: variants.map((node) => ({ node })) },
      options,
    },
  };
}

export const FALLBACK_PRODUCTS: ProductRow[] = [
  {
    id: "prod-zoro-black",
    name: "Zoro Three-Sword Style Oversized Tee",
    slug: "zoro-black-tee",
    description:
      "Heavyweight 240 GSM combed cotton oversized streetwear tee featuring high-definition DTF back print of the legendary swordsman. Drop-shoulder relaxed boxy fit.",
    price: 999,
    currency: "INR",
    images: ["/products/zoro-black-1.jpg", "/products/zoro-black-2.jpg"],
    category: "Oversized Tees",
    sizes: ["S", "M", "L", "XL", "XXL"],
    colors: ["Black"],
    stock_quantity: 45,
    is_active: true,
    tags: ["Anime", "Oversized", "Bestseller", "DTF"],
    product_variants: [
      {
        id: "var-zb-s",
        size: "S",
        color: "Black",
        stock_quantity: 10,
        reserved_stock: 0,
        low_stock_threshold: 2,
      },
      {
        id: "var-zb-m",
        size: "M",
        color: "Black",
        stock_quantity: 15,
        reserved_stock: 0,
        low_stock_threshold: 2,
      },
      {
        id: "var-zb-l",
        size: "L",
        color: "Black",
        stock_quantity: 12,
        reserved_stock: 0,
        low_stock_threshold: 2,
      },
      {
        id: "var-zb-xl",
        size: "XL",
        color: "Black",
        stock_quantity: 8,
        reserved_stock: 0,
        low_stock_threshold: 2,
      },
    ],
  },
  {
    id: "prod-zoro-olive",
    name: "Zoro Olive Hunter Oversized Tee",
    slug: "zoro-olive-tee",
    description:
      "Earth-toned olive drab streetwear silhouette with vibrant DTF graphic chest and back print. Pre-shrunk bio-washed fabric with ribbed collar.",
    price: 999,
    currency: "INR",
    images: ["/products/zoro-olive-1.jpg", "/products/zoro-olive-2.jpg"],
    category: "Oversized Tees",
    sizes: ["S", "M", "L", "XL", "XXL"],
    colors: ["Olive"],
    stock_quantity: 38,
    is_active: true,
    tags: ["Anime", "Earth Tone", "Featured"],
    product_variants: [
      {
        id: "var-zo-s",
        size: "S",
        color: "Olive",
        stock_quantity: 8,
        reserved_stock: 0,
        low_stock_threshold: 2,
      },
      {
        id: "var-zo-m",
        size: "M",
        color: "Olive",
        stock_quantity: 14,
        reserved_stock: 0,
        low_stock_threshold: 2,
      },
      {
        id: "var-zo-l",
        size: "L",
        color: "Olive",
        stock_quantity: 10,
        reserved_stock: 0,
        low_stock_threshold: 2,
      },
      {
        id: "var-zo-xl",
        size: "XL",
        color: "Olive",
        stock_quantity: 6,
        reserved_stock: 0,
        low_stock_threshold: 2,
      },
    ],
  },
  {
    id: "prod-zenitsu-maroon",
    name: "Zenitsu Thunder Flash Maroon Tee",
    slug: "zenitsu-maroon-tee",
    description:
      "Deep maroon oversized tee adorned with electric lightning strike DTF graphics. Premium textured cotton blend made for effortless streetwear layering.",
    price: 1099,
    currency: "INR",
    images: ["/products/zenitsu-maroon-1.jpg", "/products/zenitsu-maroon-2.jpg"],
    category: "Graphic Tees",
    sizes: ["S", "M", "L", "XL", "XXL"],
    colors: ["Maroon"],
    stock_quantity: 50,
    is_active: true,
    tags: ["Anime", "Lightning", "Limited Drop"],
    product_variants: [
      {
        id: "var-zm-s",
        size: "S",
        color: "Maroon",
        stock_quantity: 12,
        reserved_stock: 0,
        low_stock_threshold: 2,
      },
      {
        id: "var-zm-m",
        size: "M",
        color: "Maroon",
        stock_quantity: 18,
        reserved_stock: 0,
        low_stock_threshold: 2,
      },
      {
        id: "var-zm-l",
        size: "L",
        color: "Maroon",
        stock_quantity: 14,
        reserved_stock: 0,
        low_stock_threshold: 2,
      },
      {
        id: "var-zm-xl",
        size: "XL",
        color: "Maroon",
        stock_quantity: 6,
        reserved_stock: 0,
        low_stock_threshold: 2,
      },
    ],
  },
  {
    id: "prod-riotous-cyber-skull",
    name: "Roronoa Wano Edition Olive Tee",
    slug: "roronoa-wano-olive-tee",
    description:
      "Heavyweight olive boxy fit tee with Japanese calligraphy and swordsman artwork. High durability wash-fast DTF print.",
    price: 1049,
    currency: "INR",
    images: ["/products/zoro-olive-2.jpg", "/products/zoro-olive-1.jpg"],
    category: "Oversized Tees",
    sizes: ["S", "M", "L", "XL"],
    colors: ["Olive"],
    stock_quantity: 32,
    is_active: true,
    tags: ["Anime", "Bestseller"],
    product_variants: [
      {
        id: "var-rw-s",
        size: "S",
        color: "Olive",
        stock_quantity: 8,
        reserved_stock: 0,
        low_stock_threshold: 2,
      },
      {
        id: "var-rw-m",
        size: "M",
        color: "Olive",
        stock_quantity: 12,
        reserved_stock: 0,
        low_stock_threshold: 2,
      },
      {
        id: "var-rw-l",
        size: "L",
        color: "Olive",
        stock_quantity: 12,
        reserved_stock: 0,
        low_stock_threshold: 2,
      },
    ],
  },
];

async function seedInitialProductsIfNeeded() {
  try {
    const sql = getSql();
    const existing = await sql`SELECT count(*)::int as count FROM products`;
    if (existing[0]?.count === 0) {
      for (const p of FALLBACK_PRODUCTS) {
        await sql`
          INSERT INTO products (
            id, name, slug, description, price, currency, images, category, sizes, colors, stock_quantity, is_active, tags
          ) VALUES (
            ${p.id}, ${p.name}, ${p.slug}, ${p.description}, ${p.price}, ${p.currency},
            ${JSON.stringify(p.images)}, ${p.category}, ${JSON.stringify(p.sizes)}, ${JSON.stringify(p.colors)},
            ${p.stock_quantity}, ${p.is_active}, ${JSON.stringify(p.tags)}
          ) ON CONFLICT (id) DO NOTHING;
        `;
        if (p.product_variants) {
          for (const v of p.product_variants) {
            await sql`
              INSERT INTO product_variants (
                id, product_id, size, color, stock_quantity, reserved_stock, low_stock_threshold
              ) VALUES (
                ${v.id}, ${p.id}, ${v.size}, ${v.color}, ${v.stock_quantity}, ${v.reserved_stock}, ${v.low_stock_threshold}
              ) ON CONFLICT (id) DO NOTHING;
            `;
          }
        }
      }
    }
  } catch (err) {
    console.warn("Seed initial products error:", err);
  }
}

export const fetchProductsServerFn = createServerFn({ method: "POST" })
  .inputValidator((d: { first?: number }) => ({ first: Number(d.first || 20) }))
  .handler(async ({ data }): Promise<CatalogProduct[]> => {
    try {
      await ensureDbSchema();
      await seedInitialProductsIfNeeded();
      const sql = getSql();
      const first = data.first || 20;

      const products = await sql`
        SELECT id, name, slug, description, price, currency, images, category, sizes, colors, stock_quantity, is_active, tags
        FROM products
        WHERE is_active = true
        ORDER BY created_at DESC
        LIMIT ${first}
      `;

      if (!products || products.length === 0) {
        return FALLBACK_PRODUCTS.slice(0, first).map(toCatalogProduct);
      }

      const productIds = products.map((p) => String(p.id));
      const variants = await sql`
        SELECT id, product_id, size, color, stock_quantity, reserved_stock, low_stock_threshold
        FROM product_variants
        WHERE product_id::text = ANY(${productIds}::text[])
      `;

      const variantsByProductId = new Map<string, VariantRow[]>();
      for (const v of variants) {
        const pId = String(v.product_id);
        if (!variantsByProductId.has(pId)) variantsByProductId.set(pId, []);
        variantsByProductId.get(pId)!.push({
          id: String(v.id),
          size: (v.size as string) || "",
          color: (v.color as string) || "",
          stock_quantity: Number(v.stock_quantity || 0),
          reserved_stock: Number(v.reserved_stock || 0),
          low_stock_threshold: Number(v.low_stock_threshold || 2),
        });
      }

      const rows: ProductRow[] = products.map((p) => ({
        id: String(p.id),
        name: p.name as string,
        slug: p.slug as string,
        description: (p.description as string) || null,
        price: Number(p.price || 0),
        currency: (p.currency as string) || "INR",
        images: Array.isArray(p.images)
          ? p.images
          : typeof p.images === "string"
            ? JSON.parse(p.images)
            : [],
        category: (p.category as string) || null,
        sizes: Array.isArray(p.sizes)
          ? p.sizes
          : typeof p.sizes === "string"
            ? JSON.parse(p.sizes)
            : [],
        colors: Array.isArray(p.colors)
          ? p.colors
          : typeof p.colors === "string"
            ? JSON.parse(p.colors)
            : [],
        stock_quantity: Number(p.stock_quantity || 0),
        is_active: Boolean(p.is_active),
        tags: Array.isArray(p.tags) ? p.tags : typeof p.tags === "string" ? JSON.parse(p.tags) : [],
        product_variants: variantsByProductId.get(String(p.id)) || [],
      }));

      return rows.map(toCatalogProduct);
    } catch (err) {
      console.warn("fetchProducts error, using fallback", err);
      return FALLBACK_PRODUCTS.slice(0, data.first || 20).map(toCatalogProduct);
    }
  });

export async function fetchProducts(first = 20): Promise<CatalogProduct[]> {
  try {
    return await fetchProductsServerFn({ data: { first } });
  } catch {
    return FALLBACK_PRODUCTS.slice(0, first).map(toCatalogProduct);
  }
}

export const fetchProductByHandleServerFn = createServerFn({ method: "POST" })
  .inputValidator((d: { handle: string }) => ({ handle: String(d.handle) }))
  .handler(async ({ data }): Promise<CatalogProductNode | null> => {
    try {
      await ensureDbSchema();
      await seedInitialProductsIfNeeded();
      const sql = getSql();

      const products = await sql`
        SELECT id, name, slug, description, price, currency, images, category, sizes, colors, stock_quantity, is_active, tags
        FROM products
        WHERE (slug = ${data.handle} OR id::text = ${data.handle}) AND is_active = true
        LIMIT 1
      `;

      if (!products || products.length === 0) {
        const fallback = FALLBACK_PRODUCTS.find(
          (p) => p.slug === data.handle || String(p.id) === data.handle,
        );
        return fallback ? toCatalogProduct(fallback).node : null;
      }

      const p = products[0];
      const variants = await sql`
        SELECT id, product_id, size, color, stock_quantity, reserved_stock, low_stock_threshold
        FROM product_variants
        WHERE product_id::text = ${String(p.id)}
      `;

      const variantRows: VariantRow[] = variants.map((v) => ({
        id: String(v.id),
        size: (v.size as string) || "",
        color: (v.color as string) || "",
        stock_quantity: Number(v.stock_quantity || 0),
        reserved_stock: Number(v.reserved_stock || 0),
        low_stock_threshold: Number(v.low_stock_threshold || 2),
      }));

      const row: ProductRow = {
        id: String(p.id),
        name: p.name as string,
        slug: p.slug as string,
        description: (p.description as string) || null,
        price: Number(p.price || 0),
        currency: (p.currency as string) || "INR",
        images: Array.isArray(p.images)
          ? p.images
          : typeof p.images === "string"
            ? JSON.parse(p.images)
            : [],
        category: (p.category as string) || null,
        sizes: Array.isArray(p.sizes)
          ? p.sizes
          : typeof p.sizes === "string"
            ? JSON.parse(p.sizes)
            : [],
        colors: Array.isArray(p.colors)
          ? p.colors
          : typeof p.colors === "string"
            ? JSON.parse(p.colors)
            : [],
        stock_quantity: Number(p.stock_quantity || 0),
        is_active: Boolean(p.is_active),
        tags: Array.isArray(p.tags) ? p.tags : typeof p.tags === "string" ? JSON.parse(p.tags) : [],
        product_variants: variantRows,
      };

      return toCatalogProduct(row).node;
    } catch (err) {
      console.warn("fetchProductByHandle error, using fallback", err);
      const fallback = FALLBACK_PRODUCTS.find(
        (p) => p.slug === data.handle || String(p.id) === data.handle,
      );
      return fallback ? toCatalogProduct(fallback).node : null;
    }
  });

export async function fetchProductByHandle(handle: string): Promise<CatalogProductNode | null> {
  try {
    return await fetchProductByHandleServerFn({ data: { handle } });
  } catch {
    const fallback = FALLBACK_PRODUCTS.find((p) => p.slug === handle || p.id === handle);
    return fallback ? toCatalogProduct(fallback).node : null;
  }
}

export function formatPrice(amount: string | number, currencyCode = "INR") {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currencyCode || "INR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currencyCode} ${value.toFixed(0)}`;
  }
}
