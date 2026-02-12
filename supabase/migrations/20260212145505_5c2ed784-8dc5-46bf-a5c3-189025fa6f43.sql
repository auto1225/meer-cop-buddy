
-- Add location columns to devices table
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMP WITH TIME ZONE;
