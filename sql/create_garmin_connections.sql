-- ============================================================================
-- garmin_connections: mismo rol que suunto_connections/coros_connections. Garmin Connect usa OAuth2 con PKCE y un secreto de la app (solo en el servidor).
--
-- access_token dura 24 h y refresh_token ~3 meses (se renueva en cada refresh), por eso expires_at y refresh_expires_at.
-- garmin_user_id: el "userId" de la API de Garmin (GET /partner-gateway/rest/user/id). Los webhooks avisan con ese id (no con el nuestro),
-- así que hace falta buscar la conexión por él -- de ahí el índice. No es único: una misma cuenta de Garmin puede conectarse a dos cuentas de Zancada.
-- permissions: los permisos que la persona aceptó (ACTIVITY_EXPORT, WORKOUT_IMPORT...) y que Garmin avisa cuando cambian.
--
-- Acceso: el cliente (clave anon) solo puede leer user_id, created_at y permissions de SU fila (el estado de la conexión). Los tokens y garmin_user_id nunca
-- salen al navegador: se revoca el SELECT general y se concede solo por columna. Los inserts/updates/borrados los hace el backend con la service key.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y ejecutarlo. Es seguro volver a correrlo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.garmin_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  garmin_user_id text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at bigint NOT NULL,
  refresh_expires_at bigint,
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS garmin_connections_garmin_user_id_idx
  ON public.garmin_connections (garmin_user_id);

ALTER TABLE public.garmin_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "garmin_connections_select_own" ON public.garmin_connections;
CREATE POLICY "garmin_connections_select_own" ON public.garmin_connections
  FOR SELECT USING (auth.uid() = user_id);

REVOKE ALL ON public.garmin_connections FROM anon, authenticated;
GRANT SELECT (user_id, created_at, permissions) ON public.garmin_connections TO authenticated;
