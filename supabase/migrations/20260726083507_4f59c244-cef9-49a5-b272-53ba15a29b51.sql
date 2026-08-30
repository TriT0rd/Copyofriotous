CREATE TABLE public.design_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  customer_email text,
  customer_name text,
  color_name text NOT NULL,
  placement text NOT NULL,
  product_title text,
  variant_id text,
  price numeric,
  preview_data_url text,
  canvases jsonb,
  emailed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.design_submissions TO authenticated;
GRANT INSERT ON public.design_submissions TO anon;
GRANT ALL ON public.design_submissions TO service_role;

ALTER TABLE public.design_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a custom design"
ON public.design_submissions FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Users can view their own submissions"
ON public.design_submissions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all submissions"
ON public.design_submissions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_design_submissions_updated_at
BEFORE UPDATE ON public.design_submissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();