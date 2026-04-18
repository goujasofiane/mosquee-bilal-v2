-- Coller tout ce fichier dans : Supabase → SQL Editor → New query → Run
-- Bucket utilisé par admin.html / index.html / mosquee.html : "images"
--
-- Si une politique du même nom existe déjà, supprimez-la ou renommez les lignes DROP ci-dessous.

-- Nettoyage optionnel (décommentez si vous aviez testé ces noms exacts)
-- DROP POLICY IF EXISTS "mosquee_images_authenticated_insert" ON storage.objects;
-- DROP POLICY IF EXISTS "mosquee_images_authenticated_update" ON storage.objects;
-- DROP POLICY IF EXISTS "mosquee_images_authenticated_delete" ON storage.objects;
-- DROP POLICY IF EXISTS "mosquee_images_public_select" ON storage.objects;

-- Upload : comptes connectés (page /admin après login)
CREATE POLICY "mosquee_images_authenticated_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'images');

-- Mise à jour (utile si vous ré-uploadez / upsert plus tard)
CREATE POLICY "mosquee_images_authenticated_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'images')
WITH CHECK (bucket_id = 'images');

-- Suppression depuis l’admin
CREATE POLICY "mosquee_images_authenticated_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'images');

-- Lecture / liste pour le site public (clé anon + signed URLs)
-- Si vous préférez limiter la lecture au seul bucket public, gardez cette policy.
CREATE POLICY "mosquee_images_public_select"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'images');
