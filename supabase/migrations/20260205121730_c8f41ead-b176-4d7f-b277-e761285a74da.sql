-- Create devices table for monitoring
CREATE TABLE public.devices (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id TEXT NOT NULL UNIQUE,
    device_name TEXT NOT NULL,
    device_type TEXT NOT NULL DEFAULT 'notebook',
    status TEXT NOT NULL DEFAULT 'offline',
    last_seen_at TIMESTAMP WITH TIME ZONE,
    battery_level INTEGER,
    is_charging BOOLEAN DEFAULT false,
    ip_address TEXT,
    os_info TEXT,
    app_version TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create activity_logs table for tracking device activities
CREATE TABLE public.activity_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE NOT NULL,
    event_type TEXT NOT NULL,
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Create public access policies (for smartphone app communication)
-- Anyone can read devices
CREATE POLICY "Anyone can view devices" 
ON public.devices 
FOR SELECT 
USING (true);

-- Anyone can insert new devices
CREATE POLICY "Anyone can register devices" 
ON public.devices 
FOR INSERT 
WITH CHECK (true);

-- Anyone can update devices (for status updates from smartphone app)
CREATE POLICY "Anyone can update devices" 
ON public.devices 
FOR UPDATE 
USING (true);

-- Activity logs policies
CREATE POLICY "Anyone can view activity logs" 
ON public.activity_logs 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create activity logs" 
ON public.activity_logs 
FOR INSERT 
WITH CHECK (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_devices_updated_at
BEFORE UPDATE ON public.devices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_devices_status ON public.devices(status);
CREATE INDEX idx_devices_last_seen ON public.devices(last_seen_at DESC);
CREATE INDEX idx_activity_logs_device ON public.activity_logs(device_id);
CREATE INDEX idx_activity_logs_created ON public.activity_logs(created_at DESC);

-- Enable realtime for devices table
ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;