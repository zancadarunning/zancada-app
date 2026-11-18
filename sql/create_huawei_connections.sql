-- ============================================================================
-- huawei_connections: mismo rol que wahoo_connections / strava_connections.
-- Los access tokens de Huawei Health Kit vencen (alrededor de 1 hora), así que se guarda
-- el refresh_token y expires_at para poder renovarlos. Los tokens se guardan CIFRADOS
-- (api/_lib/token-crypto.js), igual que en las otras marcas.
--
-- Cómo correrlo: pegar este archivo entero en el SQL Editor de Supabase y ejecutarlo
-- una sola vez, DESPUÉS de que Huawei apruebe la solicitud de Health Service Kit
-- (hasta entonces la conexión queda apagada en la app y no hace falta la tabla).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.huawei_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  huawei_user_id text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at bigint NOT NULL,
  last_sync_at bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.huawei_connections ENABLE ROW LEVEL SECURITY;

-- Solo lectura y borrado de la fila propia (los tokens los escribe el servidor con la clave de servicio).
-- La app nunca selecciona las columnas de tokens: solo pregunta si existe la conexión.
DROP POLICY IF EXISTS "huawei_connections_select_own" ON public.huawei_connections;
CREATE POLICY "huawei_connections_select_own" ON public.huawei_connections
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "huawei_connections_delete_own" ON public.huawei_connections;
CREATE POLICY "huawei_connections_delete_own" ON public.huawei_connections
  FOR DELETE USING (auth.uid() = user_id);

-- Ningún rol de la app puede leer los tokens (mismo criterio que sql/harden_connection_tokens.sql): el navegador solo pregunta si hay conexión (user_id).
REVOKE SELECT ON public.huawei_connections FROM anon, authenticated;
GRANT  SELECT (user_id) ON public.huawei_connections TO authenticated;
