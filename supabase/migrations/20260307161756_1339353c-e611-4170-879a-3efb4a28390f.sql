-- Allow deleting devices (needed for cleanup)
CREATE POLICY "Anyone can delete devices" ON public.devices
  FOR DELETE TO anon, authenticated USING (true);

-- Create cleanup function: delete devices without matching license for a given user
CREATE OR REPLACE FUNCTION public.cleanup_orphan_devices(p_user_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete activity_logs for orphan devices first (FK constraint)
  DELETE FROM public.activity_logs
  WHERE device_id IN (
    SELECT d.id FROM public.devices d
    WHERE d.user_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.licenses l WHERE l.device_id = d.id
    )
  );

  -- Delete camera_snapshots for orphan devices (FK constraint)
  DELETE FROM public.camera_snapshots
  WHERE device_id IN (
    SELECT d.id FROM public.devices d
    WHERE d.user_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.licenses l WHERE l.device_id = d.id
    )
  );

  -- Delete orphan devices
  DELETE FROM public.devices d
  WHERE d.user_id = p_user_id
  AND NOT EXISTS (
    SELECT 1 FROM public.licenses l WHERE l.device_id = d.id
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;