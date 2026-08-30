CREATE TABLE public.saved_designs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color_name TEXT NOT NULL DEFAULT 'Black',
  placement TEXT NOT NULL DEFAULT 'Front',
  canvases JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_designs TO authenticated;
GRANT ALL ON public.saved_designs TO service_role;

ALTER TABLE public.saved_designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own designs" ON public.saved_designs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own designs" ON public.saved_designs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own designs" ON public.saved_designs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own designs" ON public.saved_designs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_saved_designs_updated_at BEFORE UPDATE ON public.saved_designs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();