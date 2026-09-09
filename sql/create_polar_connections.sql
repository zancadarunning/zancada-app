-- ============================================================================
-- polar_connections: guarda el token de acceso de Polar AccessLink por
-- usuario, mismo rol que strava_connections para Strava. A diferencia de
-- Strava, los access tokens de Polar no vencen (no hay refresh_token que
-- rotar), así que no hace falta una columna expires_at para renovarlos --
-- se guarda igual por si Polar cambia esa política más adelante.
--
-- member_id es el identificador que nosotros mismos elegimos al registrar
-- al usuario en la API de Polar (POST /v3/users, campo "member-id") -- lo
-- guardamos porque hace falta para poder des-registrar al usuario prolijo
-- si algún día hace falta (Polar no expone un DELETE por access_token).
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y
-- ejecutarlo una sola vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.polar_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  polar_user_id text NOT NULL,
  member_id text NOT NULL,
  access_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.polar_connections ENABLE ROW LEVEL SECURITY;

-- El cliente (con la clave anon) solo puede leer/borrar su propia fila --
-- igual que asumimos para strava_connections, ya que app.js la consulta
-- directo con supabaseClient.from('strava_connections')... en
-- updateStravaStatusDisplay(). Los inserts/updates reales los hace siempre
-- el backend con la service key (que salta RLS), nunca el cliente.
CREATE POLICY "polar_connections_select_own" ON public.polar_connections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "polar_connections_delete_own" ON public.polar_connections
  FOR DELETE USING (auth.uid() = user_id);
