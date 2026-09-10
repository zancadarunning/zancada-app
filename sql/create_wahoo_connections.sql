-- ============================================================================
-- wahoo_connections: mismo rol que strava_connections/polar_connections. A
-- diferencia de Polar, los access tokens de Wahoo SÍ vencen (2 horas), así que
-- guardamos refresh_token y expires_at para poder renovarlos, igual que Strava.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y
-- ejecutarlo una sola vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.wahoo_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wahoo_user_id text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wahoo_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wahoo_connections_select_own" ON public.wahoo_connections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "wahoo_connections_delete_own" ON public.wahoo_connections
  FOR DELETE USING (auth.uid() = user_id);
