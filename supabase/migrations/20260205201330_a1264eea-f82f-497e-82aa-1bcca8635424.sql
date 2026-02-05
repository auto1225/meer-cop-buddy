-- Create webrtc_signaling table for peer connection signaling
CREATE TABLE public.webrtc_signaling (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('offer', 'answer', 'ice-candidate')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('broadcaster', 'viewer')),
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '5 minutes')
);

-- Create index for efficient querying
CREATE INDEX idx_webrtc_signaling_device_session ON public.webrtc_signaling(device_id, session_id);
CREATE INDEX idx_webrtc_signaling_expires ON public.webrtc_signaling(expires_at);

-- Enable RLS
ALTER TABLE public.webrtc_signaling ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (same device sharing)
CREATE POLICY "Allow all for authenticated users"
ON public.webrtc_signaling
FOR ALL
USING (true)
WITH CHECK (true);

-- Enable realtime for signaling
ALTER PUBLICATION supabase_realtime ADD TABLE public.webrtc_signaling;

-- Create function to clean up expired signaling data
CREATE OR REPLACE FUNCTION public.cleanup_expired_signaling()
RETURNS void AS $$
BEGIN
  DELETE FROM public.webrtc_signaling WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;