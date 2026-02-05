-- Add is_streaming_requested column to devices table
ALTER TABLE public.devices 
ADD COLUMN is_streaming_requested BOOLEAN DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.devices.is_streaming_requested IS 'Flag set by smartphone app to request laptop to start streaming';