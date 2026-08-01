-- Mosquée Bilal — schéma admin v2 (à exécuter dans Supabase SQL Editor)

-- Catégories galerie
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  ordre int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS categories_ordre_idx ON public.categories (ordre);

-- Métadonnées photos (fichiers dans Storage bucket « galerie »)
CREATE TABLE IF NOT EXISTS public.galerie_photos (
  name text PRIMARY KEY,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS galerie_photos_cat_pos_idx
  ON public.galerie_photos (category_id, position);

-- Annonces : police + couleur
ALTER TABLE public.annonces ADD COLUMN IF NOT EXISTS police text DEFAULT 'Cairo';
ALTER TABLE public.annonces ADD COLUMN IF NOT EXISTS couleur text DEFAULT '#f5f0e1';

-- Pièces jointes annonces (Storage bucket « annonces-fichiers »)
CREATE TABLE IF NOT EXISTS public.annonce_fichiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annonce_id uuid NOT NULL REFERENCES public.annonces(id) ON DELETE CASCADE,
  path text NOT NULL,
  nom_original text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS annonce_fichiers_annonce_idx ON public.annonce_fichiers (annonce_id);

-- Logs admin (login + rate limit)
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text,
  date timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS admin_logs_ip_date_idx ON public.admin_logs (ip, date DESC);

-- Buckets Storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('galerie', 'galerie', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('annonces-fichiers', 'annonces-fichiers', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "galerie_public_select" ON storage.objects;
CREATE POLICY "galerie_public_select"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'galerie');

DROP POLICY IF EXISTS "annonces_fichiers_public_select" ON storage.objects;
CREATE POLICY "annonces_fichiers_public_select"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'annonces-fichiers');

-- Lecture publique tables
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.galerie_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.annonce_fichiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_public_select" ON public.categories;
CREATE POLICY "categories_public_select" ON public.categories FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "galerie_photos_public_select" ON public.galerie_photos;
CREATE POLICY "galerie_photos_public_select" ON public.galerie_photos FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "annonce_fichiers_public_select" ON public.annonce_fichiers;
CREATE POLICY "annonce_fichiers_public_select" ON public.annonce_fichiers FOR SELECT TO anon, authenticated USING (true);

-- Catégories par défaut
INSERT INTO public.categories (nom, ordre)
SELECT v.nom, v.ordre
FROM (VALUES
  ('Visualisation', 1),
  ('Intérieur', 2),
  ('Nos fêtes', 3)
) AS v(nom, ordre)
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.nom = v.nom);
