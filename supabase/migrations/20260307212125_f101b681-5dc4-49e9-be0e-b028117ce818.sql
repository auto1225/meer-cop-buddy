
-- Add device_name column to licenses table (SSOT for serial_key ↔ device_name mapping)
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS device_name text;

-- Migrate existing data: copy device_name from linked devices
UPDATE public.licenses l
SET device_name = d.device_name
FROM public.devices d
WHERE l.device_id = d.id
AND l.device_name IS NULL
AND d.device_name IS NOT NULL;
