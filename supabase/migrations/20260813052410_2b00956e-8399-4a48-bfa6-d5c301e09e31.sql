-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  images text[] NOT NULL DEFAULT '{}',
  category text,
  sizes text[] NOT NULL DEFAULT '{}',
  colors text[] NOT NULL DEFAULT '{}',
  stock_quantity integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active products are public" ON public.products
  FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "Admins view all products" ON public.products
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert products" ON public.products
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update products" ON public.products
  FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete products" ON public.products
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CARTS ============
CREATE TABLE public.carts (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.carts TO authenticated;
GRANT ALL ON public.carts TO service_role;

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cart" ON public.carts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_carts_updated_at BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ORDERS ============
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_number text NOT NULL UNIQUE,
  total_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'Pending',
  payment_status text NOT NULL DEFAULT 'Pending',
  shipping_name text NOT NULL,
  shipping_email text NOT NULL,
  shipping_phone text,
  shipping_address text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own orders" ON public.orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own orders" ON public.orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all orders" ON public.orders
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update orders" ON public.orders
  FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX orders_user_id_idx ON public.orders(user_id);

-- validation without immutable-check problems
CREATE OR REPLACE FUNCTION public.validate_order_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('Pending','Confirmed','Processing','Shipped','Delivered','Cancelled') THEN
    RAISE EXCEPTION 'Invalid order status: %', NEW.status;
  END IF;
  IF NEW.payment_status NOT IN ('Pending','Paid','Failed','Refunded') THEN
    RAISE EXCEPTION 'Invalid payment status: %', NEW.payment_status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_orders BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_order_row();

-- ============ ORDER ITEMS ============
CREATE TABLE public.order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  design_submission_id uuid REFERENCES public.design_submissions(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  product_image text,
  quantity integer NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  selected_size text,
  selected_color text,
  subtotal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own order items" ON public.order_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
  );
CREATE POLICY "Users create own order items" ON public.order_items
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
  );
CREATE POLICY "Admins view all order items" ON public.order_items
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX order_items_order_id_idx ON public.order_items(order_id);

-- ============ DESIGN SUBMISSIONS: canvases visible to admin already; keep as is ============

-- ============ SEED EXISTING PRODUCTS ============
INSERT INTO public.products (name, slug, description, price, images, category, sizes, colors, stock_quantity, is_active, tags)
VALUES
  (
    'Zenitsu Thunder Tee — Maroon',
    'zenitsu-thunder-tee-maroon',
    E'Premium DTF printed oversized tee in deep maroon with a thunder-breathing graphic.\n\n100% combed cotton, 240 GSM. Boxy fit.',
    1199,
    ARRAY['/products/zenitsu-maroon-1.jpg','/products/zenitsu-maroon-2.jpg'],
    'Oversized Tee',
    ARRAY['S','M','L','XL','XXL'],
    ARRAY['Maroon'],
    25,
    true,
    ARRAY['new']
  ),
  (
    'Zoro Three Sword Tee — Black',
    'zoro-three-sword-tee-black',
    E'Premium DTF printed oversized tee in black with a three-sword-style graphic.\n\n100% combed cotton, 240 GSM. Boxy fit.',
    1199,
    ARRAY['/products/zoro-black-1.jpg','/products/zoro-black-2.jpg'],
    'Oversized Tee',
    ARRAY['S','M','L','XL','XXL'],
    ARRAY['Black'],
    25,
    true,
    ARRAY['trending']
  ),
  (
    'Zoro Three Sword Tee — Olive Green',
    'zoro-three-sword-tee-olive-green',
    E'Premium DTF printed oversized tee in olive green with a three-sword-style graphic.\n\n100% combed cotton, 240 GSM. Boxy fit.',
    1199,
    ARRAY['/products/zoro-olive-1.jpg','/products/zoro-olive-2.jpg'],
    'Oversized Tee',
    ARRAY['S','M','L','XL','XXL'],
    ARRAY['Olive Green'],
    25,
    true,
    ARRAY['limited']
  );