DROP FUNCTION IF EXISTS public.reserve_order_stock(uuid);
DROP FUNCTION IF EXISTS public.fulfill_order_stock(uuid);
DROP FUNCTION IF EXISTS public.release_order_stock(uuid);
DROP FUNCTION IF EXISTS public.admin_adjust_stock(uuid, integer, text);

-- Reserve stock as order items are created
CREATE OR REPLACE FUNCTION private.tg_reserve_order_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  avail integer;
  owner uuid;
BEGIN
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;

  SELECT (stock_quantity - reserved_stock) INTO avail FROM products WHERE id = NEW.product_id FOR UPDATE;
  IF avail IS NULL THEN RAISE EXCEPTION 'Product unavailable'; END IF;
  IF avail < NEW.quantity THEN RAISE EXCEPTION 'Insufficient stock for %', NEW.product_name; END IF;

  UPDATE products SET reserved_stock = reserved_stock + NEW.quantity WHERE id = NEW.product_id;

  SELECT user_id INTO owner FROM orders WHERE id = NEW.order_id;
  INSERT INTO inventory_movements (product_id, order_id, delta_reserved, reason, actor_id, stock_after)
  VALUES (NEW.product_id, NEW.order_id, NEW.quantity, 'order_reserved', owner,
          (SELECT stock_quantity FROM products WHERE id = NEW.product_id));

  UPDATE orders SET stock_state = 'reserved' WHERE id = NEW.order_id AND stock_state = 'none';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reserve_stock_on_order_item ON public.order_items;
CREATE TRIGGER reserve_stock_on_order_item
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION private.tg_reserve_order_item();

-- Consume / release stock as the order status changes
CREATE OR REPLACE FUNCTION private.tg_orders_stock_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  it RECORD;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  IF NEW.status IN ('Shipped','Out for Delivery','Delivered') AND OLD.stock_state = 'reserved' THEN
    FOR it IN
      SELECT product_id, SUM(quantity)::int AS qty FROM order_items
      WHERE order_id = NEW.id AND product_id IS NOT NULL GROUP BY product_id
    LOOP
      UPDATE products
        SET reserved_stock = GREATEST(0, reserved_stock - it.qty),
            stock_quantity = GREATEST(0, stock_quantity - it.qty)
        WHERE id = it.product_id;
      INSERT INTO inventory_movements (product_id, order_id, delta_stock, delta_reserved, reason, stock_after)
      VALUES (it.product_id, NEW.id, -it.qty, -it.qty, 'order_fulfilled',
              (SELECT stock_quantity FROM products WHERE id = it.product_id));
    END LOOP;
    NEW.stock_state := 'fulfilled';
    IF NEW.shipped_at IS NULL AND NEW.status <> 'Delivered' THEN NEW.shipped_at := now(); END IF;
    IF NEW.status = 'Delivered' AND NEW.delivered_at IS NULL THEN NEW.delivered_at := now(); END IF;

  ELSIF NEW.status IN ('Cancelled','Returned','Refunded') AND OLD.stock_state IN ('reserved','fulfilled') THEN
    FOR it IN
      SELECT product_id, SUM(quantity)::int AS qty FROM order_items
      WHERE order_id = NEW.id AND product_id IS NOT NULL GROUP BY product_id
    LOOP
      IF OLD.stock_state = 'reserved' THEN
        UPDATE products SET reserved_stock = GREATEST(0, reserved_stock - it.qty) WHERE id = it.product_id;
        INSERT INTO inventory_movements (product_id, order_id, delta_reserved, reason, stock_after)
        VALUES (it.product_id, NEW.id, -it.qty, 'order_released',
                (SELECT stock_quantity FROM products WHERE id = it.product_id));
      ELSE
        UPDATE products SET stock_quantity = stock_quantity + it.qty WHERE id = it.product_id;
        INSERT INTO inventory_movements (product_id, order_id, delta_stock, reason, stock_after)
        VALUES (it.product_id, NEW.id, it.qty, 'order_restocked',
                (SELECT stock_quantity FROM products WHERE id = it.product_id));
      END IF;
    END LOOP;
    NEW.stock_state := 'released';
    IF NEW.status = 'Cancelled' AND NEW.cancelled_at IS NULL THEN NEW.cancelled_at := now(); END IF;

  ELSIF NEW.status = 'Delivered' AND NEW.delivered_at IS NULL THEN
    NEW.delivered_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_stock_transition ON public.orders;
CREATE TRIGGER orders_stock_transition
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION private.tg_orders_stock_transition();

-- Admins may record manual stock adjustments in the history
CREATE POLICY "Admins write inventory history" ON public.inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
