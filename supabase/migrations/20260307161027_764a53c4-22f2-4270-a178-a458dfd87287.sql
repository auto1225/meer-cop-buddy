CREATE TABLE public.app_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_code text NOT NULL,
  build_timestamp bigint NOT NULL,
  release_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view app versions" ON public.app_versions
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Anyone can insert app versions" ON public.app_versions
  FOR INSERT TO anon, authenticated WITH CHECK (true);
