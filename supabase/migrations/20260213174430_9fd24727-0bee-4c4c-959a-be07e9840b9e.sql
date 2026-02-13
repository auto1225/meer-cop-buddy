-- Drop existing restrictive policy on webrtc_signaling
DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.webrtc_signaling;

-- Create new policy allowing both anon and authenticated access
CREATE POLICY "Allow all for anon and authenticated users"
ON public.webrtc_signaling
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);
