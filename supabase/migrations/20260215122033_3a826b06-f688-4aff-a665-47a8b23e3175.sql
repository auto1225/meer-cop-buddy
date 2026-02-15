-- Make camera-snapshots bucket private
UPDATE storage.buckets SET public = false WHERE id = 'camera-snapshots';

-- Drop overly permissive storage policies
DROP POLICY IF EXISTS "Anyone can view camera snapshots" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload camera snapshots" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete camera snapshots" ON storage.objects;

-- Add policies scoped to anon/authenticated (still open but explicit)
CREATE POLICY "Anon can view camera snapshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'camera-snapshots');

CREATE POLICY "Anon can upload camera snapshots"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'camera-snapshots');

CREATE POLICY "Anon can delete camera snapshots"
ON storage.objects FOR DELETE
USING (bucket_id = 'camera-snapshots');