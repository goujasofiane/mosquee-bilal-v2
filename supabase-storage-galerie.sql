-- Bucket Storage « galerie » (photos du site)
-- 1) Dans Supabase → Storage → New bucket → nom exact : galerie → Public bucket : OUI
-- 2) Exécutez ce SQL (politiques de lecture publique)

INSERT INTO storage.buckets (id, name, public)
VALUES ('galerie', 'galerie', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "galerie_public_select" ON storage.objects;
CREATE POLICY "galerie_public_select"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'galerie');

-- Upload / delete : via SUPABASE_SERVICE_ROLE_KEY dans /api/photos (bypass RLS)
