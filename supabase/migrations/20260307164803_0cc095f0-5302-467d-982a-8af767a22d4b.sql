
-- Create public_profiles table
CREATE TABLE public.public_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.public_profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can view profiles
CREATE POLICY "Anyone can view public profiles"
  ON public.public_profiles FOR SELECT
  USING (true);

-- Anyone can insert their own profile
CREATE POLICY "Anyone can insert own profile"
  ON public.public_profiles FOR INSERT
  WITH CHECK (true);

-- Anyone can update their own profile
CREATE POLICY "Anyone can update own profile"
  ON public.public_profiles FOR UPDATE
  USING (true);

-- Make avatars bucket public
UPDATE storage.buckets SET public = true WHERE id = 'avatars';

-- Storage RLS: anyone can upload to avatars
CREATE POLICY "Anyone can upload avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars');

-- Storage RLS: anyone can update avatars
CREATE POLICY "Anyone can update avatars"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars');

-- Storage RLS: anyone can read avatars
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Storage RLS: anyone can delete their avatars
CREATE POLICY "Anyone can delete avatars"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars');
