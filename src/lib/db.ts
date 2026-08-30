import { neon } from "@neondatabase/serverless";

let _schemaInitialized = false;
let _schemaPromise: Promise<void> | null = null;

export function getDatabaseUrl(): string | null {
  return process.env.DATABASE_URL || null;
}

export function getSql() {
  const url = getDatabaseUrl();
  if (!url) {
    const mockSql = async (strings: TemplateStringsArray, ...values: any[]) => {
      const query = strings
        .reduce((acc, str, i) => acc + str + (values[i] !== undefined ? values[i] : ""), "")
        .trim();
      const lower = query.toLowerCase();
      if (lower.startsWith("select count")) {
        return [
          {
            count: 0,
            order_count: 0,
            product_count: 0,
            customer_count: 0,
            total_sales: 0,
            sales_today: 0,
            sales_month: 0,
          },
        ];
      }
      if (lower.includes("return_settings")) {
        return [{ id: "default", window_days: 7, require_delivered: true }];
      }
      return [];
    };
    return mockSql as any;
  }
  return neon(url);
}

/**
 * Initializes all required database tables, indexes, and initial data in Neon PostgreSQL.
 * Optimized for high performance and fast dashboard startup with singleton promise locking.
 */
export async function ensureDbSchema() {
  if (_schemaInitialized) return;
  if (_schemaPromise) return _schemaPromise;
  if (!process.env.DATABASE_URL) {
    _schemaInitialized = true;
    return;
  }

  _schemaPromise = (async () => {
    try {
      const sql = getSql();

      // Execute core schema creation in consolidated fast batches
      await sql`
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          full_name TEXT,
          role TEXT NOT NULL DEFAULT 'customer',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          description TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS products (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          description TEXT,
          price NUMERIC NOT NULL DEFAULT 0,
          currency TEXT NOT NULL DEFAULT 'INR',
          images JSONB NOT NULL DEFAULT '[]'::jsonb,
          category TEXT,
          sizes JSONB NOT NULL DEFAULT '[]'::jsonb,
          colors JSONB NOT NULL DEFAULT '[]'::jsonb,
          stock_quantity INTEGER NOT NULL DEFAULT 0,
          reserved_stock INTEGER NOT NULL DEFAULT 0,
          low_stock_threshold INTEGER NOT NULL DEFAULT 2,
          is_active BOOLEAN NOT NULL DEFAULT true,
          tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS product_variants (
          id TEXT PRIMARY KEY,
          product_id TEXT,
          size TEXT,
          color TEXT,
          sku TEXT,
          stock_quantity INTEGER NOT NULL DEFAULT 0,
          reserved_stock INTEGER NOT NULL DEFAULT 0,
          low_stock_threshold INTEGER NOT NULL DEFAULT 2,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          order_number TEXT UNIQUE NOT NULL,
          subtotal NUMERIC NOT NULL DEFAULT 0,
          discount_amount NUMERIC NOT NULL DEFAULT 0,
          discount_code TEXT,
          shipping_charge NUMERIC NOT NULL DEFAULT 0,
          tax_amount NUMERIC NOT NULL DEFAULT 0,
          total_amount NUMERIC NOT NULL DEFAULT 0,
          currency TEXT NOT NULL DEFAULT 'INR',
          status TEXT NOT NULL DEFAULT 'Pending',
          payment_status TEXT NOT NULL DEFAULT 'Pending',
          payment_method TEXT NOT NULL DEFAULT 'COD',
          stock_state TEXT DEFAULT 'Normal',
          shipping_name TEXT NOT NULL,
          shipping_email TEXT NOT NULL,
          shipping_phone TEXT,
          shipping_address TEXT NOT NULL,
          billing_address TEXT,
          courier_name TEXT,
          tracking_number TEXT,
          tracking_url TEXT,
          shipped_at TIMESTAMP WITH TIME ZONE,
          delivered_at TIMESTAMP WITH TIME ZONE,
          cancelled_at TIMESTAMP WITH TIME ZONE,
          admin_notes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS order_items (
          id TEXT PRIMARY KEY,
          order_id TEXT,
          product_id TEXT,
          variant_id TEXT,
          design_submission_id TEXT,
          product_name TEXT NOT NULL,
          product_image TEXT,
          quantity INTEGER NOT NULL DEFAULT 1,
          price NUMERIC NOT NULL DEFAULT 0,
          selected_size TEXT,
          selected_color TEXT,
          subtotal NUMERIC NOT NULL DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS addresses (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          name TEXT,
          street TEXT NOT NULL,
          city TEXT NOT NULL,
          state TEXT NOT NULL,
          postal_code TEXT NOT NULL,
          country TEXT NOT NULL,
          phone TEXT,
          is_default BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reviews (
          id TEXT PRIMARY KEY,
          product_id TEXT,
          user_id TEXT,
          author_name TEXT NOT NULL,
          rating INTEGER NOT NULL DEFAULT 5,
          title TEXT,
          content TEXT NOT NULL,
          is_verified_buyer BOOLEAN NOT NULL DEFAULT false,
          status TEXT NOT NULL DEFAULT 'approved',
          images JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS returns (
          id TEXT PRIMARY KEY,
          return_number TEXT UNIQUE NOT NULL,
          order_id TEXT,
          order_item_id TEXT,
          user_id TEXT,
          quantity INTEGER DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'Requested',
          reason TEXT NOT NULL,
          comments TEXT,
          refund_amount NUMERIC DEFAULT 0,
          items JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS return_settings (
          id TEXT PRIMARY KEY DEFAULT 'default',
          window_days INTEGER NOT NULL DEFAULT 7,
          require_delivered BOOLEAN NOT NULL DEFAULT true,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS design_submissions (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          customer_name TEXT,
          customer_email TEXT,
          color_name TEXT NOT NULL,
          placement TEXT NOT NULL,
          product_title TEXT,
          variant_id TEXT,
          price NUMERIC,
          preview_data_url TEXT,
          preview_images JSONB DEFAULT '[]'::jsonb,
          canvases JSONB,
          emailed_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS favorites (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          product_handle TEXT NOT NULL,
          product_title TEXT NOT NULL,
          product_price NUMERIC,
          product_image TEXT,
          product_currency TEXT DEFAULT 'INR',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS carts (
          user_id TEXT PRIMARY KEY,
          items JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS admin_audit_log (
          id TEXT PRIMARY KEY,
          actor_id TEXT,
          actor_email TEXT,
          action TEXT NOT NULL,
          entity_type TEXT,
          entity_id TEXT,
          details JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS return_notifications (
          id TEXT PRIMARY KEY,
          return_id TEXT,
          event TEXT,
          recipient TEXT,
          subject TEXT,
          status TEXT DEFAULT 'pending',
          error TEXT,
          attempts INTEGER DEFAULT 0,
          sent_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `;

      // Add high-performance indexes for fast queries
      await sql`
        CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
        CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders (user_id);
        CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
        CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_products_is_active ON products (is_active);
        CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants (product_id);
        CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews (product_id);
        CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites (user_id);

        UPDATE profiles SET role = 'admin' WHERE email IN ('princevekariya9898@gmail.com', 'princevekariya989835@gmail.com', 'admin@riotous.com');

        INSERT INTO return_settings (id, window_days, require_delivered)
        VALUES ('default', 7, true)
        ON CONFLICT (id) DO NOTHING;
      `;

      _schemaInitialized = true;
    } catch (err) {
      console.error("[Neon DB] ensureDbSchema warning:", err);
      // Mark as initialized on failure too to prevent re-querying every single request
      _schemaInitialized = true;
    } finally {
      _schemaPromise = null;
    }
  })();

  return _schemaPromise;
}
