CREATE TABLE public.reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text,
  review text,
  images text[] NOT NULL DEFAULT '{}',
  verified_purchase boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','hidden')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_unique_user_product UNIQUE (user_id, product_id),
  CONSTRAINT reviews_title_len CHECK (title IS NULL OR char_length(title) <= 100),
  CONSTRAINT reviews_text_len CHECK (review IS NULL OR char_length(review) <= 2000),
  CONSTRAINT reviews_images_max CHECK (array_length(images, 1) IS NULL OR array_length(images, 1) <= 5)
);

CREATE INDEX reviews_product_status_idx ON public.reviews (product_id, status);
CREATE INDEX reviews_user_idx ON public.reviews (user_id);
CREATE INDEX reviews_created_idx ON public.reviews (created_at DESC);

GRANT SELECT ON public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Server-side purchase verification helper.
CREATE OR REPLACE FUNCTION private.has_delivered_purchase(_user_id uuid, _product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.user_id = _user_id
      AND oi.product_id = _product_id
      AND o.status = 'Delivered'
  );
$$;

CREATE OR REPLACE FUNCTION private.delivered_order_for_product(_user_id uuid, _product_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT o.id
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.user_id = _user_id
    AND oi.product_id = _product_id
    AND o.status = 'Delivered'
  ORDER BY o.created_at DESC
  LIMIT 1;
$$;

-- Customers may never set verification or moderation state themselves.
CREATE OR REPLACE FUNCTION private.tg_reviews_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  is_admin boolean := private.has_role(auth.uid(), 'admin');
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.updated_at := now();
    IF NOT is_admin THEN
      IF NEW.user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Cannot create a review for another user';
      END IF;
      IF NOT private.has_delivered_purchase(NEW.user_id, NEW.product_id) THEN
        RAISE EXCEPTION 'Only customers with a delivered order for this product can review it';
      END IF;
      NEW.verified_purchase := true;
      NEW.status := 'pending';
      NEW.order_id := private.delivered_order_for_product(NEW.user_id, NEW.product_id);
      NEW.admin_note := NULL;
    END IF;
    RETURN NEW;
  END IF;

  NEW.updated_at := now();
  IF NOT is_admin THEN
    NEW.user_id := OLD.user_id;
    NEW.product_id := OLD.product_id;
    NEW.order_id := OLD.order_id;
    NEW.verified_purchase := OLD.verified_purchase;
    NEW.created_at := OLD.created_at;
    NEW.admin_note := OLD.admin_note;
    -- Edited content goes back through moderation.
    IF NEW.rating IS DISTINCT FROM OLD.rating
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.review IS DISTINCT FROM OLD.review
       OR NEW.images IS DISTINCT FROM OLD.images THEN
      NEW.status := 'pending';
    ELSE
      NEW.status := OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reviews_guard_insert BEFORE INSERT ON public.reviews
FOR EACH ROW EXECUTE FUNCTION private.tg_reviews_guard();

CREATE TRIGGER reviews_guard_update BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION private.tg_reviews_guard();

CREATE POLICY "Approved reviews are public" ON public.reviews
FOR SELECT TO anon, authenticated USING (status = 'approved');

CREATE POLICY "Customers read own reviews" ON public.reviews
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admins read all reviews" ON public.reviews
FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers create own verified reviews" ON public.reviews
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND private.has_delivered_purchase(auth.uid(), product_id)
);

CREATE POLICY "Customers edit own reviews" ON public.reviews
FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins manage reviews" ON public.reviews
FOR UPDATE TO authenticated
USING (private.has_role(auth.uid(), 'admin'))
WITH CHECK (private.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete reviews" ON public.reviews
FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Review image storage policies (bucket created separately).
CREATE POLICY "Review images are readable" ON storage.objects
FOR SELECT USING (bucket_id = 'review-images');

CREATE POLICY "Customers upload own review images" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'review-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Customers delete own review images" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'review-images'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR private.has_role(auth.uid(), 'admin'))
);