-- ============================================================================
-- suunto_connections: mismo rol que wahoo_connections/strava_connections. Los
-- access tokens de Suunto vencen a las 24 hs (expires_in 86400), así que
-- guardamos refresh_token y expires_at para poder renovarlos.
--
-- suunto_username: el "user" que viene dentro del JWT del access_token (es el
-- usuario de la app Suunto). El webhook de Suunto avisa de un entrenamiento
-- nuevo con ese nombre de usuario (no con nuestro user_id), así que hace falta
-- poder buscar la conexión por él -- de ahí el índice.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y
-- ejecutarlo una sola vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.suunto_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  suunto_username text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS suunto_connections_username_idx
  ON public.suunto_connections (suunto_username);

ALTER TABLE public.suunto_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suunto_connections_select_own" ON public.suunto_connections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "suunto_connections_delete_own" ON public.suunto_connections
  FOR DELETE USING (auth.uid() = user_id);
