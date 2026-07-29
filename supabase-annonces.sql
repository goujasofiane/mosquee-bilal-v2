-- À coller dans Supabase → SQL Editor → Run

CREATE TABLE IF NOT EXISTS public.annonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titre text NOT NULL,
  texte text NOT NULL,
  date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS annonces_date_desc_idx ON public.annonces (date DESC);

ALTER TABLE public.annonces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "annonces_public_select" ON public.annonces;
CREATE POLICY "annonces_public_select"
  ON public.annonces
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Insert / delete : uniquement via la clé service_role (API Vercel), pas via anon.
