-- Add network and camera connection status columns to devices table
ALTER TABLE public.devices 
ADD COLUMN IF NOT EXISTS is_network_connected boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_camera_connected boolean DEFAULT false;