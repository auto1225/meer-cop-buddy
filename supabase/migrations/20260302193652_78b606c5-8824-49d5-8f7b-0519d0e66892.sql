
CREATE TABLE public.licenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  serial_key text NOT NULL,
  user_id text NOT NULL,
  device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  device_type text NOT NULL DEFAULT 'laptop',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(serial_key, device_type)
);

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view licenses" ON public.licenses FOR SELECT USING (true);
CREATE POLICY "Anyone can insert licenses" ON public.licenses FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update licenses" ON public.licenses FOR UPDATE USING (true);
