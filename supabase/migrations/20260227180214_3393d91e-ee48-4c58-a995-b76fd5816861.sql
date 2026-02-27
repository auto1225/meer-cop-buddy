ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS is_monitoring boolean DEFAULT false;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS name text;