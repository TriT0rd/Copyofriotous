CREATE OR REPLACE FUNCTION private.tg_reviews_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  is_admin boolean := private.has_role(auth.uid(), 'admin');
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.updated_at := now();
    IF NOT is_admin THEN
      IF NEW.user_id <> auth.uid() THEN
        RAISE EXCEPTION 'Cannot create a review for another user';
      END IF;
      -- Verification is always derived server-side, never trusted from input.
      NEW.verified_purchase := private.has_delivered_purchase(NEW.user_id, NEW.product_id);
      NEW.order_id := CASE
        WHEN NEW.verified_purchase
          THEN private.delivered_order_for_product(NEW.user_id, NEW.product_id)
        ELSE NULL END;
      NEW.status := 'pending';
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
$function$;

CREATE OR REPLACE FUNCTION public.product_reviews_public(_product_id uuid)
RETURNS TABLE (
  id uuid,
  rating integer,
  title text,
  review text,
  images text[],
  verified_purchase boolean,
  created_at timestamptz,
  author_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.rating, r.title, r.review, r.images, r.verified_purchase, r.created_at,
         COALESCE(NULLIF(split_part(COALESCE(p.full_name, ''), ' ', 1), ''), 'Customer') AS author_name
  FROM public.reviews r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.product_id = _product_id
    AND r.status = 'approved'
  ORDER BY r.created_at DESC
  LIMIT 500
$$;

GRANT EXECUTE ON FUNCTION public.product_reviews_public(uuid) TO anon, authenticated, service_role;