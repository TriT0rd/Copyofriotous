DROP POLICY "Anyone can submit a custom design" ON public.design_submissions;
REVOKE INSERT ON public.design_submissions FROM anon;
REVOKE INSERT ON public.design_submissions FROM authenticated;