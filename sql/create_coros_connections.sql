-- ============================================================================
-- coros_connections: mismo rol que strava_connections/polar_connections/
-- wahoo_connections. COROS es distinto de los otros tres en cómo se autentica
-- (OAuth 2.1 + PKCE contra un servidor MCP, con registro dinámico de cliente
-- en vez de un client_id/secret fijo creado a mano en un panel de developers
-- -- ver el comentario grande en api/coros-init.js), pero una vez que el
-- usuario autorizó, el token que guardamos es igual de sensible que el de
-- cualquier otro reloj.
--
-- access_token/refresh_token vencen (a diferencia de Polar) -- por eso la
-- columna expires_at, igual que wahoo_connections.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y
-- ejecutarlo una sola vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.coros_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coros_connections ENABLE ROW LEVEL SECURITY;

-- El cliente (con la clave anon) solo puede leer/borrar su propia fila, igual
-- que las otras 3 tablas de conexiones -- los inserts/updates reales los hace
-- siempre el backend con la service key (que salta RLS), nunca el cliente.
CREATE POLICY "coros_connections_select_own" ON public.coros_connections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "coros_connections_delete_own" ON public.coros_connections
  FOR DELETE USING (auth.uid() = user_id);
