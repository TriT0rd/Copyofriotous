-- 1. Extend orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_code text,
  ADD COLUMN IF NOT EXISTS shipping_charge numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'Cash on Delivery',
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS courier_name text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS stock_state text NOT NULL DEFAULT 'none';

-- 2. Extend products for inventory tracking
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS reserved_stock integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 5;

-- 3. Wider status vocabulary
CREATE OR REPLACE FUNCTION public.validate_order_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('Pending','Confirmed','Processing','Packed','Shipped','Out for Delivery','Delivered','Cancelled','Returned','Refunded') THEN
    RAISE EXCEPTION 'Invalid order status: %', NEW.status;
  END IF;
  IF NEW.payment_status NOT IN ('Pending','Paid','Failed','Refunded') THEN
    RAISE EXCEPTION 'Invalid payment status: %', NEW.payment_status;
  END IF;
  IF NEW.stock_state NOT IN ('none','reserved','fulfilled','released') THEN
    RAISE EXCEPTION 'Invalid stock state: %', NEW.stock_state;
  END IF;
  RETURN NEW;
END;
$function$;

-- 4. Inventory movement history
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  delta_stock integer NOT NULL DEFAULT 0,
  delta_reserved integer NOT NULL DEFAULT 0,
  stock_after integer,
  reason text NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view inventory history" ON public.inventory_movements
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS inventory_movements_product_idx ON public.inventory_movements(product_id, created_at DESC);

-- 5. Admin audit log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins write audit log" ON public.admin_audit_log
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) AND actor_id = auth.uid());
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON public.admin_audit_log(created_at DESC);

-- 6. Admins can read customer profiles
CREATE POLICY "Admins view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

-- 7. Stock reservation engine (SECURITY DEFINER: customers may not touch products directly)
CREATE OR REPLACE FUNCTION public.reserve_order_stock(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o RECORD;
  it RECORD;
  avail integer;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
  IF o IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.stock_state <> 'none' THEN RETURN; END IF;

  FOR it IN
    SELECT product_id, SUM(quantity)::int AS qty
    FROM order_items WHERE order_id = p_order_id AND product_id IS NOT NULL
    GROUP BY product_id
  LOOP
    SELECT (stock_quantity - reserved_stock) INTO avail FROM products WHERE id = it.product_id FOR UPDATE;
    IF avail IS NULL THEN RAISE EXCEPTION 'Product unavailable'; END IF;
    IF avail < it.qty THEN RAISE EXCEPTION 'Insufficient stock for one of the items'; END IF;
    UPDATE products SET reserved_stock = reserved_stock + it.qty WHERE id = it.product_id;
    INSERT INTO inventory_movements (product_id, order_id, delta_reserved, reason, actor_id, stock_after)
    VALUES (it.product_id, p_order_id, it.qty, 'order_reserved', o.user_id,
            (SELECT stock_quantity FROM products WHERE id = it.product_id));
  END LOOP;

  UPDATE orders SET stock_state = 'reserved' WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fulfill_order_stock(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o RECORD;
  it RECORD;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
  IF o IS NULL OR o.stock_state <> 'reserved' THEN RETURN; END IF;

  FOR it IN
    SELECT product_id, SUM(quantity)::int AS qty
    FROM order_items WHERE order_id = p_order_id AND product_id IS NOT NULL
    GROUP BY product_id
  LOOP
    UPDATE products
      SET reserved_stock = GREATEST(0, reserved_stock - it.qty),
          stock_quantity = GREATEST(0, stock_quantity - it.qty)
      WHERE id = it.product_id;
    INSERT INTO inventory_movements (product_id, order_id, delta_stock, delta_reserved, reason, stock_after)
    VALUES (it.product_id, p_order_id, -it.qty, -it.qty, 'order_fulfilled',
            (SELECT stock_quantity FROM products WHERE id = it.product_id));
  END LOOP;

  UPDATE orders SET stock_state = 'fulfilled' WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_order_stock(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o RECORD;
  it RECORD;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
  IF o IS NULL THEN RETURN; END IF;

  FOR it IN
    SELECT product_id, SUM(quantity)::int AS qty
    FROM order_items WHERE order_id = p_order_id AND product_id IS NOT NULL
    GROUP BY product_id
  LOOP
    IF o.stock_state = 'reserved' THEN
      UPDATE products SET reserved_stock = GREATEST(0, reserved_stock - it.qty) WHERE id = it.product_id;
      INSERT INTO inventory_movements (product_id, order_id, delta_reserved, reason, stock_after)
      VALUES (it.product_id, p_order_id, -it.qty, 'order_released',
              (SELECT stock_quantity FROM products WHERE id = it.product_id));
    ELSIF o.stock_state = 'fulfilled' THEN
      UPDATE products SET stock_quantity = stock_quantity + it.qty WHERE id = it.product_id;
      INSERT INTO inventory_movements (product_id, order_id, delta_stock, reason, stock_after)
      VALUES (it.product_id, p_order_id, it.qty, 'order_restocked',
              (SELECT stock_quantity FROM products WHERE id = it.product_id));
    END IF;
  END LOOP;

  UPDATE orders SET stock_state = 'released' WHERE id = p_order_id;
END;
$$;

-- Admin-only manual stock adjustment
CREATE OR REPLACE FUNCTION public.admin_adjust_stock(p_product_id uuid, p_new_quantity integer, p_reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cur integer;
BEGIN
  IF NOT private.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  SELECT stock_quantity INTO cur FROM products WHERE id = p_product_id FOR UPDATE;
  IF cur IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  UPDATE products SET stock_quantity = GREATEST(0, p_new_quantity) WHERE id = p_product_id;
  INSERT INTO inventory_movements (product_id, delta_stock, reason, actor_id, stock_after)
  VALUES (p_product_id, GREATEST(0, p_new_quantity) - cur, COALESCE(p_reason, 'manual_adjustment'), auth.uid(), GREATEST(0, p_new_quantity));
  RETURN GREATEST(0, p_new_quantity);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_order_stock(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fulfill_order_stock(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_order_stock(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_adjust_stock(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_order_stock(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_order_stock(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_order_stock(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_adjust_stock(uuid, integer, text) TO authenticated, service_role;

-- 8. Staff roles for later phases
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
