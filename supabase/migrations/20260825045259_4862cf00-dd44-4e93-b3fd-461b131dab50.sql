-- 1. Variant-level inventory ------------------------------------------------
CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  size text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '',
  stock_quantity integer NOT NULL DEFAULT 0,
  reserved_stock integer NOT NULL DEFAULT 0,
  low_stock_threshold integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, size, color)
);

GRANT SELECT ON public.product_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Variants of active products are public"
  ON public.product_variants FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active));

CREATE POLICY "Admins view all variants"
  ON public.product_variants FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert variants"
  ON public.product_variants FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update variants"
  ON public.product_variants FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete variants"
  ON public.product_variants FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX product_variants_product_id_idx ON public.product_variants (product_id);

-- 2. Remember the purchased variant on the order line ------------------------
ALTER TABLE public.order_items
  ADD COLUMN variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL;

ALTER TABLE public.inventory_movements
  ADD COLUMN variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL;

-- 3. Keep the product-level totals derived from its variants -----------------
CREATE OR REPLACE FUNCTION private.sync_product_stock(_product_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s integer; r integer; n integer;
BEGIN
  SELECT count(*), COALESCE(sum(stock_quantity),0), COALESCE(sum(reserved_stock),0)
    INTO n, s, r FROM product_variants WHERE product_id = _product_id;
  IF n > 0 THEN
    UPDATE products SET stock_quantity = s, reserved_stock = r WHERE id = _product_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.tg_sync_product_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM private.sync_product_stock(COALESCE(NEW.product_id, OLD.product_id));
  RETURN NULL;
END $$;

-- 4. Backfill variants from the existing size/colour lists -------------------
DO $backfill$
DECLARE
  p RECORD; s text; c text; v_sizes text[]; v_colors text[];
  n integer; base integer; rem integer; i integer; q integer;
BEGIN
  FOR p IN SELECT id, sizes, colors, stock_quantity FROM products LOOP
    v_sizes  := CASE WHEN COALESCE(array_length(p.sizes,1),0)  > 0 THEN p.sizes  ELSE ARRAY['']::text[] END;
    v_colors := CASE WHEN COALESCE(array_length(p.colors,1),0) > 0 THEN p.colors ELSE ARRAY['']::text[] END;
    n := array_length(v_sizes,1) * array_length(v_colors,1);
    base := GREATEST(p.stock_quantity,0) / n;
    rem  := GREATEST(p.stock_quantity,0) % n;
    i := 0;
    FOREACH c IN ARRAY v_colors LOOP
      FOREACH s IN ARRAY v_sizes LOOP
        i := i + 1;
        q := base + CASE WHEN i <= rem THEN 1 ELSE 0 END;
        INSERT INTO product_variants (product_id, size, color, stock_quantity)
        VALUES (p.id, s, c, q)
        ON CONFLICT (product_id, size, color) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $backfill$;

CREATE TRIGGER sync_product_stock_from_variants
  AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION private.tg_sync_product_stock();

-- 5. Reserve the exact variant when an order line is created -----------------
CREATE OR REPLACE FUNCTION private.tg_reserve_order_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; avail integer; owner uuid; label text;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  SELECT user_id INTO owner FROM orders WHERE id = NEW.order_id;
  label := COALESCE(NULLIF(concat_ws(' / ', NULLIF(NEW.selected_size,''), NULLIF(NEW.selected_color,'')), ''), 'default');

  v_id := NEW.variant_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM product_variants
     WHERE product_id = NEW.product_id
       AND size = COALESCE(NEW.selected_size,'')
       AND color = COALESCE(NEW.selected_color,'');
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT (stock_quantity - reserved_stock) INTO avail
      FROM product_variants WHERE id = v_id FOR UPDATE;
    IF avail IS NULL THEN RAISE EXCEPTION 'Product unavailable'; END IF;
    IF avail < NEW.quantity THEN
      RAISE EXCEPTION 'Only % item(s) available for % (%)', GREATEST(avail,0), NEW.product_name, label;
    END IF;
    UPDATE product_variants SET reserved_stock = reserved_stock + NEW.quantity WHERE id = v_id;
    NEW.variant_id := v_id;
    INSERT INTO inventory_movements (product_id, variant_id, order_id, delta_reserved, reason, actor_id, stock_after)
    VALUES (NEW.product_id, v_id, NEW.order_id, NEW.quantity, 'order_reserved', owner,
            (SELECT stock_quantity FROM product_variants WHERE id = v_id));
  ELSE
    SELECT (stock_quantity - reserved_stock) INTO avail FROM products WHERE id = NEW.product_id FOR UPDATE;
    IF avail IS NULL THEN RAISE EXCEPTION 'Product unavailable'; END IF;
    IF avail < NEW.quantity THEN
      RAISE EXCEPTION 'Only % item(s) available for %', GREATEST(avail,0), NEW.product_name;
    END IF;
    UPDATE products SET reserved_stock = reserved_stock + NEW.quantity WHERE id = NEW.product_id;
    INSERT INTO inventory_movements (product_id, order_id, delta_reserved, reason, actor_id, stock_after)
    VALUES (NEW.product_id, NEW.order_id, NEW.quantity, 'order_reserved', owner,
            (SELECT stock_quantity FROM products WHERE id = NEW.product_id));
  END IF;

  UPDATE orders SET stock_state = 'reserved' WHERE id = NEW.order_id AND stock_state = 'none';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reserve_stock_on_order_item ON public.order_items;
CREATE TRIGGER reserve_stock_on_order_item
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION private.tg_reserve_order_item();

-- 6. Fulfil / release the exact variant on status changes -------------------
CREATE OR REPLACE FUNCTION private.tg_orders_stock_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it RECORD;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  IF NEW.status IN ('Shipped','Out for Delivery','Delivered') AND OLD.stock_state = 'reserved' THEN
    FOR it IN
      SELECT product_id, variant_id, SUM(quantity)::int AS qty FROM order_items
      WHERE order_id = NEW.id AND product_id IS NOT NULL
      GROUP BY product_id, variant_id
    LOOP
      IF it.variant_id IS NOT NULL THEN
        UPDATE product_variants
          SET reserved_stock = GREATEST(0, reserved_stock - it.qty),
              stock_quantity = GREATEST(0, stock_quantity - it.qty)
          WHERE id = it.variant_id;
        INSERT INTO inventory_movements (product_id, variant_id, order_id, delta_stock, delta_reserved, reason, stock_after)
        VALUES (it.product_id, it.variant_id, NEW.id, -it.qty, -it.qty, 'order_fulfilled',
                (SELECT stock_quantity FROM product_variants WHERE id = it.variant_id));
      ELSE
        UPDATE products
          SET reserved_stock = GREATEST(0, reserved_stock - it.qty),
              stock_quantity = GREATEST(0, stock_quantity - it.qty)
          WHERE id = it.product_id;
        INSERT INTO inventory_movements (product_id, order_id, delta_stock, delta_reserved, reason, stock_after)
        VALUES (it.product_id, NEW.id, -it.qty, -it.qty, 'order_fulfilled',
                (SELECT stock_quantity FROM products WHERE id = it.product_id));
      END IF;
    END LOOP;
    NEW.stock_state := 'fulfilled';
    IF NEW.shipped_at IS NULL AND NEW.status <> 'Delivered' THEN NEW.shipped_at := now(); END IF;
    IF NEW.status = 'Delivered' AND NEW.delivered_at IS NULL THEN NEW.delivered_at := now(); END IF;

  ELSIF NEW.status IN ('Cancelled','Returned','Refunded') AND OLD.stock_state IN ('reserved','fulfilled') THEN
    FOR it IN
      SELECT product_id, variant_id, SUM(quantity)::int AS qty FROM order_items
      WHERE order_id = NEW.id AND product_id IS NOT NULL
      GROUP BY product_id, variant_id
    LOOP
      IF OLD.stock_state = 'reserved' THEN
        IF it.variant_id IS NOT NULL THEN
          UPDATE product_variants SET reserved_stock = GREATEST(0, reserved_stock - it.qty) WHERE id = it.variant_id;
          INSERT INTO inventory_movements (product_id, variant_id, order_id, delta_reserved, reason, stock_after)
          VALUES (it.product_id, it.variant_id, NEW.id, -it.qty, 'order_released',
                  (SELECT stock_quantity FROM product_variants WHERE id = it.variant_id));
        ELSE
          UPDATE products SET reserved_stock = GREATEST(0, reserved_stock - it.qty) WHERE id = it.product_id;
          INSERT INTO inventory_movements (product_id, order_id, delta_reserved, reason, stock_after)
          VALUES (it.product_id, NEW.id, -it.qty, 'order_released',
                  (SELECT stock_quantity FROM products WHERE id = it.product_id));
        END IF;
      ELSE
        IF it.variant_id IS NOT NULL THEN
          UPDATE product_variants SET stock_quantity = stock_quantity + it.qty WHERE id = it.variant_id;
          INSERT INTO inventory_movements (product_id, variant_id, order_id, delta_stock, reason, stock_after)
          VALUES (it.product_id, it.variant_id, NEW.id, it.qty, 'order_restocked',
                  (SELECT stock_quantity FROM product_variants WHERE id = it.variant_id));
        ELSE
          UPDATE products SET stock_quantity = stock_quantity + it.qty WHERE id = it.product_id;
          INSERT INTO inventory_movements (product_id, order_id, delta_stock, reason, stock_after)
          VALUES (it.product_id, NEW.id, it.qty, 'order_restocked',
                  (SELECT stock_quantity FROM products WHERE id = it.product_id));
        END IF;
      END IF;
    END LOOP;
    NEW.stock_state := 'released';
    IF NEW.status = 'Cancelled' AND NEW.cancelled_at IS NULL THEN NEW.cancelled_at := now(); END IF;

  ELSIF NEW.status = 'Delivered' AND NEW.delivered_at IS NULL THEN
    NEW.delivered_at := now();
  END IF;

  RETURN NEW;
END $$;