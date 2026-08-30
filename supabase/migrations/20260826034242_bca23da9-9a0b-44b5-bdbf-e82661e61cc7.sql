-- ============ store settings (configurable return window) ============
CREATE TABLE public.store_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.store_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Settings are readable" ON public.store_settings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage settings" ON public.store_settings
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_store_settings_updated_at BEFORE UPDATE ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.store_settings (key, value)
VALUES ('returns', '{"window_days": 7, "require_delivered": true}'::jsonb);

-- ============ returns ============
CREATE TABLE public.returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  product_image text,
  selected_size text,
  selected_color text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  reason text NOT NULL,
  customer_message text,
  images text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'Return Requested',
  admin_message text,
  rejection_reason text,
  refund_status text NOT NULL DEFAULT 'Refund Pending',
  refund_amount numeric,
  refund_reference text,
  refunded_at timestamptz,
  pickup_details text,
  inventory_restored boolean NOT NULL DEFAULT false,
  inventory_restored_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX returns_user_idx ON public.returns(user_id);
CREATE INDEX returns_order_idx ON public.returns(order_id);
CREATE UNIQUE INDEX returns_open_per_item_idx ON public.returns(order_item_id)
  WHERE status NOT IN ('Rejected', 'Return Cancelled');

GRANT SELECT, INSERT, UPDATE ON public.returns TO authenticated;
GRANT ALL ON public.returns TO service_role;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own returns" ON public.returns
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own returns" ON public.returns
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = returns.order_id AND o.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.id = returns.order_item_id AND oi.order_id = returns.order_id
    )
    AND status = 'Return Requested'
  );
CREATE POLICY "Users cancel own returns" ON public.returns
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status IN ('Return Requested', 'Under Review'))
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all returns" ON public.returns
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update returns" ON public.returns
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_returns_updated_at BEFORE UPDATE ON public.returns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ status history ============
CREATE TABLE public.return_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL,
  changed_by uuid,
  changed_by_role text NOT NULL DEFAULT 'system',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX return_status_history_return_idx ON public.return_status_history(return_id);
GRANT SELECT ON public.return_status_history TO authenticated;
GRANT ALL ON public.return_status_history TO service_role;
ALTER TABLE public.return_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own return history" ON public.return_status_history
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.returns r
    WHERE r.id = return_status_history.return_id AND r.user_id = auth.uid()
  ));
CREATE POLICY "Admins view all return history" ON public.return_status_history
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

-- ============ email notification log ============
CREATE TABLE public.return_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  event text NOT NULL,
  recipient text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_id, event)
);
GRANT SELECT, INSERT, UPDATE ON public.return_notifications TO authenticated;
GRANT ALL ON public.return_notifications TO service_role;
ALTER TABLE public.return_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage notifications for own returns" ON public.return_notifications
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.returns r
    WHERE r.id = return_notifications.return_id AND r.user_id = auth.uid()
  ));
CREATE POLICY "Users view notifications for own returns" ON public.return_notifications
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.returns r
    WHERE r.id = return_notifications.return_id AND r.user_id = auth.uid()
  ));
CREATE POLICY "Users update notifications for own returns" ON public.return_notifications
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.returns r
    WHERE r.id = return_notifications.return_id AND r.user_id = auth.uid()
  ))
  WITH CHECK (true);
CREATE POLICY "Admins manage return notifications" ON public.return_notifications
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert return notifications" ON public.return_notifications
  FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update return notifications" ON public.return_notifications
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_return_notifications_updated_at BEFORE UPDATE ON public.return_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ workflow validation ============
CREATE OR REPLACE FUNCTION private.return_transition_allowed(_old text, _new text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _old = _new THEN true
    WHEN _old = 'Return Requested' THEN _new IN ('Under Review','Approved','Rejected','Return Cancelled')
    WHEN _old = 'Under Review' THEN _new IN ('Approved','Rejected','Return Cancelled')
    WHEN _old = 'Approved' THEN _new IN ('Pickup Scheduled','Return Cancelled')
    WHEN _old = 'Pickup Scheduled' THEN _new IN ('Picked Up','Return Cancelled')
    WHEN _old = 'Picked Up' THEN _new IN ('Received')
    WHEN _old = 'Received' THEN _new IN ('Refund Processing','Refunded')
    WHEN _old = 'Refund Processing' THEN _new IN ('Refunded')
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION private.tg_returns_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text := 'system';
BEGIN
  IF NEW.status NOT IN ('Return Requested','Under Review','Approved','Rejected',
      'Pickup Scheduled','Picked Up','Received','Refund Processing','Refunded','Return Cancelled') THEN
    RAISE EXCEPTION 'Invalid return status: %', NEW.status;
  END IF;
  IF NEW.refund_status NOT IN ('Refund Pending','Refund Processing','Refunded','Refund Failed') THEN
    RAISE EXCEPTION 'Invalid refund status: %', NEW.refund_status;
  END IF;

  IF v_actor IS NOT NULL AND private.has_role(v_actor, 'admin'::app_role) THEN
    v_role := 'admin';
  ELSIF v_actor IS NOT NULL THEN
    v_role := 'customer';
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.return_status_history (return_id, previous_status, new_status, changed_by, changed_by_role, note)
    VALUES (NEW.id, NULL, NEW.status, v_actor, v_role, NEW.customer_message);
    RETURN NEW;
  END IF;

  IF NEW.status <> OLD.status THEN
    IF NOT private.return_transition_allowed(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Cannot move a return from % to %', OLD.status, NEW.status;
    END IF;

    -- Restore inventory exactly once, only when the item is physically received.
    IF NEW.status = 'Received' AND NOT OLD.inventory_restored THEN
      IF NEW.variant_id IS NOT NULL THEN
        UPDATE public.product_variants
           SET stock_quantity = stock_quantity + NEW.quantity
         WHERE id = NEW.variant_id;
      ELSIF NEW.product_id IS NOT NULL THEN
        UPDATE public.products
           SET stock_quantity = stock_quantity + NEW.quantity
         WHERE id = NEW.product_id;
      END IF;
      IF NEW.product_id IS NOT NULL THEN
        INSERT INTO public.inventory_movements
          (product_id, variant_id, order_id, delta_stock, reason, actor_id)
        VALUES (NEW.product_id, NEW.variant_id, NEW.order_id, NEW.quantity,
                'return_received', v_actor);
      END IF;
      NEW.inventory_restored := true;
      NEW.inventory_restored_at := now();
    END IF;

    IF NEW.status = 'Refund Processing' AND NEW.refund_status = 'Refund Pending' THEN
      NEW.refund_status := 'Refund Processing';
    END IF;
    IF NEW.status = 'Refunded' THEN
      NEW.refund_status := 'Refunded';
      IF NEW.refunded_at IS NULL THEN NEW.refunded_at := now(); END IF;
    END IF;

    INSERT INTO public.return_status_history (return_id, previous_status, new_status, changed_by, changed_by_role, note)
    VALUES (NEW.id, OLD.status, NEW.status, v_actor, v_role,
            COALESCE(NEW.rejection_reason, NEW.admin_message));
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER returns_guard_insert BEFORE INSERT ON public.returns
  FOR EACH ROW EXECUTE FUNCTION private.tg_returns_guard();
CREATE TRIGGER returns_guard_update BEFORE UPDATE ON public.returns
  FOR EACH ROW EXECUTE FUNCTION private.tg_returns_guard();