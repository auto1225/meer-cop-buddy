-- Create storage bucket for camera snapshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('camera-snapshots', 'camera-snapshots', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read camera snapshots
CREATE POLICY "Anyone can view camera snapshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'camera-snapshots');

-- Allow authenticated users to upload camera snapshots
CREATE POLICY "Anyone can upload camera snapshots"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'camera-snapshots');

-- Allow anyone to delete their snapshots
CREATE POLICY "Anyone can delete camera snapshots"
ON storage.objects FOR DELETE
USING (bucket_id = 'camera-snapshots');

-- Create table to track latest snapshot per device
CREATE TABLE IF NOT EXISTS public.camera_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.camera_snapshots ENABLE ROW LEVEL SECURITY;

-- Anyone can view snapshots
CREATE POLICY "Anyone can view camera snapshots"
ON public.camera_snapshots FOR SELECT
USING (true);

-- Anyone can insert snapshots
CREATE POLICY "Anyone can insert camera snapshots"
ON public.camera_snapshots FOR INSERT
WITH CHECK (true);

-- Anyone can delete snapshots
CREATE POLICY "Anyone can delete camera snapshots"
ON public.camera_snapshots FOR DELETE
USING (true);

-- Index for faster queries
CREATE INDEX idx_camera_snapshots_device_created 
ON public.camera_snapshots(device_id, created_at DESC);

-- Enable realtime for camera_snapshots
ALTER PUBLICATION supabase_realtime ADD TABLE public.camera_snapshots;